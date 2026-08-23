from __future__ import annotations

import json
import os
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from importlib.resources import as_file, files
from pathlib import Path
from typing import Annotated

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from cvfuzz.config import CVFuzzConfig, load_config
from cvfuzz.exceptions import CVFuzzError
from cvfuzz.models import UltralyticsDetector
from cvfuzz.runner import FuzzRunner
from cvfuzz.storage import load_summary
from cvfuzz.transforms import list_transforms
from cvfuzz.video_runner import VideoEvaluationRunner
from cvfuzz.video_storage import VideoRunStore, read_run

app = typer.Typer(no_args_is_help=True, help="Find failure boundaries in computer vision models.")
console = Console()

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_ROOT / ".env", override=False)


def _api_host() -> str:
    return os.getenv("CVFUZZ_API_HOST", "127.0.0.1")


def _api_port() -> int:
    value = os.getenv("CVFUZZ_API_PORT", "8000")
    try:
        port = int(value)
    except ValueError as exc:
        raise CVFuzzError("CVFUZZ_API_PORT must be an integer") from exc
    if not 1 <= port <= 65535:
        raise CVFuzzError("CVFUZZ_API_PORT must be between 1 and 65535")
    return port


@contextmanager
def _resolved_config(path: Path | None) -> Iterator[Path]:
    if path is not None:
        yield path
        return
    packaged = files("cvfuzz").joinpath("resources/default.yaml")
    if packaged.is_file():
        with as_file(packaged) as resolved:
            yield resolved
        return
    development_path = Path(__file__).resolve().parents[2] / "configs" / "default.yaml"
    yield development_path


def _load(path: Path | None) -> CVFuzzConfig:
    with _resolved_config(path) as resolved:
        return load_config(resolved)


@app.command("init-config")
def init_config(
    destination: Annotated[Path, typer.Argument(help="Destination YAML file")] = Path(
        "cvfuzz.yaml"
    ),
    force: Annotated[bool, typer.Option("--force", help="Overwrite an existing file")] = False,
) -> None:
    """Create an editable CVFuzz configuration."""
    if destination.exists() and not force:
        raise typer.BadParameter(f"File already exists: {destination}. Use --force to replace it.")
    with _resolved_config(None) as source:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    console.print(f"Created [bold]{destination}[/bold]")


@app.command("transforms")
def transforms_command() -> None:
    """List built-in transformations."""
    for name in list_transforms():
        console.print(name)


@app.command("validate-config")
def validate_config(config: Annotated[Path, typer.Argument(help="YAML configuration")]) -> None:
    """Validate and summarize a configuration file."""
    loaded = load_config(config)
    variants = sum(sum(1 for _ in transform.series()) for transform in loaded.enabled_transforms)
    transform_count = len(loaded.enabled_transforms)
    console.print(f"Valid configuration: {transform_count} transforms, {variants} search variants")


@app.command("run")
def run_command(
    model: Annotated[Path, typer.Argument(help="Path to an Ultralytics YOLO .pt model")],
    source: Annotated[Path, typer.Argument(help="Image, image directory, or video path")],
    config: Annotated[
        Path | None, typer.Option("--config", "-c", help="YAML configuration")
    ] = None,
    device: Annotated[
        str | None, typer.Option(help="Inference device, such as cpu, 0, or mps")
    ] = None,
) -> None:
    """Run object-level failure-boundary fuzzing."""
    loaded = _load(config)
    detector = UltralyticsDetector(model, device=device)

    def show_progress(event: dict[str, object]) -> None:
        if event["type"] == "run_started":
            console.print(f"Run [bold]{event['run_id']}[/bold] started")
        elif event["type"] == "frame_started":
            console.print(f"Frame {event['frame']}: {event['objects']} baseline objects")

    path = FuzzRunner(detector, loaded, progress=show_progress).run(source)
    console.print(f"Completed. Results: [bold]{path}[/bold]")


@app.command("video-run")
def video_run_command(
    model: Annotated[Path, typer.Argument(help="Path to an Ultralytics-compatible model")],
    source: Annotated[Path, typer.Argument(help="Full-length video path")],
    config: Annotated[
        Path | None, typer.Option("--config", "-c", help="YAML configuration")
    ] = None,
    device: Annotated[
        str | None, typer.Option(help="Inference device, such as cpu, 0, or mps")
    ] = None,
) -> None:
    """Render an annotated original plus one evaluated video per enabled transform."""
    loaded = _load(config)
    store = VideoRunStore(
        loaded.run.output_dir,
        model_name=model.name,
        source_name=source.name,
    )
    store.write_yaml("config.yaml", loaded.raw)
    try:
        detector = UltralyticsDetector(model, device=device)
        path = VideoEvaluationRunner(detector, loaded, store).run(source)
    except Exception as exc:
        if store.read_manifest().get("status") != "failed":
            store.fail(str(exc))
        raise
    console.print(f"Completed full-stream run. Results: [bold]{path}[/bold]")


@app.command("inspect")
def inspect_command(
    run_directory: Annotated[Path, typer.Argument(help="CVFuzz run directory")],
) -> None:
    """Show a completed run summary."""
    summary = load_summary(run_directory)
    table = Table(title=f"CVFuzz run {summary.get('run_id', '')}")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for key in (
        "frames_analyzed",
        "baseline_objects",
        "searches",
        "boundaries_found",
        "duration_seconds",
    ):
        table.add_row(key.replace("_", " ").title(), str(summary.get(key, "-")))
    console.print(table)
    if summary.get("failures_by_transform"):
        console.print(
            "Failures by transform:", json.dumps(summary["failures_by_transform"], indent=2)
        )


@app.command("inspect-video")
def inspect_video_command(
    run_directory: Annotated[Path, typer.Argument(help="CVFuzz video run directory")],
) -> None:
    """Show status and metrics for a full-stream video run."""
    run = read_run(run_directory)
    metrics = run.get("metrics") or {}
    table = Table(title=f"CVFuzz video run {run.get('id', '')}")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for key in ("status", "progress", "stage"):
        table.add_row(key.replace("_", " ").title(), str(run.get(key, "-")))
    for key in ("frames_analyzed", "robustness_score", "total_failures", "duration_seconds"):
        table.add_row(key.replace("_", " ").title(), str(metrics.get(key, "-")))
    console.print(table)


@app.command("serve")
def serve_command(
    host: Annotated[
        str | None,
        typer.Option(help="HTTP bind address (defaults to CVFUZZ_API_HOST)"),
    ] = None,
    port: Annotated[
        int | None,
        typer.Option(help="HTTP port (defaults to CVFUZZ_API_PORT)"),
    ] = None,
    reload: Annotated[bool, typer.Option(help="Reload when Python files change")] = False,
) -> None:
    """Start the local CVFuzz web API."""
    try:
        import uvicorn
    except ImportError as exc:
        raise CVFuzzError("API dependencies are not installed") from exc
    uvicorn.run(
        "cvfuzz.api:app",
        host=host or _api_host(),
        port=port if port is not None else _api_port(),
        reload=reload,
    )


def main() -> None:
    try:
        app()
    except CVFuzzError as exc:
        console.print(f"[red]Error:[/red] {exc}")
        raise typer.Exit(1) from exc


if __name__ == "__main__":
    main()
