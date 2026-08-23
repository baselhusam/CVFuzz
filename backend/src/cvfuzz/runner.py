from __future__ import annotations

import json
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path
from typing import Any

from cvfuzz.config import CVFuzzConfig, TransformConfig
from cvfuzz.failures import FailureDetector
from cvfuzz.media import iter_frames
from cvfuzz.models.base import Detector
from cvfuzz.search import BoundarySearcher
from cvfuzz.storage import RunStore
from cvfuzz.transforms import TransformContext, get_transform
from cvfuzz.types import BoundaryResult, Detection, Frame

ProgressCallback = Callable[[dict[str, Any]], None]


def _cache_key(parameters: dict[str, Any], target_index: int | None) -> str:
    return json.dumps([target_index, parameters], sort_keys=True, separators=(",", ":"))


class FuzzRunner:
    def __init__(
        self,
        detector: Detector,
        config: CVFuzzConfig,
        *,
        progress: ProgressCallback | None = None,
    ) -> None:
        self.detector = detector
        self.config = config
        self.progress = progress or (lambda event: None)
        self.failure_detector = FailureDetector(config.failure)
        self.searcher = BoundarySearcher(config.boundary)

    def run(self, source: str | Path) -> Path:
        source_path = Path(source)
        store = RunStore(
            self.config.run.output_dir,
            model=self.detector.identity,
            source=source_path,
            config=self.config.raw,
        )
        summary: dict[str, Any] = {
            "frames_analyzed": 0,
            "baseline_objects": 0,
            "searches": 0,
            "boundaries_found": 0,
            "failures_by_kind": Counter(),
            "failures_by_transform": Counter(),
        }
        self.progress({"type": "run_started", "run_id": store.run_id, "path": str(store.path)})
        try:
            frames = iter_frames(
                source_path,
                sample_every_n_frames=self.config.run.sample_every_n_frames,
                max_frames=self.config.run.max_frames,
            )
            for frame in frames:
                self._process_frame(frame, store, summary)
            summary["failures_by_kind"] = dict(summary["failures_by_kind"])
            summary["failures_by_transform"] = dict(summary["failures_by_transform"])
            store.complete(summary)
        except Exception as exc:
            store.fail(str(exc))
            raise
        self.progress({"type": "run_completed", "run_id": store.run_id, "path": str(store.path)})
        return store.path

    def _process_frame(self, frame: Frame, store: RunStore, summary: dict[str, Any]) -> None:
        detections = [
            detection
            for detection in self.detector.predict(frame.image)
            if detection.confidence >= self.config.run.baseline_confidence
        ]
        summary["frames_analyzed"] += 1
        summary["baseline_objects"] += len(detections)
        self.progress(
            {
                "type": "frame_started",
                "frame": frame.index,
                "objects": len(detections),
            }
        )
        for transform_config in self.config.enabled_transforms:
            self._process_transform(frame, detections, transform_config, store, summary)

    def _process_transform(
        self,
        frame: Frame,
        baselines: list[Detection],
        transform_config: TransformConfig,
        store: RunStore,
        summary: dict[str, Any],
    ) -> None:
        transform = get_transform(transform_config.name)
        prediction_cache: dict[str, tuple[list[Detection], Any, dict[str, Any]]] = {}

        for target_index, baseline in enumerate(baselines):
            for variant_index, levels in enumerate(transform_config.series()):

                def evaluate(
                    parameters: dict[str, Any],
                    *,
                    target_index: int = target_index,
                    baseline: Detection = baseline,
                    transform_config: TransformConfig = transform_config,
                ):
                    normalized = transform.normalize_parameters(parameters)
                    cache_target = target_index if transform_config.target_aware else None
                    key = _cache_key(normalized, cache_target)
                    if key not in prediction_cache:
                        context = TransformContext(
                            seed=self.config.run.seed,
                            target_box=baseline.box if transform_config.target_aware else None,
                        )
                        transformed_image = transform.apply(frame.image, normalized, context)
                        predictions = self.detector.predict(transformed_image)
                        prediction_cache[key] = (predictions, transformed_image, normalized)
                    return self.failure_detector.evaluate(baseline, prediction_cache[key][0])

                result = self.searcher.search(
                    transform=transform_config.name,
                    levels=levels,
                    search_parameter=transform_config.search_parameter,
                    evaluator=evaluate,
                    supports_refinement=transform.supports_refinement,
                    initial_passing_parameters=transform_config.initial_parameters(levels),
                )
                summary["searches"] += 1
                artifact: Path | None = None
                if result.found and result.parameters is not None:
                    normalized = transform.normalize_parameters(result.parameters)
                    cache_target = target_index if transform_config.target_aware else None
                    cache_value = prediction_cache[_cache_key(normalized, cache_target)]
                    if self.config.run.save_failures:
                        artifact = store.save_failure_image(
                            f"frame-{frame.index}_object-{target_index}_{transform.name}_variant-{variant_index}",
                            cache_value[1],
                        )
                    summary["boundaries_found"] += 1
                    if result.failure:
                        summary["failures_by_kind"][result.failure.kind] += 1
                    summary["failures_by_transform"][transform.name] += 1
                self._record_result(
                    frame,
                    target_index,
                    variant_index,
                    baseline,
                    result,
                    artifact,
                    store,
                )
                self.progress(
                    {
                        "type": "search_completed",
                        "frame": frame.index,
                        "object": target_index,
                        "transform": transform.name,
                        "found": result.found,
                    }
                )

    @staticmethod
    def _record_result(
        frame: Frame,
        target_index: int,
        variant_index: int,
        baseline: Detection,
        result: BoundaryResult,
        artifact: Path | None,
        store: RunStore,
    ) -> None:
        store.append_result(
            {
                "schema_version": 1,
                "frame": {
                    "index": frame.index,
                    "timestamp_seconds": frame.timestamp_seconds,
                    "source": str(frame.source),
                },
                "object_id": f"frame-{frame.index}-object-{target_index}",
                "variant_index": variant_index,
                "baseline": baseline.to_dict(),
                "boundary": {
                    "found": result.found,
                    "transform": result.transform,
                    "parameters": result.parameters,
                    "last_passing_parameters": result.last_passing_parameters,
                    "evaluations": result.evaluations,
                    "failure": asdict(result.failure) if result.failure else None,
                },
                "artifact": str(artifact.relative_to(store.path)) if artifact else None,
            }
        )
