import json
from pathlib import Path

import cv2
import numpy as np

from cvfuzz.config import load_config
from cvfuzz.runner import FuzzRunner
from cvfuzz.types import Detection


class BrightnessDetector:
    @property
    def identity(self) -> dict[str, str]:
        return {"adapter": "test", "path": "in-memory", "device": "cpu"}

    def predict(self, image: np.ndarray) -> list[Detection]:
        if float(image.mean()) < 80:
            return []
        return [Detection((8, 8, 56, 56), 0, "object", 0.9)]


def test_runner_writes_portable_run_artifacts(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    cv2.imwrite(str(source), np.full((64, 64, 3), 200, dtype=np.uint8))
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        f"""
version: 1
run:
  output_dir: {tmp_path.as_posix()}/runs
  baseline_confidence: 0.5
  sample_every_n_frames: 1
  max_frames: 1
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
    parameters:
      stops:
        values: [-0.5, -1.0, -2.0]
""",
        encoding="utf-8",
    )

    run_path = FuzzRunner(BrightnessDetector(), load_config(config_path)).run(source)

    summary = json.loads((run_path / "summary.json").read_text(encoding="utf-8"))
    result = json.loads((run_path / "results.jsonl").read_text(encoding="utf-8"))
    assert summary["frames_analyzed"] == 1
    assert summary["boundaries_found"] == 1
    assert result["boundary"]["found"] is True
    assert result["boundary"]["failure"]["kind"] == "missed"
    assert (run_path / result["artifact"]).is_file()
