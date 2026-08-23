from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
import yaml

from cvfuzz.exceptions import CVFuzzError


def _json_default(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "to_dict"):
        return value.to_dict()
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-") or "artifact"


class RunStore:
    def __init__(
        self, root: Path, *, model: dict[str, str], source: Path, config: dict[str, Any]
    ) -> None:
        timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        self.run_id = f"{timestamp}-{uuid.uuid4().hex[:8]}"
        self.path = root.expanduser().resolve() / self.run_id
        self.failures_path = self.path / "failures"
        self.path.mkdir(parents=True, exist_ok=False)
        self.failures_path.mkdir()
        self._results_file = self.path / "results.jsonl"
        self._started_at = datetime.now(UTC)
        self.write_yaml("config.yaml", config)
        self.write_json(
            "manifest.json",
            {
                "schema_version": 1,
                "run_id": self.run_id,
                "status": "running",
                "started_at": self._started_at.isoformat(),
                "model": model,
                "source": str(source.expanduser().resolve()),
            },
        )

    def write_json(self, name: str, data: dict[str, Any]) -> None:
        (self.path / name).write_text(
            json.dumps(data, indent=2, default=_json_default) + "\n",
            encoding="utf-8",
        )

    def write_yaml(self, name: str, data: dict[str, Any]) -> None:
        (self.path / name).write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

    def append_result(self, data: dict[str, Any]) -> None:
        with self._results_file.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(data, default=_json_default) + "\n")

    def save_failure_image(self, name: str, image: Any) -> Path:
        path = self.failures_path / f"{safe_name(name)}.jpg"
        if not cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, 92]):
            raise CVFuzzError(f"Could not write failure image: {path}")
        return path

    def complete(self, summary: dict[str, Any]) -> None:
        finished_at = datetime.now(UTC)
        summary = {
            **summary,
            "run_id": self.run_id,
            "started_at": self._started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": (finished_at - self._started_at).total_seconds(),
        }
        self.write_json("summary.json", summary)
        manifest = json.loads((self.path / "manifest.json").read_text(encoding="utf-8"))
        manifest.update({"status": "completed", "finished_at": finished_at.isoformat()})
        self.write_json("manifest.json", manifest)

    def fail(self, message: str) -> None:
        manifest_path = self.path / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest.update(
            {
                "status": "failed",
                "finished_at": datetime.now(UTC).isoformat(),
                "error": message,
            }
        )
        self.write_json("manifest.json", manifest)


def load_summary(run_directory: str | Path) -> dict[str, Any]:
    path = Path(run_directory).expanduser().resolve() / "summary.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise CVFuzzError(f"Could not read run summary: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CVFuzzError(f"Invalid run summary: {path}") from exc
