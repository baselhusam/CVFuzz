# CVFuzz backend

CVFuzz provides two independent local-first workflows:

- Boundary search finds the smallest realistic degradation that destabilizes an object.
- Full-stream evaluation renders the original plus one full annotated video for every enabled
  augmentation and evaluates the detector on every frame of every stream.

Both workflows use filesystem artifacts. No database or remote service is required.

## Setup

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev,yolo]'
```

The `yolo` extra is only needed to run Ultralytics `.pt` models. Core transforms and tests do
not import Ultralytics.

## Full web workflow

Start the API from `backend/`:

```bash
source .venv/bin/activate
cvfuzz serve
```

The API loads `CVFUZZ_API_HOST` and `CVFUZZ_API_PORT` from `backend/.env`; the tracked defaults
listen on `http://127.0.0.1:8020`. The `--host` and `--port` command options take precedence.
It stores uploaded models, source videos, run state,
metrics, and generated videos under `.cvfuzz/web-runs/`. API documentation is available at
`http://127.0.0.1:8020/docs`.

The main endpoints are `POST /v1/runs`, `GET /v1/runs`, `GET /v1/runs/{id}`, and the artifact
route returned in each completed run.

## CLI workflows

```bash
cvfuzz init-config cvfuzz.yaml
cvfuzz transforms
cvfuzz run /path/to/model.pt /path/to/image-or-video.mp4 --config cvfuzz.yaml
cvfuzz inspect .cvfuzz/runs/<run-id>

# Full-length original + augmentation videos
cvfuzz video-run /path/to/model.pt /path/to/video.mp4 --config cvfuzz.yaml
cvfuzz inspect-video .cvfuzz/runs/<run-id>
```

`run` retains the object-level boundary-search behavior. `video-run` first renders each full
augmentation video, then evaluates the original and each completed augmentation stream. It
creates the same artifacts used by the web application.

## Configuration model

Each transform has one `search_parameter`, whose ordered values represent increasing
severity. Any other parameter can also define multiple values; those values create independent
variants. For example, motion-blur kernel sizes are searched separately for every configured
angle.

`identity_value` defines the unmodified endpoint for the search parameter. It lets CVFuzz
refine a boundary even when the first configured level already causes a failure. Use `0` for
effects such as exposure loss, fog, glare, and occlusion; discrete transforms such as JPEG
quality and motion-blur kernels are reported at the actual configured value rather than as a
fractional estimate.

Parameters support either explicit values:

```yaml
kernel_size:
  values: [3, 5, 7, 9, 11]
```

or an inclusive numeric range:

```yaml
stops:
  range: {start: -0.5, stop: -3.0, step: -0.5}
```

Keep search values ordered from least to most severe. Continuous boundary refinement is
available for transforms that support meaningful interpolation.

Each transform also has explicit `render_parameters`. These values select the single severity
used for that transform's full-length output video:

```yaml
motion_blur:
  search_parameter: kernel_size
  render_parameters: {kernel_size: 11, angle_degrees: 45}
  parameters:
    kernel_size: {values: [3, 5, 7, 9, 11, 15, 21]}
    angle_degrees: {values: [0, 45, 90]}
```

## Full-stream artifact layout

```text
.cvfuzz/web-runs/<run-id>/
├── inputs/
│   ├── model.pt
│   └── source.mp4
├── augmented/
│   ├── exposure.mp4
│   └── ... raw, full-length augmentation intermediates
├── artifacts/
│   ├── original.mp4
│   ├── exposure.mp4
│   └── ... one MP4 per enabled transform
├── manifest.json
├── config.yaml
├── events.jsonl
├── baseline.jsonl
├── frames.jsonl
├── metrics.json
└── artifacts.json
```

The run first creates raw videos under `augmented/`, one at a time. It then evaluates the source
and each generated stream, producing annotated browser-facing videos in `artifacts/`. A baseline
reference index is persisted in `baseline.jsonl` so target-aware augmentations and later
evaluation stages use the same original-frame detections. When `ffmpeg` is available, CVFuzz
finalizes the videos as H.264/yuv420p with fast-start metadata for reliable browser playback.
OpenCV's MP4 writer is used as a local fallback.
