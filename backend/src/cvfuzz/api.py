from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from copy import deepcopy
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from cvfuzz.config import CVFuzzConfig, load_config
from cvfuzz.exceptions import ModelAdapterError
from cvfuzz.media import VIDEO_SUFFIXES
from cvfuzz.models import UltralyticsDetector, device_capabilities, resolve_device
from cvfuzz.storage import safe_name
from cvfuzz.video_runner import VideoEvaluationRunner
from cvfuzz.video_storage import VideoRunStore, list_runs, read_run

MODEL_SUFFIXES = {".pt", ".onnx", ".engine"}
DetectorFactory = Callable[[Path, str | None], object]


def _default_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "configs" / "default.yaml"


def _artifact_urls(run: dict[str, object]) -> dict[str, object]:
    run_id = str(run["id"])
    for artifact in run.get("artifacts", []):  # type: ignore[union-attr]
        relative_path = Path(str(artifact["path"])).relative_to("artifacts")
        artifact["url"] = f"/v1/runs/{run_id}/artifacts/{relative_path.as_posix()}"
    return run


async def _save_upload(upload: UploadFile, destination: Path) -> None:
    with destination.open("wb") as stream:
        while chunk := await upload.read(1024 * 1024):
            stream.write(chunk)
    await upload.close()


def _parse_batch_size(value: str | None, default: int) -> int:
    if value in {None, ""}:
        return default
    try:
        batch_size = int(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Batch size must be an integer") from exc
    if not 1 <= batch_size <= 64:
        raise HTTPException(status_code=400, detail="Batch size must be between 1 and 64")
    return batch_size


def _parse_image_size(value: str | None, default: int | None) -> int | None:
    if value in {None, ""}:
        return default
    if value.lower() == "source":
        return None
    try:
        image_size = int(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="Inference image size must be 'source' or an integer"
        ) from exc
    if not 32 <= image_size <= 4096:
        raise HTTPException(
            status_code=400, detail="Inference image size must be between 32 and 4096"
        )
    return image_size


def _parse_transform_overrides(
    value: str | None, base_config: CVFuzzConfig
) -> dict[str, dict[str, object]]:
    if value in {None, ""}:
        return {}
    try:
        payload = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Transforms must be valid JSON") from exc
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="Transforms must be a list")

    available = {item.name: item for item in base_config.transforms}
    overrides: dict[str, dict[str, object]] = {}
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400, detail=f"Transform override {index + 1} must be an object"
            )
        unknown_fields = sorted(set(item) - {"id", "enabled", "parameters"})
        if unknown_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown transform override field(s): {', '.join(unknown_fields)}",
            )
        transform_id = item.get("id")
        if not isinstance(transform_id, str) or transform_id not in available:
            raise HTTPException(status_code=400, detail=f"Unknown transform: {transform_id}")
        if transform_id in overrides:
            raise HTTPException(status_code=400, detail=f"Duplicate transform: {transform_id}")
        enabled = item.get("enabled")
        parameters = item.get("parameters")
        if not isinstance(enabled, bool) or not isinstance(parameters, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Transform {transform_id} requires enabled and parameters",
            )

        config = available[transform_id]
        unknown_parameters = sorted(set(parameters) - set(config.parameters))
        if unknown_parameters:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown {transform_id} parameter(s): "
                    f"{', '.join(unknown_parameters)}"
                ),
            )
        for name, parameter_value in parameters.items():
            configured_value = config.video_parameters().get(name)
            allowed = (*config.parameters[name].values, configured_value)
            if parameter_value not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported {transform_id}.{name} value: {parameter_value}",
                )
        overrides[transform_id] = {"enabled": enabled, "parameters": parameters}
    return overrides


