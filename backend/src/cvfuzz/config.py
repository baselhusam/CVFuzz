from __future__ import annotations

import itertools
import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from cvfuzz.exceptions import ConfigurationError


@dataclass(frozen=True, slots=True)
class RunConfig:
    baseline_confidence: float = 0.5
    sample_every_n_frames: int = 30
    max_frames: int | None = 25
    seed: int = 42
    output_dir: Path = Path(".cvfuzz/runs")
    save_failures: bool = True
    inference_batch_size: int = 2
    inference_image_size: int | None = None


@dataclass(frozen=True, slots=True)
class FailureConfig:
    match_iou: float = 0.3
    missed_below_confidence: float = 0.25
    confidence_drop_fraction: float = 0.5
    localization_iou: float = 0.5
    detect_class_flip: bool = True


@dataclass(frozen=True, slots=True)
class BoundaryConfig:
    refine: bool = True
    tolerance: float = 0.05
    max_iterations: int = 8


@dataclass(frozen=True, slots=True)
class ParameterSpec:
    values: tuple[Any, ...]


@dataclass(frozen=True, slots=True)
class TransformConfig:
    name: str
    enabled: bool
    search_parameter: str
    parameters: dict[str, ParameterSpec]
    target_aware: bool = False
    identity_value: Any | None = None
    render_parameters: dict[str, Any] = field(default_factory=dict)

    def series(self) -> Iterable[list[dict[str, Any]]]:
        """Yield ordered search series, one per combination of variant parameters."""
        search_values = self.parameters[self.search_parameter].values
        variant_names = [name for name in self.parameters if name != self.search_parameter]
        variant_values = [self.parameters[name].values for name in variant_names]
        combinations = itertools.product(*variant_values) if variant_names else [()]
        for combination in combinations:
            fixed = dict(zip(variant_names, combination, strict=True))
            yield [{**fixed, self.search_parameter: value} for value in search_values]

    def initial_parameters(self, levels: list[dict[str, Any]]) -> dict[str, Any] | None:
        """Return the unmodified endpoint used when refining the first tested level."""
        if self.identity_value is None or not levels:
            return None
        fixed = {key: value for key, value in levels[0].items() if key != self.search_parameter}
        return {**fixed, self.search_parameter: self.identity_value}

    def video_parameters(self) -> dict[str, Any]:
        """Return the configured severity used for the full-length rendered video."""
        defaults = {name: spec.values[0] for name, spec in self.parameters.items()}
        return {**defaults, **self.render_parameters}


@dataclass(frozen=True, slots=True)
class CVFuzzConfig:
    version: int
    run: RunConfig
    failure: FailureConfig
    boundary: BoundaryConfig
    transforms: tuple[TransformConfig, ...] = field(default_factory=tuple)
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def enabled_transforms(self) -> tuple[TransformConfig, ...]:
        return tuple(item for item in self.transforms if item.enabled)


def _numeric_range(spec: dict[str, Any], path: str) -> tuple[int | float, ...]:
    try:
        start, stop, step = spec["start"], spec["stop"], spec["step"]
    except KeyError as exc:
        raise ConfigurationError(f"{path} requires start, stop, and step") from exc
    if not all(isinstance(value, (int, float)) for value in (start, stop, step)):
        raise ConfigurationError(f"{path} values must be numeric")
    if step == 0:
        raise ConfigurationError(f"{path}.step cannot be zero")
    if (stop - start) * step < 0:
        raise ConfigurationError(f"{path}.step moves away from stop")

    values: list[int | float] = []
    current = start
    compare = (lambda value: value <= stop) if step > 0 else (lambda value: value >= stop)
    while compare(current) and len(values) < 10_000:
        rounded = (
            round(current, 10) if isinstance(current, float) or isinstance(step, float) else current
        )
        values.append(rounded)
        current += step
    if (
        not values
        or len(values) >= 10_000
        or not math.isclose(float(values[-1]), float(stop), rel_tol=0, abs_tol=1e-9)
    ):
        raise ConfigurationError(
            f"{path} must reach stop exactly and contain fewer than 10,000 values"
        )
    return tuple(values)


