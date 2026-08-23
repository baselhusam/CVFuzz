from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from cvfuzz.exceptions import ModelAdapterError
from cvfuzz.types import Detection

API_DEVICES = {"auto", "cpu", "mps"}


def _mps_available() -> bool:
    try:
        import torch
    except ImportError:
        return False
    return bool(torch.backends.mps.is_built() and torch.backends.mps.is_available())


def resolve_device(requested_device: str | None) -> str:
    """Resolve the API device choice to the concrete Ultralytics/PyTorch device."""
    requested = (requested_device or "auto").lower()
    if requested not in API_DEVICES:
        choices = ", ".join(sorted(API_DEVICES))
        raise ModelAdapterError(
            f"Unsupported inference device '{requested}'. Choose one of: {choices}"
        )
    if requested == "mps" and not _mps_available():
        raise ModelAdapterError(
            "Apple GPU (MPS) was requested but is unavailable to this Python environment. "
            "Install an MPS-enabled PyTorch build and restart CVFuzz."
        )
    if requested == "auto":
        return "mps" if _mps_available() else "cpu"
    return requested


def device_capabilities() -> dict[str, object]:
    mps_available = _mps_available()
    return {
        "default_device": "auto",
        "devices": [
            {
                "id": "auto",
                "name": "Automatic",
                "description": (
                    "Apple GPU (MPS)" if mps_available else "CPU (Apple GPU unavailable)"
                ),
                "available": True,
            },
            {
                "id": "mps",
                "name": "Apple GPU",
                "description": "MPS acceleration",
                "available": mps_available,
            },
            {
                "id": "cpu",
                "name": "CPU",
                "description": "Local CPU inference",
                "available": True,
            },
        ],
    }


class UltralyticsDetector:
    """Optional Ultralytics adapter, isolated from the rest of the engine."""

    def __init__(self, model_path: str | Path, *, device: str | None = None) -> None:
        self.model_path = Path(model_path).expanduser().resolve()
        if not self.model_path.is_file():
            raise ModelAdapterError(f"Model does not exist: {self.model_path}")
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise ModelAdapterError(
                "Ultralytics support is not installed. Run: pip install -e '.[yolo]'"
            ) from exc
        try:
            self._model = YOLO(str(self.model_path))
        except Exception as exc:
            raise ModelAdapterError(f"Could not load YOLO model: {exc}") from exc
        self.requested_device = (device or "auto").lower()
        self.device = resolve_device(self.requested_device)

    @property
    def identity(self) -> dict[str, str]:
        return {
            "adapter": "ultralytics",
            "path": str(self.model_path),
            "device": self.device,
            "requested_device": self.requested_device,
            "accelerator": "apple_mps" if self.device == "mps" else "cpu",
        }

    def predict(self, image: np.ndarray) -> list[Detection]:
        arguments: dict[str, Any] = {"source": image, "verbose": False, "conf": 0.001}
        arguments["device"] = self.device
        try:
            result = self._model.predict(**arguments)[0]
        except Exception as exc:
            raise ModelAdapterError(f"YOLO inference failed: {exc}") from exc
        names = result.names
        detections: list[Detection] = []
        if result.boxes is None:
            return detections
        for xyxy, confidence, class_id in zip(
            result.boxes.xyxy.cpu().tolist(),
            result.boxes.conf.cpu().tolist(),
            result.boxes.cls.cpu().tolist(),
            strict=True,
        ):
            numeric_class = int(class_id)
            class_name = (
                str(names.get(numeric_class, numeric_class))
                if isinstance(names, dict)
                else str(names[numeric_class])
            )
            detections.append(
                Detection(
                    box=tuple(float(value) for value in xyxy),  # type: ignore[arg-type]
                    class_id=numeric_class,
                    class_name=class_name,
                    confidence=float(confidence),
                )
            )
        return detections
