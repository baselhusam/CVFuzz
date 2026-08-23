from __future__ import annotations

from typing import Protocol

import numpy as np

from cvfuzz.types import Detection


class Detector(Protocol):
    @property
    def identity(self) -> dict[str, str]: ...

    def predict(self, image: np.ndarray) -> list[Detection]: ...
