# CVFuzz backend

CVFuzz searches for the smallest realistic image degradation that destabilizes an object
detector. This backend is intentionally local-first: it has a reusable Python engine, a CLI,
and filesystem run artifacts. It does not require an API server or database.

## Setup

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev,yolo]'
```

The `yolo` extra is only needed to run Ultralytics `.pt` models. Core transforms and tests do
not import Ultralytics.

## Run

```bash
cvfuzz init-config cvfuzz.yaml
cvfuzz transforms
cvfuzz run /path/to/model.pt /path/to/image-or-video.mp4 --config cvfuzz.yaml
cvfuzz inspect .cvfuzz/runs/<run-id>
```

Results are stored in a self-contained run directory under `.cvfuzz/runs` by default. Each
run includes its resolved configuration, manifest, JSONL results, summary, and saved failure
images.

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
