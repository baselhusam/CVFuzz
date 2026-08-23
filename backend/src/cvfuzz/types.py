from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

Box = tuple[float, float, float, float]


@dataclass(frozen=True, slots=True)
class Detection:
    box: Box
    class_id: int
    class_name: str
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class Failure:
    kind: str
    message: str
    baseline: Detection
    transformed: Detection | None = None
    metrics: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        return data


@dataclass(frozen=True, slots=True)
class BoundaryResult:
    found: bool
    transform: str
    parameters: dict[str, Any] | None
    last_passing_parameters: dict[str, Any] | None
    failure: Failure | None
    evaluations: int


@dataclass(frozen=True, slots=True)
class Frame:
    image: Any
    index: int
    timestamp_seconds: float | None
    source: Path
