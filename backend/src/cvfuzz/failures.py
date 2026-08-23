from __future__ import annotations

from cvfuzz.config import FailureConfig
from cvfuzz.matching import best_match
from cvfuzz.types import Detection, Failure


class FailureDetector:
    def __init__(self, config: FailureConfig) -> None:
        self.config = config

    def evaluate(self, baseline: Detection, detections: list[Detection]) -> Failure | None:
        same_class = [item for item in detections if item.class_id == baseline.class_id]
        match, overlap = best_match(baseline, same_class)

        if match is not None and overlap >= self.config.match_iou:
            if match.confidence < self.config.missed_below_confidence:
                return Failure(
                    kind="missed",
                    message="Matched detection fell below the minimum confidence",
                    baseline=baseline,
                    transformed=match,
                    metrics={"iou": overlap, "confidence": match.confidence},
                )
            if overlap < self.config.localization_iou:
                return Failure(
                    kind="localization_drift",
                    message="Detection box crossed the configured localization threshold",
                    baseline=baseline,
                    transformed=match,
                    metrics={"iou": overlap},
                )
            confidence_ratio = (
                match.confidence / baseline.confidence if baseline.confidence else 0.0
            )
            if confidence_ratio <= self.config.confidence_drop_fraction:
                return Failure(
                    kind="confidence_collapse",
                    message="Detection confidence crossed the configured relative threshold",
                    baseline=baseline,
                    transformed=match,
                    metrics={"iou": overlap, "confidence_ratio": confidence_ratio},
                )
            return None

        any_match, any_overlap = best_match(baseline, detections)
        if (
            self.config.detect_class_flip
            and any_match is not None
            and any_overlap >= self.config.match_iou
            and any_match.class_id != baseline.class_id
            and any_match.confidence >= self.config.missed_below_confidence
        ):
            return Failure(
                kind="class_flip",
                message=f"Class changed from {baseline.class_name} to {any_match.class_name}",
                baseline=baseline,
                transformed=any_match,
                metrics={"iou": any_overlap},
            )

        return Failure(
            kind="missed",
            message="No sufficiently overlapping detection remained",
            baseline=baseline,
            transformed=match,
            metrics={"best_iou": overlap},
        )
