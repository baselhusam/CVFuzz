from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from cvfuzz.config import CVFuzzConfig, load_config
from cvfuzz.media import VIDEO_SUFFIXES
from cvfuzz.models import UltralyticsDetector
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
            store.update(status="running", progress=0, stage="Loading model adapter")
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
            "transforms": [
                {
                    "id": item.name,
                    "name": item.name.replace("_", " ").title(),
                    "enabled": item.enabled,
                    "parameters": item.video_parameters(),
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

        store = VideoRunStore(root, model_name=model_name, source_name=video_name)
        model_path = store.inputs_path / safe_name(model_name)
        source_path = store.inputs_path / safe_name(video_name)
        try:
            await _save_upload(model, model_path)
            await _save_upload(video, source_path)
            store.write_yaml("config.yaml", load_config(selected_config).raw)
        except Exception as exc:
            store.fail(f"Could not save uploaded files: {exc}")
            raise HTTPException(status_code=500, detail="Could not save uploaded files") from exc
        background_tasks.add_task(execute_run, store, model_path, source_path, device)
        return {
            "id": store.run_id,
            "status": "queued",
            "status_url": f"/v1/runs/{store.run_id}",
        }

    @app.get("/v1/runs/{run_id}")
    def get_run(run_id: str) -> dict[str, object]:
        run_path = root / safe_name(run_id)
        if run_path.name != run_id or not (run_path / "manifest.json").is_file():
            raise HTTPException(status_code=404, detail="Run not found")
        return _artifact_urls(read_run(run_path))

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
