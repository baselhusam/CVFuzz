from __future__ import annotations

import shutil
import subprocess
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from cvfuzz.config import CVFuzzConfig, TransformConfig
from cvfuzz.exceptions import CVFuzzError
from cvfuzz.failures import FailureDetector
from cvfuzz.models.base import Detector
from cvfuzz.transforms import TransformContext, get_transform
from cvfuzz.types import Detection
from cvfuzz.video_storage import VideoRunStore

_COLORS = (
    (98, 236, 156),
    (84, 180, 255),
    (244, 202, 85),
    (255, 116, 94),
    (220, 140, 255),
)


@dataclass(slots=True)
class StreamMetrics:
    transform: str
    label: str
    parameters: dict[str, Any]
    frames: int = 0
    detections: int = 0
    confidence_sum: float = 0.0
    baseline_objects: int = 0
    stable_objects: int = 0
    failures: int = 0
    affected_frames: int = 0
    first_failure_seconds: float | None = None
    inference_ms: float = 0.0
    failures_by_kind: Counter[str] = field(default_factory=Counter)
    timeline: list[dict[str, Any]] = field(default_factory=list)

    def record(
        self,
        *,
        frame_index: int,
        timestamp: float,
        detections: list[Detection],
        baseline_count: int,
        failures: Counter[str],
        inference_ms: float,
        include_timeline: bool,
    ) -> None:
        failure_count = sum(failures.values())
        stable = max(0, baseline_count - failure_count)
        self.frames += 1
        self.detections += len(detections)
        self.confidence_sum += sum(item.confidence for item in detections)
        self.baseline_objects += baseline_count
        self.stable_objects += stable
        self.failures += failure_count
        self.inference_ms += inference_ms
        self.failures_by_kind.update(failures)
        if failure_count:
            self.affected_frames += 1
            if self.first_failure_seconds is None:
                self.first_failure_seconds = timestamp
        if include_timeline:
            retention = (stable / baseline_count * 100) if baseline_count else 100.0
            self.timeline.append(
                {
                    "frame": frame_index,
                    "timestamp_seconds": round(timestamp, 3),
                    "retention": round(retention, 2),
                    "failures": failure_count,
                }
            )

    def to_dict(self, baseline_confidence: float) -> dict[str, Any]:
        mean_confidence = self.confidence_sum / self.detections if self.detections else 0.0
        retention = (
            self.stable_objects / self.baseline_objects * 100 if self.baseline_objects else 100.0
        )
        return {
            "id": self.transform,
            "name": self.label,
            "parameters": self.parameters,
            "frames": self.frames,
            "detections": self.detections,
            "mean_confidence": round(mean_confidence * 100, 2),
            "confidence_delta": round((mean_confidence - baseline_confidence) * 100, 2),
            "retention": round(retention, 2),
            "failures": self.failures,
            "affected_frames": self.affected_frames,
            "first_failure_seconds": (
                round(self.first_failure_seconds, 3)
                if self.first_failure_seconds is not None
                else None
            ),
            "mean_inference_ms": round(self.inference_ms / self.frames, 2) if self.frames else 0,
            "failures_by_kind": dict(self.failures_by_kind),
            "timeline": self.timeline,
        }


