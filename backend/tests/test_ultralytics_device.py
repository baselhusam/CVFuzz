import pytest

from cvfuzz.exceptions import ModelAdapterError
from cvfuzz.models.ultralytics import device_capabilities, resolve_device


def test_auto_prefers_mps_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("cvfuzz.models.ultralytics._mps_available", lambda: True)

    assert resolve_device("auto") == "mps"
    assert resolve_device("mps") == "mps"
    assert device_capabilities()["devices"][1]["available"] is True


def test_auto_falls_back_to_cpu_when_mps_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("cvfuzz.models.ultralytics._mps_available", lambda: False)

    assert resolve_device(None) == "cpu"
    with pytest.raises(ModelAdapterError, match="MPS"):
        resolve_device("mps")


def test_device_selection_rejects_unknown_values() -> None:
    with pytest.raises(ModelAdapterError, match="Unsupported inference device"):
        resolve_device("cuda")
