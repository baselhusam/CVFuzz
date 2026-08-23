# CVFuzz

**Find what breaks your computer vision model automatically.**

CVFuzz is a local-first robustness testing tool for computer vision models. It applies
realistic, parameterized transformations and searches for the smallest change that destabilizes
each object detected in an image or video.

Instead of reporting only that motion blur reduces accuracy, CVFuzz aims to answer questions
such as:

> At what blur kernel, exposure loss, fog strength, or occlusion percentage does this specific
> detection fail?

CVFuzz currently includes a Python backend and CLI plus a Next.js frontend for the visual
robustness workflow. The first supported model adapter targets Ultralytics YOLO object-detection
models.

## Current capabilities

- Run YOLO `.pt` models against images, image directories, and videos.
- Use the original prediction as a metamorphic reference when annotations are unavailable.
- Detect missed objects, confidence collapse, class changes, and localization drift.
- Search object-level failure boundaries using configured severity levels and numeric refinement.
- Configure every transformation and parameter sweep through YAML.
- Reuse transformed inference results across objects when possible.
- Store portable manifests, JSONL results, summaries, and failure images without a database.

The initial transformation set includes:

- Exposure
- Low light with sensor-like noise
- Motion blur
- Defocus blur
- JPEG compression
- Resolution degradation
- Fog
- Target-aware partial occlusion
- Glare

## How it works

```text
model + image/video
        │
        ▼
baseline detections
        │
        ▼
parameterized transformations
        │
        ▼
transformed inference + object matching
        │
        ▼
failure detection
        │
        ▼
minimum breaking boundary + reproducible artifacts
```

Without ground-truth annotations, a changed prediction represents model instability rather than
proof that the transformed prediction is objectively wrong. Annotated evaluation is planned as
a separate mode.

## Requirements

- Python 3.11
- macOS or Linux
- A supported Ultralytics YOLO detection model

GPU acceleration is optional. CVFuzz can run on CPU.

## Quick start

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev,yolo]'
```

Create an editable configuration and inspect the built-in transforms:

```bash
cvfuzz init-config cvfuzz.yaml
cvfuzz validate-config cvfuzz.yaml
cvfuzz transforms
```

Run a fuzz test:

```bash
cvfuzz run /path/to/yolo11n.pt /path/to/street.mp4 --config cvfuzz.yaml
```

Inspect a completed run:

```bash
cvfuzz inspect .cvfuzz/runs/<run-id>
```

See the [backend documentation](backend/README.md) for package and configuration details.

## Web interface

The [frontend](frontend/README.md) provides the model/video upload workflow, synchronized
original and augmentation video wall, light and dark themes, run progress, and comparison
metrics. Until the Python engine gains an HTTP and video-rendering layer, it uses a clearly
labeled local preview workflow and a typed API adapter for the future `POST /v1/runs` endpoint.

```bash
cd frontend
npm install
npm run dev
```

## YAML transformation configuration

Each transformation identifies one ordered `search_parameter`. Other parameters can contain
multiple values, creating independent variants. For example, this configuration searches the
minimum breaking kernel size separately for three motion directions:

```yaml
transforms:
  motion_blur:
    enabled: true
    search_parameter: kernel_size
    identity_value: 1
    parameters:
      kernel_size:
        values: [3, 5, 7, 9, 11, 15, 21]
      angle_degrees:
        values: [0, 45, 90]
```

Numeric parameters may also use inclusive ranges:

```yaml
stops:
  range:
    start: -0.5
    stop: -3.0
    step: -0.5
```

The complete starting configuration is available in
[`backend/configs/default.yaml`](backend/configs/default.yaml). A smaller end-to-end test profile
is available in [`backend/configs/smoke.yaml`](backend/configs/smoke.yaml).

## Run artifacts

CVFuzz stores each run in a self-contained directory:

```text
.cvfuzz/runs/<run-id>/
├── config.yaml
├── manifest.json
├── results.jsonl
├── summary.json
└── failures/
```

The run configuration, transformation seed, model identity, input path, boundary parameters,
baseline prediction, transformed prediction, failure classification, and saved image location
are recorded for reproducibility.

## Development

From `backend/` with the virtual environment activated:

```bash
ruff check .
pytest
pytest --cov=cvfuzz --cov-report=term-missing
```

The current suite covers YAML validation and expansion, image-transformation contracts,
deterministic augmentation, failure classification, boundary refinement, and end-to-end local
artifact generation.

## Repository structure

```text
CVFuzz/
├── AGENTS.md
├── README.md
├── frontend/
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
└── backend/
    ├── configs/
    ├── src/cvfuzz/
    │   ├── models/
    │   └── transforms/
    └── tests/
```

## Roadmap

- Multi-frame video sampling controls and automatic empty-frame skipping
- Annotated datasets and ground-truth evaluation
- Combination and stochastic transformation search
- Detection overlays, HTML reports, and shareable failure cards
- Model and run comparison
- Additional model formats and task adapters
- Backend HTTP API and full-length annotated video rendering
- CI robustness policies and regression gates

## License note

CVFuzz does not currently include a public project license. Ultralytics software and model
weights have their own licensing terms; review them before distributing a product that depends
on the Ultralytics adapter.