class BrowserVideoWriter:
    """Write frames once, then produce a browser-compatible H.264 MP4 when ffmpeg exists."""

    def __init__(self, output: Path, *, fps: float, size: tuple[int, int]) -> None:
        self.output = output
        self.ffmpeg = shutil.which("ffmpeg")
        self.working = output.with_suffix(".working.avi") if self.ffmpeg else output
        codec = "MJPG" if self.ffmpeg else "mp4v"
        self.writer = cv2.VideoWriter(str(self.working), cv2.VideoWriter_fourcc(*codec), fps, size)
        if not self.writer.isOpened():
            raise CVFuzzError(f"Could not create output video: {output}")

    def write(self, frame: np.ndarray) -> None:
        self.writer.write(frame)

    def finish(self) -> None:
        self.writer.release()
        if not self.ffmpeg:
            return
        try:
            subprocess.run(
                [
                    self.ffmpeg,
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(self.working),
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "20",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    str(self.output),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            raise CVFuzzError(
                f"ffmpeg could not finalize {self.output.name}: {exc.stderr}"
            ) from exc
        finally:
            self.working.unlink(missing_ok=True)


def _display_name(name: str) -> str:
    return name.replace("_", " ").title()


def _annotate(image: np.ndarray, detections: list[Detection], *, stream_label: str) -> np.ndarray:
    output = image.copy()
    height, width = output.shape[:2]
    overlay = output.copy()
    cv2.rectangle(overlay, (0, 0), (width, 36), (8, 13, 10), thickness=-1)
    cv2.addWeighted(overlay, 0.72, output, 0.28, 0, output)
    cv2.putText(
        output,
        f"CVFUZZ  |  {stream_label.upper()}  |  {len(detections)} DETECTIONS",
        (12, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (156, 236, 98),
        1,
        cv2.LINE_AA,
    )
    for detection in detections:
        color = _COLORS[detection.class_id % len(_COLORS)]
        x1, y1, x2, y2 = (
            int(np.clip(value, 0, limit - 1))
            for value, limit in zip(detection.box, (width, height, width, height), strict=True)
        )
        cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.class_name} {detection.confidence:.2f}"
        (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        label_top = max(36, y1 - text_height - 8)
        cv2.rectangle(
            output,
            (x1, label_top),
            (min(width - 1, x1 + text_width + 8), label_top + text_height + 8),
            color,
            thickness=-1,
        )
        cv2.putText(
            output,
            label,
            (x1 + 4, label_top + text_height + 3),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (12, 16, 13),
            1,
            cv2.LINE_AA,
        )
    return output


def _apply_transform(
    image: np.ndarray,
    config: TransformConfig,
    baselines: list[Detection],
    *,
    seed: int,
) -> np.ndarray:
    transform = get_transform(config.name)
    parameters = transform.normalize_parameters(config.video_parameters())
    if not config.target_aware:
        return transform.apply(image, parameters, TransformContext(seed=seed))
    output = image.copy()
    for target_index, baseline in enumerate(baselines):
        output = transform.apply(
            output,
            parameters,
            TransformContext(seed=seed + target_index, target_box=baseline.box),
        )
    return output


def _predict(detector: Detector, image: np.ndarray) -> tuple[list[Detection], float]:
    started = time.perf_counter()
    detections = detector.predict(image)
    return detections, (time.perf_counter() - started) * 1000


class VideoEvaluationRunner:
    """Render and evaluate the original plus one full video per enabled transform."""

    def __init__(
        self,
        detector: Detector,
        config: CVFuzzConfig,
        store: VideoRunStore,
    ) -> None:
        self.detector = detector
        self.config = config
        self.store = store
        self.failure_detector = FailureDetector(config.failure)

    def run(self, source: str | Path) -> Path:
        source_path = Path(source).expanduser().resolve()
        capture = cv2.VideoCapture(str(source_path))
        if not capture.isOpened():
            raise CVFuzzError(f"Could not open video: {source_path}")
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        declared_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if fps <= 0 or width <= 0 or height <= 0:
            capture.release()
            raise CVFuzzError("The uploaded video has invalid frame rate or dimensions")

        transforms = self.config.enabled_transforms
        writers: dict[str, BrowserVideoWriter] = {}
        metrics = {
            item.name: StreamMetrics(
                transform=item.name,
                label=_display_name(item.name),
                parameters=get_transform(item.name).normalize_parameters(item.video_parameters()),
            )
            for item in transforms
        }
        baseline_confidence_sum = 0.0
        baseline_detections = 0
        baseline_inference_ms = 0.0
        frames = 0
        timeline_stride = max(1, declared_frames // 80)
        artifact_specs = [
            ("original", "Original + inference", {}, self.store.artifacts_path / "original.mp4")
        ] + [
            (
                item.name,
                _display_name(item.name),
                metrics[item.name].parameters,
                self.store.artifacts_path / f"{item.name}.mp4",
            )
            for item in transforms
        ]

        try:
            writers = {
                artifact_id: BrowserVideoWriter(path, fps=fps, size=(width, height))
                for artifact_id, _, _, path in artifact_specs
            }
            self.store.update(
                status="running",
                progress=1,
                stage="Running baseline and augmented inference",
                model={
                    **self.store.read_manifest().get("model", {}),
                    **self.detector.identity,
                },
                source={
                    "name": source_path.name,
                    "fps": round(fps, 3),
                    "width": width,
                    "height": height,
                    "declared_frames": declared_frames,
                },
                transform_count=len(transforms),
            )
            last_progress = -1
            while True:
                success, image = capture.read()
                if not success:
                    break
                timestamp = frames / fps
                baselines_raw, inference_ms = _predict(self.detector, image)
                baselines = [
                    item
                    for item in baselines_raw
                    if item.confidence >= self.config.run.baseline_confidence
                ]
                baseline_inference_ms += inference_ms
                baseline_detections += len(baselines)
                baseline_confidence_sum += sum(item.confidence for item in baselines)
                writers["original"].write(
                    _annotate(image, baselines, stream_label="Original inference")
                )
                frame_results: dict[str, Any] = {}

                for transform_index, transform_config in enumerate(transforms):
                    transformed = _apply_transform(
                        image,
                        transform_config,
                        baselines,
                        seed=self.config.run.seed + frames * 10_007 + transform_index * 101,
                    )
                    predictions, transform_inference_ms = _predict(self.detector, transformed)
                    visible_predictions = [
                        item
                        for item in predictions
                        if item.confidence >= self.config.failure.missed_below_confidence
                    ]
                    failures: Counter[str] = Counter()
                    for baseline in baselines:
                        failure = self.failure_detector.evaluate(baseline, predictions)
                        if failure:
                            failures[failure.kind] += 1
                    writers[transform_config.name].write(
                        _annotate(
                            transformed,
                            visible_predictions,
                            stream_label=_display_name(transform_config.name),
                        )
                    )
                    stream_metrics = metrics[transform_config.name]
                    stream_metrics.record(
                        frame_index=frames,
                        timestamp=timestamp,
                        detections=visible_predictions,
                        baseline_count=len(baselines),
                        failures=failures,
                        inference_ms=transform_inference_ms,
                        include_timeline=frames % timeline_stride == 0,
                    )
                    frame_results[transform_config.name] = {
                        "detections": len(visible_predictions),
                        "failures": sum(failures.values()),
                        "failures_by_kind": dict(failures),
                    }

                self.store.append_frame(
                    {
                        "schema_version": 1,
                        "frame": frames,
                        "timestamp_seconds": round(timestamp, 3),
                        "baseline_detections": len(baselines),
                        "transforms": frame_results,
                    }
                )
                frames += 1
                progress = (
                    min(94, 2 + round(frames / declared_frames * 92))
                    if declared_frames > 0
                    else min(94, 2 + frames // 5)
                )
                if progress != last_progress:
                    self.store.update(
                        status="running",
                        progress=progress,
                        stage=f"Processed frame {frames}"
                        + (f" of {declared_frames}" if declared_frames else ""),
                    )
                    last_progress = progress

            if frames == 0:
                raise CVFuzzError("The uploaded video did not contain any decodable frames")
            self.store.update(
                status="running",
                progress=95,
                stage="Encoding browser-ready result videos",
            )
            for writer in writers.values():
                writer.finish()
            writers.clear()
        except Exception as exc:
            for writer in writers.values():
                writer.writer.release()
                writer.working.unlink(missing_ok=True)
            self.store.fail(str(exc))
            raise
        finally:
            capture.release()

        baseline_mean = (
            baseline_confidence_sum / baseline_detections if baseline_detections else 0.0
        )
        transform_metrics = [metrics[item.name].to_dict(baseline_mean) for item in transforms]
        artifacts = [
            {
                "id": artifact_id,
                "name": label,
                "kind": "original" if artifact_id == "original" else "augmentation",
                "parameters": parameters,
                "path": str(path.relative_to(self.store.path)),
                "bytes": path.stat().st_size,
            }
            for artifact_id, label, parameters, path in artifact_specs
        ]
        robustness_score = (
            sum(item["retention"] for item in transform_metrics) / len(transform_metrics)
            if transform_metrics
            else 100.0
        )
        weakest = min(transform_metrics, key=lambda item: item["retention"], default=None)
        result_metrics = {
            "schema_version": 2,
            "frames_analyzed": frames,
            "video_duration_seconds": round(frames / fps, 3),
            "fps": round(fps, 3),
            "resolution": {"width": width, "height": height},
            "baseline": {
                "detections": baseline_detections,
                "mean_confidence": round(baseline_mean * 100, 2),
                "mean_inference_ms": round(baseline_inference_ms / frames, 2),
            },
            "robustness_score": round(robustness_score, 2),
            "total_failures": sum(item["failures"] for item in transform_metrics),
            "weakest_transform": weakest["id"] if weakest else None,
            "transforms": transform_metrics,
        }
        self.store.complete(result_metrics, artifacts)
        return self.store.path
