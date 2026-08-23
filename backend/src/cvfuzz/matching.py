from __future__ import annotations

from cvfuzz.types import Box, Detection


def box_iou(left: Box, right: Box) -> float:
    x1 = max(left[0], right[0])
    y1 = max(left[1], right[1])
    x2 = min(left[2], right[2])
    y2 = min(left[3], right[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    union = left_area + right_area - intersection
    return intersection / union if union > 0 else 0.0


def best_match(reference: Detection, candidates: list[Detection]) -> tuple[Detection | None, float]:
    if not candidates:
        return None, 0.0
    match = max(candidates, key=lambda candidate: box_iou(reference.box, candidate.box))
    return match, box_iou(reference.box, match.box)
