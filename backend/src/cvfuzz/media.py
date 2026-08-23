from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import cv2

from cvfuzz.exceptions import CVFuzzError
from cvfuzz.types import Frame

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def iter_frames(
    source: str | Path,
    *,
    sample_every_n_frames: int,
    max_frames: int | None,
) -> Iterator[Frame]:
    source_path = Path(source).expanduser().resolve()
    if not source_path.exists():
        raise CVFuzzError(f"Input does not exist: {source_path}")

    if source_path.is_dir():
        image_paths = sorted(
            path for path in source_path.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES
        )
        if not image_paths:
            raise CVFuzzError(f"No supported images found in: {source_path}")
        yielded = 0
        for index, image_path in enumerate(image_paths):
            if index % sample_every_n_frames:
                continue
            image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if image is None:
                continue
            yield Frame(image=image, index=index, timestamp_seconds=None, source=image_path)
            yielded += 1
            if max_frames is not None and yielded >= max_frames:
                return
        return

    suffix = source_path.suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        image = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
        if image is None:
            raise CVFuzzError(f"Could not decode image: {source_path}")
        yield Frame(image=image, index=0, timestamp_seconds=None, source=source_path)
        return

    if suffix not in VIDEO_SUFFIXES:
        raise CVFuzzError(f"Unsupported input type: {source_path.suffix or '<none>'}")
    capture = cv2.VideoCapture(str(source_path))
    if not capture.isOpened():
        raise CVFuzzError(f"Could not open video: {source_path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    yielded = 0
    frame_index = 0
    try:
        while True:
            success, image = capture.read()
            if not success:
                break
            if frame_index % sample_every_n_frames == 0:
                timestamp = frame_index / fps if fps > 0 else None
                yield Frame(
                    image=image,
                    index=frame_index,
                    timestamp_seconds=timestamp,
                    source=source_path,
                )
                yielded += 1
                if max_frames is not None and yielded >= max_frames:
                    return
            frame_index += 1
    finally:
        capture.release()