def create_app(
    *,
    runs_root: str | Path | None = None,
    config_path: str | Path | None = None,
    detector_factory: DetectorFactory | None = None,
) -> FastAPI:
    root = (
        Path(runs_root or os.environ.get("CVFUZZ_RUNS_DIR", ".cvfuzz/web-runs"))
        .expanduser()
        .resolve()
    )
    selected_config = (
        Path(config_path or os.environ.get("CVFUZZ_CONFIG", _default_config_path()))
        .expanduser()
        .resolve()
    )
    root.mkdir(parents=True, exist_ok=True)
    factory = detector_factory or (
        lambda model_path, device: UltralyticsDetector(model_path, device=device)
    )

    app = FastAPI(
        title="CVFuzz local API",
        version="0.2.0",
        description="Full-stream video augmentation and detector evaluation API.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def execute_run(store: VideoRunStore, model_path: Path, source_path: Path, device: str | None):
        try:
            config: CVFuzzConfig = load_config(store.path / "config.yaml")
            resolved_device = resolve_device(device)
            device_label = "Apple GPU (MPS)" if resolved_device == "mps" else "CPU"
            store.update(
                status="running",
                progress=0,
                stage=f"Loading model on {device_label}",
            )
            detector = factory(model_path, device)
            VideoEvaluationRunner(detector, config, store).run(source_path)
        except Exception as exc:
            if store.read_manifest().get("status") != "failed":
                store.fail(str(exc))

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "runs_root": str(root),
            "config": str(selected_config),
        }

    @app.get("/v1/config")
    def get_config() -> dict[str, object]:
        config = load_config(selected_config)
        return {
            "version": config.version,
            **device_capabilities(),
            "inference": {
                "batch_size": config.run.inference_batch_size,
                "image_size": config.run.inference_image_size,
            },
            "transforms": [
                {
                    "id": item.name,
                    "name": item.name.replace("_", " ").title(),
                    "enabled": item.enabled,
                    "parameters": item.video_parameters(),
                    "parameter_options": {
                        name: list(spec.values)
                        + (
                            [item.video_parameters()[name]]
                            if item.video_parameters()[name] not in spec.values
                            else []
                        )
                        for name, spec in item.parameters.items()
                    },
                    "target_aware": item.target_aware,
                }
                for item in config.transforms
            ],
        }

    @app.get("/v1/runs")
    def get_runs() -> dict[str, object]:
        summaries = []
        for run in list_runs(root):
            metrics = run.get("metrics") or {}
            summaries.append(
                {
                    **{
                        key: value
                        for key, value in run.items()
                        if key not in {"metrics", "artifacts"}
                    },
                    "metrics": {
                        key: value
                        for key, value in metrics.items()
                        if key
                        in {
                            "frames_analyzed",
                            "video_duration_seconds",
                            "robustness_score",
                            "total_failures",
                            "weakest_transform",
                            "duration_seconds",
                        }
                    }
                    if metrics
                    else None,
                }
            )
        return {"runs": summaries}

    @app.post("/v1/runs", status_code=202)
    async def create_run(
        background_tasks: BackgroundTasks,
        model: Annotated[UploadFile, File()],
        video: Annotated[UploadFile, File()],
        device: Annotated[str | None, Form()] = None,
        batch_size: Annotated[str | None, Form()] = None,
        image_size: Annotated[str | None, Form()] = None,
        transforms: Annotated[str | None, Form()] = None,
    ) -> dict[str, object]:
        model_name = model.filename or "model.pt"
        video_name = video.filename or "video.mp4"
        if Path(model_name).suffix.lower() not in MODEL_SUFFIXES:
            raise HTTPException(
                status_code=400,
                detail="Model must be an Ultralytics-compatible .pt, .onnx, or .engine file",
            )
        if Path(video_name).suffix.lower() not in VIDEO_SUFFIXES:
            raise HTTPException(status_code=400, detail="Unsupported video format")
        try:
            resolve_device(device)
        except ModelAdapterError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        base_config = load_config(selected_config)
        requested_batch_size = _parse_batch_size(
            batch_size, base_config.run.inference_batch_size
        )
        requested_image_size = _parse_image_size(
            image_size, base_config.run.inference_image_size
        )
        transform_overrides = _parse_transform_overrides(transforms, base_config)

        store = VideoRunStore(root, model_name=model_name, source_name=video_name)
        model_path = store.inputs_path / safe_name(model_name)
        source_path = store.inputs_path / safe_name(video_name)
        try:
            await _save_upload(model, model_path)
            await _save_upload(video, source_path)
            run_config = deepcopy(base_config.raw)
            run_config["run"]["inference_batch_size"] = requested_batch_size
            run_config["run"]["inference_image_size"] = requested_image_size
            for transform_id, override in transform_overrides.items():
                run_config["transforms"][transform_id]["enabled"] = override["enabled"]
                run_config["transforms"][transform_id]["render_parameters"] = override[
                    "parameters"
                ]
            store.write_yaml("config.yaml", run_config)
        except Exception as exc:
            store.fail(f"Could not save uploaded files: {exc}")
            raise HTTPException(status_code=500, detail="Could not save uploaded files") from exc
        background_tasks.add_task(execute_run, store, model_path, source_path, device)
        return _artifact_urls(read_run(store.path))

    @app.get("/v1/runs/{run_id}")
    def get_run(run_id: str) -> dict[str, object]:
        run_path = root / safe_name(run_id)
        if run_path.name != run_id or not (run_path / "manifest.json").is_file():
            raise HTTPException(status_code=404, detail="Run not found")
        return _artifact_urls(read_run(run_path))

    @app.get("/v1/runs/{run_id}/events")
    def stream_run_events(run_id: str) -> StreamingResponse:
        """Send live run snapshots over one Server-Sent Events connection."""
        run_path = root / safe_name(run_id)
        if run_path.name != run_id or not (run_path / "manifest.json").is_file():
            raise HTTPException(status_code=404, detail="Run not found")

        def event_stream():
            previous = ""
            while True:
                payload = _artifact_urls(read_run(run_path))
                serialized = json.dumps(payload, sort_keys=True)
                if serialized != previous:
                    yield f"event: run\ndata: {serialized}\n\n"
                    previous = serialized
                if payload["status"] in {"completed", "failed"}:
                    break
                time.sleep(0.25)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/v1/runs/{run_id}/artifacts/{artifact_path:path}")
    def get_artifact(run_id: str, artifact_path: str) -> FileResponse:
        run_path = (root / safe_name(run_id)).resolve()
        artifacts_path = (run_path / "artifacts").resolve()
        candidate = (artifacts_path / artifact_path).resolve()
        try:
            candidate.relative_to(artifacts_path)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Artifact not found") from exc
        if not candidate.is_file() or candidate.parent != artifacts_path:
            raise HTTPException(status_code=404, detail="Artifact not found")
        return FileResponse(candidate, media_type="video/mp4", content_disposition_type="inline")

    return app


app = create_app()
