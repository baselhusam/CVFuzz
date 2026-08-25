from pathlib import Path

import pytest

from cvfuzz.config import load_config
from cvfuzz.exceptions import ConfigurationError

DEFAULT_CONFIG = Path(__file__).parents[1] / "configs" / "default.yaml"


def test_default_config_loads_and_expands_variants() -> None:
    config = load_config(DEFAULT_CONFIG)

    assert len(config.enabled_transforms) == 9
    assert config.run.inference_batch_size == 2
    assert config.run.inference_image_size is None
    motion_blur = next(item for item in config.transforms if item.name == "motion_blur")
    series = list(motion_blur.series())

    assert len(series) == 3
    assert [level["kernel_size"] for level in series[0]] == [3, 5, 7, 9, 11, 15, 21]
    assert {variant[0]["angle_degrees"] for variant in series} == {0, 45, 90}
    assert motion_blur.video_parameters() == {"kernel_size": 11, "angle_degrees": 45}


def test_parameter_range_is_inclusive_and_keeps_order(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        """
version: 1
transforms:
  exposure:
    search_parameter: stops
    parameters:
      stops:
        range: {start: -0.5, stop: -2.0, step: -0.5}
""",
        encoding="utf-8",
    )

    config = load_config(path)

    assert config.transforms[0].parameters["stops"].values == (-0.5, -1.0, -1.5, -2.0)


def test_invalid_range_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        """
version: 1
transforms:
  exposure:
    search_parameter: stops
    parameters:
      stops:
        range: {start: -0.5, stop: -2.0, step: 0.5}
""",
        encoding="utf-8",
    )

    with pytest.raises(ConfigurationError, match="moves away"):
        load_config(path)


def test_unknown_option_is_rejected_instead_of_ignored(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        """
version: 1
run:
  baseline_confidnce: 0.5
transforms:
  exposure:
    search_parameter: stops
    parameters:
      stops: {values: [-1.0]}
""",
        encoding="utf-8",
    )

    with pytest.raises(ConfigurationError, match="baseline_confidnce"):
        load_config(path)


def test_unknown_render_parameter_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        """
version: 1
transforms:
  exposure:
    search_parameter: stops
    render_parameters: {strength: 0.5}
    parameters:
      stops: {values: [-1.0]}
""",
        encoding="utf-8",
    )

    with pytest.raises(ConfigurationError, match="render_parameters"):
        load_config(path)


def test_invalid_inference_settings_are_rejected(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        """
version: 1
run:
  inference_batch_size: 0
  inference_image_size: 16
transforms:
  exposure:
    search_parameter: stops
    parameters:
      stops: {values: [-1.0]}
""",
        encoding="utf-8",
    )

    with pytest.raises(ConfigurationError, match="inference_batch_size"):
        load_config(path)
