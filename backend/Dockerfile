FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CVFUZZ_API_HOST=0.0.0.0 \
    CVFUZZ_API_PORT=8020 \
    CVFUZZ_RUNS_DIR=/data/web-runs

WORKDIR /app

ARG TORCH_VERSION=2.12.1
ARG TORCHVISION_VERSION=0.27.1
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

# FFmpeg produces browser-playable artifacts. The shared libraries are required by OpenCV.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/README.md ./
COPY backend/src ./src
COPY backend/configs ./configs
# Keep CPU deployments lean. The GPU Compose override changes only TORCH_INDEX_URL to the
# matching CUDA wheel index, so both images run exactly the same CVFuzz application code.
RUN pip install --no-cache-dir \
        --index-url "$TORCH_INDEX_URL" \
        "torch==$TORCH_VERSION" "torchvision==$TORCHVISION_VERSION" \
    && pip install --no-cache-dir ".[yolo]"

RUN groupadd --gid 10001 cvfuzz \
    && useradd --uid 10001 --gid cvfuzz --create-home --shell /usr/sbin/nologin cvfuzz \
    && mkdir -p /data/web-runs \
    && chown -R cvfuzz:cvfuzz /data

USER cvfuzz

EXPOSE 8020

CMD ["cvfuzz", "serve"]
