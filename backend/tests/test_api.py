from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

from cvfuzz.api import create_app
from cvfuzz.types import Detection


class FakeDetector:
    @property
    def identity(self) -> dict[str, str]:
        return {"adapter": "test", "path": "fake.pt", "device": "cpu"}

    def predict(self, image: np.ndarray) -> list[Detection]:
        if float(image.mean()) < 80:
            return []
        return [Detection((4, 4, 20, 20), 0, "object", 0.9)]


def _video_bytes(tmp_path: Path) -> bytes:
    path = tmp_path / "source.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 5, (24, 24))
    assert writer.isOpened()
    writer.write(np.full((24, 24, 3), 180, dtype=np.uint8))
    writer.release()
    return path.read_bytes()


def test_api_accepts_run_and_serves_persisted_results(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("cvfuzz.video_runner.shutil.which", lambda _name: None)
    config = tmp_path / "config.yaml"
    config.write_text(
        """
version: 1
run:
  baseline_confidence: 0.5
failure:
  match_iou: 0.3
  missed_below_confidence: 0.25
  confidence_drop_fraction: 0.5
  localization_iou: 0.5
boundary: {}
transforms:
  exposure:
    search_parameter: stops
    render_parameters: {stops: -2.0}
    parameters:
      stops: {values: [-1.0, -2.0]}
""",
        encoding="utf-8",
    )
    app = create_app(
        runs_root=tmp_path / "runs",
        config_path=config,
        detector_factory=lambda _path, _device: FakeDetector(),
    )

    with TestClient(app) as client:
        response = client.post(
            "/v1/runs",
            files={
                "model": ("fake.pt", b"weights", "application/octet-stream"),
                "video": ("source.mp4", _video_bytes(tmp_path), "video/mp4"),
            },
        )
        assert response.status_code == 202
        run_id = response.json()["id"]

        detail = client.get(f"/v1/runs/{run_id}")
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["status"] == "completed"
        assert payload["metrics"]["frames_analyzed"] == 1
        assert len(payload["artifacts"]) == 2

        listing = client.get("/v1/runs").json()["runs"]
        assert listing[0]["id"] == run_id
        assert "transforms" not in listing[0]["metrics"]

        artifact = client.get(payload["artifacts"][0]["url"], headers={"Range": "bytes=0-9"})
        assert artifact.status_code == 206
        assert len(artifact.content) == 10


def test_api_rejects_unsupported_model(tmp_path: Path) -> None:
    app = create_app(
        runs_root=tmp_path / "runs",
        config_path=Path(__file__).parents[1] / "configs" / "smoke.yaml",
    )
    with TestClient(app) as client:
        response = client.post(
            "/v1/runs",
            files={
                "model": ("model.txt", b"nope", "text/plain"),
                "video": ("source.mp4", b"nope", "video/mp4"),
            },
        )
    assert response.status_code == 400


def test_api_rejects_unavailable_mps_request(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("cvfuzz.models.ultralytics._mps_available", lambda: False)
    app = create_app(
        runs_root=tmp_path / "runs",
        config_path=Path(__file__).parents[1] / "configs" / "smoke.yaml",
    )
    with TestClient(app) as client:
        response = client.post(
            "/v1/runs",
            data={"device": "mps"},
            files={
                "model": ("model.pt", b"weights", "application/octet-stream"),
                "video": ("source.mp4", b"video", "video/mp4"),
            },
        )

    assert response.status_code == 400
    assert "MPS" in response.json()["detail"]