def _parameter_spec(value: Any, path: str) -> ParameterSpec:
    if not isinstance(value, dict):
        raise ConfigurationError(f"{path} must be a mapping with 'values' or 'range'")
    _reject_unknown(value, {"values", "range"}, path)
    if "values" in value and "range" in value:
        raise ConfigurationError(f"{path} cannot contain both 'values' and 'range'")
    if "values" in value:
        values = value["values"]
        if not isinstance(values, list) or not values:
            raise ConfigurationError(f"{path}.values must be a non-empty list")
        return ParameterSpec(tuple(values))
    if "range" in value and isinstance(value["range"], dict):
        return ParameterSpec(_numeric_range(value["range"], f"{path}.range"))
    raise ConfigurationError(f"{path} requires 'values' or 'range'")


def _reject_unknown(mapping: dict[str, Any], allowed: set[str], path: str) -> None:
    unknown = sorted(set(mapping) - allowed)
    if unknown:
        raise ConfigurationError(f"Unknown {path} option(s): {', '.join(unknown)}")


def _as_float(value: Any, path: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ConfigurationError(f"{path} must be numeric") from exc


def _as_int(value: Any, path: str) -> int:
    if isinstance(value, bool):
        raise ConfigurationError(f"{path} must be an integer")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ConfigurationError(f"{path} must be an integer") from exc


def _as_bool(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise ConfigurationError(f"{path} must be true or false")
    return value


def load_config(path: str | Path) -> CVFuzzConfig:
    config_path = Path(path)
    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigurationError(f"Could not read configuration: {config_path}") from exc
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"Invalid YAML in {config_path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ConfigurationError("Configuration root must be a mapping")
    if raw.get("version") != 1:
        raise ConfigurationError("Only configuration version 1 is supported")
    _reject_unknown(raw, {"version", "run", "failure", "boundary", "transforms"}, "root")

    run_raw = raw.get("run", {})
    failure_raw = raw.get("failure", {})
    boundary_raw = raw.get("boundary", {})
    if not all(isinstance(value, dict) for value in (run_raw, failure_raw, boundary_raw)):
        raise ConfigurationError("run, failure, and boundary must be mappings")
    _reject_unknown(run_raw, set(RunConfig.__annotations__), "run")
    _reject_unknown(failure_raw, set(FailureConfig.__annotations__), "failure")
    _reject_unknown(boundary_raw, set(BoundaryConfig.__annotations__), "boundary")

    max_frames_value = run_raw.get("max_frames", 25)

    run = RunConfig(
        baseline_confidence=_as_float(
            run_raw.get("baseline_confidence", 0.5), "run.baseline_confidence"
        ),
        sample_every_n_frames=_as_int(
            run_raw.get("sample_every_n_frames", 30), "run.sample_every_n_frames"
        ),
        max_frames=(
            None if max_frames_value is None else _as_int(max_frames_value, "run.max_frames")
        ),
        seed=_as_int(run_raw.get("seed", 42), "run.seed"),
        output_dir=Path(run_raw.get("output_dir", ".cvfuzz/runs")),
        save_failures=_as_bool(run_raw.get("save_failures", True), "run.save_failures"),
        inference_batch_size=_as_int(
            run_raw.get("inference_batch_size", 2), "run.inference_batch_size"
        ),
        inference_image_size=(
            None
            if run_raw.get("inference_image_size") is None
            else _as_int(run_raw["inference_image_size"], "run.inference_image_size")
        ),
    )
    if run.sample_every_n_frames < 1 or (run.max_frames is not None and run.max_frames < 1):
        raise ConfigurationError("sample_every_n_frames and max_frames must be positive")
    if not 1 <= run.inference_batch_size <= 64:
        raise ConfigurationError("run.inference_batch_size must be between 1 and 64")
    if run.inference_image_size is not None and not 32 <= run.inference_image_size <= 4096:
        raise ConfigurationError("run.inference_image_size must be between 32 and 4096")
    if not 0 <= run.baseline_confidence <= 1:
        raise ConfigurationError("baseline_confidence must be between 0 and 1")

    failure = FailureConfig(
        match_iou=_as_float(failure_raw.get("match_iou", 0.3), "failure.match_iou"),
        missed_below_confidence=_as_float(
            failure_raw.get("missed_below_confidence", 0.25),
            "failure.missed_below_confidence",
        ),
        confidence_drop_fraction=_as_float(
            failure_raw.get("confidence_drop_fraction", 0.5),
            "failure.confidence_drop_fraction",
        ),
        localization_iou=_as_float(
            failure_raw.get("localization_iou", 0.5), "failure.localization_iou"
        ),
        detect_class_flip=_as_bool(
            failure_raw.get("detect_class_flip", True), "failure.detect_class_flip"
        ),
    )
    thresholds = {
        "match_iou": failure.match_iou,
        "missed_below_confidence": failure.missed_below_confidence,
        "confidence_drop_fraction": failure.confidence_drop_fraction,
        "localization_iou": failure.localization_iou,
    }
    for threshold_name, threshold in thresholds.items():
        if not 0 <= threshold <= 1:
            raise ConfigurationError(f"failure.{threshold_name} must be between 0 and 1")
    if failure.localization_iou < failure.match_iou:
        raise ConfigurationError("failure.localization_iou must be at least failure.match_iou")

    boundary = BoundaryConfig(
        refine=_as_bool(boundary_raw.get("refine", True), "boundary.refine"),
        tolerance=_as_float(boundary_raw.get("tolerance", 0.05), "boundary.tolerance"),
        max_iterations=_as_int(boundary_raw.get("max_iterations", 8), "boundary.max_iterations"),
    )
    if not boundary.tolerance > 0:
        raise ConfigurationError("boundary.tolerance must be greater than zero")
    if boundary.max_iterations < 0:
        raise ConfigurationError("boundary.max_iterations cannot be negative")

    transforms_raw = raw.get("transforms", {})
    if not isinstance(transforms_raw, dict) or not transforms_raw:
        raise ConfigurationError("transforms must be a non-empty mapping")
    transforms: list[TransformConfig] = []
    for name, item in transforms_raw.items():
        path_prefix = f"transforms.{name}"
        if not isinstance(item, dict):
            raise ConfigurationError(f"{path_prefix} must be a mapping")
        _reject_unknown(
            item,
            {
                "enabled",
                "search_parameter",
                "identity_value",
                "target_aware",
                "parameters",
                "render_parameters",
            },
            path_prefix,
        )
        search_parameter = item.get("search_parameter")
        parameters_raw = item.get("parameters")
        if not isinstance(search_parameter, str) or not isinstance(parameters_raw, dict):
            raise ConfigurationError(f"{path_prefix} requires search_parameter and parameters")
        parameters = {
            parameter_name: _parameter_spec(spec, f"{path_prefix}.parameters.{parameter_name}")
            for parameter_name, spec in parameters_raw.items()
        }
        if search_parameter not in parameters:
            raise ConfigurationError(f"{path_prefix}.search_parameter is not in parameters")
        render_parameters = item.get("render_parameters", {})
        if not isinstance(render_parameters, dict):
            raise ConfigurationError(f"{path_prefix}.render_parameters must be a mapping")
        unknown_render_parameters = sorted(set(render_parameters) - set(parameters))
        if unknown_render_parameters:
            raise ConfigurationError(
                f"Unknown {path_prefix}.render_parameters option(s): "
                f"{', '.join(unknown_render_parameters)}"
            )
        transforms.append(
            TransformConfig(
                name=name,
                enabled=_as_bool(item.get("enabled", True), f"{path_prefix}.enabled"),
                search_parameter=search_parameter,
                parameters=parameters,
                target_aware=_as_bool(
                    item.get("target_aware", False), f"{path_prefix}.target_aware"
                ),
                identity_value=item.get("identity_value"),
                render_parameters=render_parameters,
            )
        )

    return CVFuzzConfig(
        version=1,
        run=run,
        failure=failure,
        boundary=boundary,
        transforms=tuple(transforms),
        raw=raw,
    )
