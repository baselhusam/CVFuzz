import json
from pathlib import Path

import cv2
import numpy as np

from cvfuzz.config import load_config
from cvfuzz.types import Detection
from cvfuzz.video_runner import VideoEvaluationRunner, _encoder_options, _preferred_encoder
from cvfuzz.video_storage import VideoRunStore, list_runs, read_run


class BrightnessDetector:
    @property
    def identity(self) -> dict[str, str]:
        return {"adapter": "test", "path": "in-memory", "device": "cpu"}

    def predict(self, image: np.ndarray) -> list[Detection]:
        mean = float(image.mean())
        if mean < 80:
            return []
        return [Detection((5, 5, 27, 27), 0, "object", min(0.99, mean / 255))]


class BatchBrightnessDetector(BrightnessDetector):
    def __init__(self) -> None:
        self.batch_calls: list[tuple[int, tuple[int, int]]] = []

    def predict_batch(
        self, images: list[np.ndarray], *, image_size: tuple[int, int]
    ) -> list[list[Detection]]:
        self.batch_calls.append((len(images), image_size))
        return [self.predict(image) for image in images]


def _write_video(path: Path) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 5, (32, 32))
    assert writer.isOpened()
    for value in (180, 190, 200):
        writer.write(np.full((32, 32, 3), value, dtype=np.uint8))
    writer.release()


def test_full_stream_runner_writes_real_videos_and_metrics(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr("cvfuzz.video_runner.shutil.which", lambda _name: None)
    source = tmp_path / "source.mp4"
    _write_video(source)
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        f"""
version: 1
run:
  output_dir: {tmp_path.as_posix()}/runs
  baseline_confidence: 0.5
  sample_every_n_frames: 1
  max_frames: null
  save_failures: true
failure:
  match_iou: 0.3
  missed_below_confidence: 0.25
  confidence_drop_fraction: 0.5
  localization_iou: 0.5
boundary:
  refine: true
  tolerance: 0.05
  max_iterations: 8
transforms:
  exposure:
    search_parameter: stops
    render_parameters: {{stops: -2.0}}
    parameters:
      stops: {{values: [-1.0, -2.0]}}
""",
        encoding="utf-8",
    )
    config = load_config(config_path)
    store = VideoRunStore(config.run.output_dir, model_name="fake.pt", source_name=source.name)
    store.write_yaml("config.yaml", config.raw)

    detector = BatchBrightnessDetector()
    run_path = VideoEvaluationRunner(detector, config, store).run(source)

    run = read_run(run_path)
    assert run["status"] == "completed"
    assert run["model"]["name"] == "fake.pt"
    assert run["model"]["adapter"] == "test"
    assert run["metrics"]["frames_analyzed"] == 3
    assert run["metrics"]["total_failures"] == 3
    assert run["metrics"]["inference"] == {
        "batch_size": 2,
        "image_size": {"width": 32, "height": 32},
    }
    assert detector.batch_calls == [(2, (32, 32)), (1, (32, 32)), (2, (32, 32)), (1, (32, 32))]
    assert run["metrics"]["transforms"][0]["id"] == "exposure"
    assert {artifact["id"] for artifact in run["artifacts"]} == {"original", "exposure"}
    assert all((run_path / artifact["path"]).is_file() for artifact in run["artifacts"])
    assert not (run_path / "augmented").exists()
    assert (run_path / "baseline.jsonl").is_file()
    assert len((run_path / "frames.jsonl").read_text(encoding="utf-8").splitlines()) == 3
    stages = [
        json.loads(line)["stage"]
        for line in (run_path / "events.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert "Capturing baseline and rendering original" in stages
    assert "Processing augmentation 1 of 1: Exposure" in stages
    assert not any("Processed frame" in stage for stage in stages)
    assert list_runs(config.run.output_dir)[0]["id"] == store.run_id
    json.loads((run_path / "metrics.json").read_text(encoding="utf-8"))


def test_encoder_selection_is_portable_with_macos_acceleration() -> None:
    encoders = frozenset({"h264_videotoolbox", "libx264"})

    assert _preferred_encoder(encoders, "darwin") == "h264_videotoolbox"
    assert _preferred_encoder(encoders, "linux") == "libx264"
    assert _preferred_encoder(frozenset(), "win32") == "mpeg4"
    assert _encoder_options("libx264") == ["-preset", "veryfast", "-crf", "20"]
    assert _encoder_options("h264_videotoolbox") == ["-realtime", "true", "-prio_speed", "true"]
