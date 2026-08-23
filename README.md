# CVFuzz

**Find what breaks your computer vision model automatically.**

CVFuzz is a local-first robustness testing tool for computer vision models. Its primary web
workflow takes one model and one video, creates one full-length video per configured
augmentation, applies the model to the original and every transformed frame, and exposes the
playable outputs plus robustness metrics as persistent runs.

The original CLI boundary-search workflow remains available for finding the smallest change
that destabilizes a specific object.

Instead of reporting only that motion blur reduces accuracy, CVFuzz aims to answer questions
such as:

> At what blur kernel, exposure loss, fog strength, or occlusion percentage does this specific
> detection fail?

CVFuzz currently includes a Python backend and CLI plus a Next.js frontend for the visual
robustness workflow. The first supported model adapter targets Ultralytics YOLO object-detection
models.

## Current capabilities

- Upload a model and video through the local web application.
- Apply all nine configured transformations to every decoded video frame.
- Run inference on the original and every augmented stream.
- Render ten annotated videos: one original plus nine augmentation outputs.
- Persist uploads, progress, per-frame JSONL, metrics, and artifacts without a database.
- Browse past runs, synchronized videos, failures, confidence, and retention in the frontend.
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

## How the web workflow works

```text
model + video
        │
        ▼
baseline inference on every frame
        │
        ▼
9 configured frame transformations
        │
        ▼
9 transformed inference passes per frame
        │
        ▼
annotated original + augmented MP4s
        │
        ▼
file-backed run + metrics + synchronized UI
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

The [frontend](frontend/README.md) provides the model/video upload workflow, persistent run
sidebar, synchronized original and augmentation video wall, run progress, and real comparison
metrics. Start the Python API first:

```bash
cd backend
source .venv/bin/activate
cvfuzz serve
```

Then start the frontend in another terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## YAML transformation configuration

Each transformation identifies one ordered `search_parameter`. Other parameters can contain
multiple values, creating independent variants. For example, this configuration searches the
minimum breaking kernel size separately for three motion directions. `render_parameters`
selects the single variant used for the full-length web output:

```yaml
transforms:
  motion_blur:
    enabled: true
    search_parameter: kernel_size
    identity_value: 1
    render_parameters: {kernel_size: 11, angle_degrees: 45}
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

## Full-stream run artifacts

CVFuzz stores each run in a self-contained directory:

```text
.cvfuzz/web-runs/<run-id>/
├── inputs/
├── artifacts/
│   ├── original.mp4
│   ├── exposure.mp4
│   └── ...
├── config.yaml
├── manifest.json
├── events.jsonl
├── frames.jsonl
├── metrics.json
└── artifacts.json
```

The older boundary-search `cvfuzz run` command continues to write `results.jsonl`,
`summary.json`, and failure images under its configured output directory.

## Development

From `backend/` with the virtual environment activated:

```bash
ruff check .
pytest
pytest --cov=cvfuzz --cov-report=term-missing
```

The current suite covers YAML validation, image transformations, failure classification,
boundary refinement, full-stream rendering, file persistence, multipart API runs, and range
requests for playable artifacts.

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

- Annotated datasets and ground-truth evaluation
- Combination and stochastic transformation search
- HTML reports and shareable failure cards
- Model and run comparison
- Additional model formats and task adapters
- CI robustness policies and regression gates

## License note

CVFuzz does not currently include a public project license. Ultralytics software and model
weights have their own licensing terms; review them before distributing a product that depends
on the Ultralytics adapter.
