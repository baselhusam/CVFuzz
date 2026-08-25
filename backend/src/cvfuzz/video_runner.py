from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from functools import cache
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


@dataclass(slots=True)
class BaselineFrame:
    index: int
    timestamp: float
    detections: list[Detection]
    inference_ms: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BaselineFrame:
        return cls(
            index=int(data["frame"]),
            timestamp=float(data["timestamp_seconds"]),
            detections=[
                Detection(
                    box=tuple(float(value) for value in item["box"]),  # type: ignore[arg-type]
                    class_id=int(item["class_id"]),
                    class_name=str(item["class_name"]),
                    confidence=float(item["confidence"]),
                )
                for item in data["detections"]
            ],
            inference_ms=float(data["inference_ms"]),
        )


@cache
def _ffmpeg_encoders(ffmpeg: str) -> frozenset[str]:
    """Read encoders once per ffmpeg executable so codec choice stays inexpensive."""
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return frozenset()
    return frozenset(
        parts[1]
        for line in result.stdout.splitlines()
        if len(parts := line.split()) >= 2 and parts[0].startswith("V")
    )


def _software_encoder(encoders: frozenset[str]) -> str:
    return "libx264" if "libx264" in encoders else "mpeg4"


def _preferred_encoder(encoders: frozenset[str], platform_name: str | None = None) -> str:
    """Use a native encoder only where it is a reliable local default."""
    if (platform_name or sys.platform) == "darwin" and "h264_videotoolbox" in encoders:
        return "h264_videotoolbox"
    return _software_encoder(encoders)


def _encoder_options(encoder: str) -> list[str]:
    if encoder == "libx264":
        return ["-preset", "veryfast", "-crf", "20"]
    if encoder == "h264_videotoolbox":
        return ["-realtime", "true", "-prio_speed", "true"]
    return ["-q:v", "3"]


class BrowserVideoWriter:
    """Write frames once, then produce a browser-compatible MP4 on every platform."""

    def __init__(self, output: Path, *, fps: float, size: tuple[int, int]) -> None:
        self.output = output
        self.ffmpeg = shutil.which("ffmpeg")
        self.working = output.with_suffix(".working.avi") if self.ffmpeg else output
        codec = "MJPG" if self.ffmpeg else "mp4v"
        self.encoders = _ffmpeg_encoders(self.ffmpeg) if self.ffmpeg else frozenset()
        self.encoder = _preferred_encoder(self.encoders) if self.ffmpeg else None
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
            candidates = [self.encoder, _software_encoder(self.encoders)]
            errors: list[str] = []
            for encoder in dict.fromkeys(candidates):
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
                            encoder,
                            *_encoder_options(encoder),
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
                    return
                except subprocess.CalledProcessError as exc:
                    errors.append(f"{encoder}: {exc.stderr.strip()}")
            raise CVFuzzError(
                f"ffmpeg could not finalize {self.output.name}: {'; '.join(errors)}"
            )
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


def _predict_batch(
    detector: Detector,
    images: list[np.ndarray],
    *,
    image_size: tuple[int, int],
) -> list[tuple[list[Detection], float]]:
    """Predict ordered frames together, with a safe per-frame adapter fallback."""
    if not images:
        return []
    started = time.perf_counter()
    batch_predict = getattr(detector, "predict_batch", None)
    if callable(batch_predict):
        predictions = batch_predict(images, image_size=image_size)
    else:
        predictions = [detector.predict(image) for image in images]
    if len(predictions) != len(images):
        raise CVFuzzError("Detector returned an unexpected number of frame predictions")
    per_frame_ms = (time.perf_counter() - started) * 1000 / len(images)
    return [(detections, per_frame_ms) for detections in predictions]


