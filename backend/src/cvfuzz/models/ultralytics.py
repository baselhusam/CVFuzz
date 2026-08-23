from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from cvfuzz.exceptions import ModelAdapterError
from cvfuzz.types import Detection


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
        self.device = device

    @property
    def identity(self) -> dict[str, str]:
        return {
            "adapter": "ultralytics",
            "path": str(self.model_path),
            "device": self.device or "auto",
        }

    def predict(self, image: np.ndarray) -> list[Detection]:
        arguments: dict[str, Any] = {"source": image, "verbose": False, "conf": 0.001}
        if self.device:
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
