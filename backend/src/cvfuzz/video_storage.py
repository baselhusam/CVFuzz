from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from cvfuzz.storage import _json_default, safe_name


class VideoRunStore:
    """File-backed state and artifacts for a full-stream video evaluation run."""

    def __init__(self, root: str | Path, *, model_name: str, source_name: str) -> None:
        timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        self.run_id = f"{timestamp}-{uuid.uuid4().hex[:8]}"
        self.path = Path(root).expanduser().resolve() / self.run_id
        self.inputs_path = self.path / "inputs"
        self.augmented_path = self.path / "augmented"
        self.artifacts_path = self.path / "artifacts"
        self.path.mkdir(parents=True, exist_ok=False)
        self.inputs_path.mkdir()
        self.augmented_path.mkdir()
        self.artifacts_path.mkdir()
        self.frames_path = self.path / "frames.jsonl"
        self.references_path = self.path / "baseline.jsonl"
        self.events_path = self.path / "events.jsonl"
        self._started_at = datetime.now(UTC)
        self.write_manifest(
            {
                "schema_version": 2,
                "id": self.run_id,
                "status": "queued",
                "progress": 0,
                "stage": "Files uploaded; waiting to start",
                "started_at": self._started_at.isoformat(),
                "model": {"name": model_name},
                "source": {"name": source_name},
            }
        )

    @classmethod
    def open(cls, path: str | Path) -> VideoRunStore:
        instance = cls.__new__(cls)
        instance.path = Path(path).expanduser().resolve()
        instance.run_id = instance.path.name
        instance.inputs_path = instance.path / "inputs"
        instance.augmented_path = instance.path / "augmented"
        instance.artifacts_path = instance.path / "artifacts"
        instance.frames_path = instance.path / "frames.jsonl"
        instance.references_path = instance.path / "baseline.jsonl"
        instance.events_path = instance.path / "events.jsonl"
        manifest = instance.read_manifest()
        instance._started_at = datetime.fromisoformat(manifest["started_at"])
        return instance

    def write_json(self, name: str, data: dict[str, Any]) -> None:
        destination = self.path / name
        temporary = destination.with_suffix(f"{destination.suffix}.tmp")
        temporary.write_text(
            json.dumps(data, indent=2, default=_json_default) + "\n", encoding="utf-8"
        )
        temporary.replace(destination)

    def write_yaml(self, name: str, data: dict[str, Any]) -> None:
        (self.path / name).write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

    def read_manifest(self) -> dict[str, Any]:
        return json.loads((self.path / "manifest.json").read_text(encoding="utf-8"))

    def write_manifest(self, manifest: dict[str, Any]) -> None:
        self.write_json("manifest.json", manifest)

    def save_input(self, name: str, contents: bytes) -> Path:
        destination = self.inputs_path / safe_name(name)
        destination.write_bytes(contents)
        return destination

    def update(self, *, status: str, progress: int, stage: str, **values: Any) -> None:
        manifest = self.read_manifest()
        manifest.update(
            {
                "status": status,
                "progress": max(0, min(100, round(progress))),
                "stage": stage,
                **values,
            }
        )
        self.write_manifest(manifest)
        self.append_event(
            {
                "at": datetime.now(UTC).isoformat(),
                "status": status,
                "progress": manifest["progress"],
                "stage": stage,
            }
        )

    def append_frame(self, data: dict[str, Any]) -> None:
        with self.frames_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(data, default=_json_default) + "\n")

    def write_frames(self, records: list[dict[str, Any]]) -> None:
        temporary = self.frames_path.with_suffix(".jsonl.tmp")
        with temporary.open("w", encoding="utf-8") as stream:
            for record in records:
                stream.write(json.dumps(record, default=_json_default) + "\n")
        temporary.replace(self.frames_path)

    def append_baseline(self, data: dict[str, Any]) -> None:
        with self.references_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(data, default=_json_default) + "\n")

    def append_event(self, data: dict[str, Any]) -> None:
        with self.events_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(data, default=_json_default) + "\n")

    def complete(self, metrics: dict[str, Any], artifacts: list[dict[str, Any]]) -> None:
        finished_at = datetime.now(UTC)
        metrics = {
            **metrics,
            "run_id": self.run_id,
            "started_at": self._started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round((finished_at - self._started_at).total_seconds(), 3),
        }
        self.write_json("metrics.json", metrics)
        self.write_json("artifacts.json", {"artifacts": artifacts})
        self.update(
            status="completed",
            progress=100,
            stage="Run complete",
            finished_at=finished_at.isoformat(),
        )

    def fail(self, message: str) -> None:
        self.update(
            status="failed",
            progress=self.read_manifest().get("progress", 0),
            stage="Run failed",
            finished_at=datetime.now(UTC).isoformat(),
            error=message,
        )


def read_run(path: str | Path) -> dict[str, Any]:
    run_path = Path(path)
    manifest = json.loads((run_path / "manifest.json").read_text(encoding="utf-8"))
    metrics_path = run_path / "metrics.json"
    artifacts_path = run_path / "artifacts.json"
    manifest["metrics"] = (
        json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.is_file() else None
    )
    manifest["artifacts"] = (
        json.loads(artifacts_path.read_text(encoding="utf-8")).get("artifacts", [])
        if artifacts_path.is_file()
        else []
    )
    return manifest


def list_runs(root: str | Path) -> list[dict[str, Any]]:
    root_path = Path(root).expanduser().resolve()
    if not root_path.exists():
        return []
    runs: list[dict[str, Any]] = []
    for path in sorted(root_path.iterdir(), reverse=True):
        if not path.is_dir() or not (path / "manifest.json").is_file():
            continue
        try:
            runs.append(read_run(path))
        except (OSError, json.JSONDecodeError, KeyError):
            continue
    return runs