class VideoEvaluationRunner:
    """Create an original baseline, then render and evaluate each augmentation in one pass."""

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
        fps, width, height, declared_frames = self._video_info(source_path)
        inference_image_size = self._inference_image_size(width, height)
        transforms = self.config.enabled_transforms
        metrics = {
            item.name: StreamMetrics(
                transform=item.name,
                label=_display_name(item.name),
                parameters=get_transform(item.name).normalize_parameters(item.video_parameters()),
            )
            for item in transforms
        }
        timeline_stride = max(1, declared_frames // 80)
        stage_total = len(transforms) + 1
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
            self.store.update(
                status="running",
                progress=1,
                stage="Preparing staged video evaluation",
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
                inference={
                    "batch_size": self.config.run.inference_batch_size,
                    "image_size": {
                        "width": inference_image_size[1],
                        "height": inference_image_size[0],
                    },
                },
                transform_count=len(transforms),
                phase="preparing",
                stage_index=0,
                stage_total=stage_total,
            )
            frame_records, baseline_detections, baseline_confidence_sum, baseline_inference_ms = (
                self._capture_baseline_and_render_original(
                    source_path,
                    output=self.store.artifacts_path / "original.mp4",
                    fps=fps,
                    size=(width, height),
                    declared_frames=declared_frames,
                    inference_image_size=inference_image_size,
                    stage_index=1,
                    stage_total=stage_total,
                )
            )
            for transform_index, transform_config in enumerate(transforms):
                self._render_and_evaluate_augmentation(
                    source_path,
                    transform_config,
                    output=self.store.artifacts_path / f"{transform_config.name}.mp4",
                    metrics=metrics[transform_config.name],
                    frame_records=frame_records,
                    fps=fps,
                    size=(width, height),
                    declared_frames=declared_frames,
                    inference_image_size=inference_image_size,
                    timeline_stride=timeline_stride,
                    stage_index=transform_index + 2,
                    stage_total=stage_total,
                )
            self.store.write_frames(frame_records)
        except Exception as exc:
            self.store.fail(str(exc))
            raise

        frames = len(frame_records)
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
        failure_events_by_kind: Counter[str] = Counter()
        for item in transform_metrics:
            failure_events_by_kind.update(item["failures_by_kind"])
        result_metrics = {
            "schema_version": 3,
            "frames_analyzed": frames,
            "video_duration_seconds": round(frames / fps, 3),
            "fps": round(fps, 3),
            "resolution": {"width": width, "height": height},
            "inference": {
                "batch_size": self.config.run.inference_batch_size,
                "image_size": {
                    "width": inference_image_size[1],
                    "height": inference_image_size[0],
                },
            },
            "baseline": {
                "detections": baseline_detections,
                "mean_confidence": round(baseline_mean * 100, 2),
                "mean_inference_ms": round(baseline_inference_ms / frames, 2),
            },
            "robustness_score": round(robustness_score, 2),
            "total_failures": sum(item["failures"] for item in transform_metrics),
            "failure_events_by_kind": dict(sorted(failure_events_by_kind.items())),
            "timeline_sample_every_n_frames": timeline_stride,
            "weakest_transform": weakest["id"] if weakest else None,
            "transforms": transform_metrics,
        }
        self.store.complete(result_metrics, artifacts)
        return self.store.path

    @staticmethod
    def _video_info(source: Path) -> tuple[float, int, int, int]:
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise CVFuzzError(f"Could not open video: {source}")
        try:
            fps = float(capture.get(cv2.CAP_PROP_FPS))
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        finally:
            capture.release()
        if fps <= 0 or width <= 0 or height <= 0:
            raise CVFuzzError("The uploaded video has invalid frame rate or dimensions")
        return fps, width, height, frames

    def _inference_image_size(self, width: int, height: int) -> tuple[int, int]:
        requested = self.config.run.inference_image_size
        size = (height, width) if requested is None else (requested, requested)
        normalize_size = getattr(self.detector, "normalize_image_size", None)
        return normalize_size(size) if callable(normalize_size) else size

    def _update_stage(
        self,
        *,
        phase: str,
        label: str,
        stage_index: int,
        stage_total: int,
        phase_stage_index: int,
        phase_stage_total: int,
        completion: float,
    ) -> None:
        overall = 2 + round(((stage_index - 1) + min(1.0, completion)) / stage_total * 96)
        self.store.update(
            status="running",
            progress=min(98, overall),
            stage=label,
            phase=phase,
            stage_index=stage_index,
            stage_total=stage_total,
            phase_stage_index=phase_stage_index,
            phase_stage_total=phase_stage_total,
            stage_progress=round(min(1.0, completion) * 100),
        )

    def _stage_reporter(
        self,
        *,
        phase: str,
        label: str,
        stage_index: int,
        stage_total: int,
        phase_stage_index: int,
        phase_stage_total: int,
        declared_frames: int,
    ) -> Any:
        last_percent = -1

        def report(frames: int) -> None:
            nonlocal last_percent
            completion = frames / declared_frames if declared_frames else 0.0
            percent = min(100, round(completion * 100))
            if percent == last_percent:
                return
            self._update_stage(
                phase=phase,
                label=label,
                stage_index=stage_index,
                stage_total=stage_total,
                phase_stage_index=phase_stage_index,
                phase_stage_total=phase_stage_total,
                completion=completion,
            )
            last_percent = percent

        self._update_stage(
            phase=phase,
            label=label,
            stage_index=stage_index,
            stage_total=stage_total,
            phase_stage_index=phase_stage_index,
            phase_stage_total=phase_stage_total,
            completion=0,
        )
        return report

    def _capture_baseline_and_render_original(
        self,
        source: Path,
        *,
        output: Path,
        fps: float,
        size: tuple[int, int],
        declared_frames: int,
        inference_image_size: tuple[int, int],
        stage_index: int,
        stage_total: int,
    ) -> tuple[list[dict[str, Any]], int, float, float]:
        label = "Capturing baseline and rendering original"
        report = self._stage_reporter(
            phase="baseline",
            label=label,
            stage_index=stage_index,
            stage_total=stage_total,
            phase_stage_index=1,
            phase_stage_total=stage_total,
            declared_frames=declared_frames,
        )
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise CVFuzzError(f"Could not open video: {source}")
        writer = BrowserVideoWriter(output, fps=fps, size=size)
        records: list[dict[str, Any]] = []
        detections = 0
        confidence_sum = 0.0
        inference_ms = 0.0
        frames = 0
        try:
            while True:
                images: list[np.ndarray] = []
                while len(images) < self.config.run.inference_batch_size:
                    success, image = capture.read()
                    if not success:
                        break
                    images.append(image)
                if not images:
                    break
                for image, (predictions, frame_inference_ms) in zip(
                    images,
                    _predict_batch(
                        self.detector, images, image_size=inference_image_size
                    ),
                    strict=True,
                ):
                    baseline = [
                        item
                        for item in predictions
                        if item.confidence >= self.config.run.baseline_confidence
                    ]
                    self.store.append_baseline(
                        {
                            "frame": frames,
                            "timestamp_seconds": round(frames / fps, 3),
                            "detections": [item.to_dict() for item in baseline],
                            "inference_ms": round(frame_inference_ms, 4),
                        }
                    )
                    writer.write(_annotate(image, baseline, stream_label="Original inference"))
                    detections += len(baseline)
                    confidence_sum += sum(item.confidence for item in baseline)
                    inference_ms += frame_inference_ms
                    records.append(
                        {
                            "schema_version": 1,
                            "frame": frames,
                            "timestamp_seconds": round(frames / fps, 3),
                            "baseline_detections": len(baseline),
                            "transforms": {},
                        }
                    )
                    frames += 1
                    report(frames)
            if frames == 0:
                raise CVFuzzError("The uploaded video did not contain any decodable frames")
            writer.finish()
            self.store.publish_artifact(
                {
                    "id": "original",
                    "name": "Original + inference",
                    "kind": "original",
                    "parameters": {},
                    "path": str(output.relative_to(self.store.path)),
                    "bytes": output.stat().st_size,
                }
            )
        except Exception:
            writer.writer.release()
            writer.working.unlink(missing_ok=True)
            raise
        finally:
            capture.release()
        return records, detections, confidence_sum, inference_ms

    def _render_and_evaluate_augmentation(
        self,
        source: Path,
        config: TransformConfig,
        *,
        output: Path,
        metrics: StreamMetrics,
        frame_records: list[dict[str, Any]],
        fps: float,
        size: tuple[int, int],
        declared_frames: int,
        inference_image_size: tuple[int, int],
        timeline_stride: int,
        stage_index: int,
        stage_total: int,
    ) -> None:
        phase_index = list(self.config.enabled_transforms).index(config) + 1
        label = (
            f"Processing augmentation {phase_index} of {len(self.config.enabled_transforms)}: "
            f"{_display_name(config.name)}"
        )
        report = self._stage_reporter(
            phase="processing",
            label=label,
            stage_index=stage_index,
            stage_total=stage_total,
            phase_stage_index=phase_index,
            phase_stage_total=len(self.config.enabled_transforms),
            declared_frames=declared_frames,
        )
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise CVFuzzError(f"Could not open video: {source}")
        writer = BrowserVideoWriter(output, fps=fps, size=size)
        references = self._baseline_frames()
        frames = 0
        try:
            while True:
                batch: list[tuple[int, list[Detection], np.ndarray]] = []
                while len(batch) < self.config.run.inference_batch_size:
                    success, image = capture.read()
                    if not success:
                        break
                    frame_index = frames + len(batch)
                    baselines = self._next_baseline(references, frame_index)
                    transformed = _apply_transform(
                        image,
                        config,
                        baselines,
                        seed=(
                            self.config.run.seed
                            + frame_index * 10_007
                            + (phase_index - 1) * 101
                        ),
                    )
                    batch.append((frame_index, baselines, transformed))
                if not batch:
                    break
                predictions_by_frame = _predict_batch(
                    self.detector,
                    [item[2] for item in batch],
                    image_size=inference_image_size,
                )
                for (frame_index, baselines, transformed), (
                    predictions,
                    transform_inference_ms,
                ) in zip(batch, predictions_by_frame, strict=True):
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
                    writer.write(
                        _annotate(
                            transformed,
                            visible_predictions,
                            stream_label=_display_name(config.name),
                        )
                    )
                    metrics.record(
                        frame_index=frame_index,
                        timestamp=frame_index / fps,
                        detections=visible_predictions,
                        baseline_count=len(baselines),
                        failures=failures,
                        inference_ms=transform_inference_ms,
                        include_timeline=frame_index % timeline_stride == 0,
                    )
                    if frame_index >= len(frame_records):
                        raise CVFuzzError(
                            f"Generated {config.name} video has more frames than the source"
                        )
                    frame_records[frame_index]["transforms"][config.name] = {
                        "detections": len(visible_predictions),
                        "failures": sum(failures.values()),
                        "failures_by_kind": dict(failures),
                    }
                    frames += 1
                    report(frames)
            if frames != len(frame_records):
                raise CVFuzzError(
                    f"Generated {config.name} video does not match the source frame count"
                )
            self._ensure_no_remaining_baselines(references)
            writer.finish()
            self.store.publish_artifact(
                {
                    "id": config.name,
                    "name": _display_name(config.name),
                    "kind": "augmentation",
                    "parameters": metrics.parameters,
                    "path": str(output.relative_to(self.store.path)),
                    "bytes": output.stat().st_size,
                }
            )
        except Exception:
            writer.writer.release()
            writer.working.unlink(missing_ok=True)
            raise
        finally:
            capture.release()

    def _baseline_frames(self) -> Iterator[BaselineFrame]:
        if not self.store.references_path.is_file():
            raise CVFuzzError("Baseline reference data was not created")
        with self.store.references_path.open(encoding="utf-8") as stream:
            for line in stream:
                if line.strip():
                    yield BaselineFrame.from_dict(json.loads(line))

    def _next_baseline(self, references: Iterator[BaselineFrame], frame: int) -> list[Detection]:
        try:
            baseline = next(references)
        except StopIteration as exc:
            raise CVFuzzError("Baseline reference data ended before the video") from exc
        if baseline.index != frame:
            raise CVFuzzError("Baseline reference data is out of sequence")
        return baseline.detections

    @staticmethod
    def _ensure_no_remaining_baselines(references: Iterator[BaselineFrame]) -> None:
        try:
            next(references)
        except StopIteration:
            return
        raise CVFuzzError("Baseline reference data has more frames than the video")
