from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, TypeVar

import numpy as np

from cvfuzz.exceptions import ConfigurationError
from cvfuzz.types import Box


@dataclass(frozen=True, slots=True)
class TransformContext:
    seed: int
    target_box: Box | None = None


class ImageTransform(ABC):
    name: str
    supports_refinement: bool = True

    def normalize_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        return parameters.copy()

    @abstractmethod
    def apply(
        self,
        image: np.ndarray,
        parameters: dict[str, Any],
        context: TransformContext,
    ) -> np.ndarray:
        """Apply a transform while preserving image dimensions and uint8 BGR format."""


_TRANSFORMS: dict[str, ImageTransform] = {}


TransformType = TypeVar("TransformType", bound=type[ImageTransform])


def register(transform_type: TransformType) -> TransformType:
    transform = transform_type()
    if transform.name in _TRANSFORMS:
        raise RuntimeError(f"Duplicate transform registration: {transform.name}")
    _TRANSFORMS[transform.name] = transform
    return transform_type


def get_transform(name: str) -> ImageTransform:
    _ensure_builtins_loaded()
    try:
        return _TRANSFORMS[name]
    except KeyError as exc:
        available = ", ".join(sorted(_TRANSFORMS))
        raise ConfigurationError(f"Unknown transform '{name}'. Available: {available}") from exc


def list_transforms() -> tuple[str, ...]:
    _ensure_builtins_loaded()
    return tuple(sorted(_TRANSFORMS))


def _ensure_builtins_loaded() -> None:
    # Importing registers the stateless singleton transforms.
    from cvfuzz.transforms import builtin as _builtin  # noqa: F401


def as_uint8(image: np.ndarray) -> np.ndarray:
    return np.clip(image, 0, 255).astype(np.uint8)
