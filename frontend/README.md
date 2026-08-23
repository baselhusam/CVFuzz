# CVFuzz frontend

The CVFuzz web interface is a local-first Next.js application for creating and browsing
full-stream robustness runs. It uploads one detector and one video to the Python API, follows
the persisted run progress, then displays the real annotated original and augmentation videos
with their computed metrics.

There is no synthetic preview or hard-coded result data. The interface requires the local API.

## Development

Start the backend in one terminal:

```bash
cd backend
source .venv/bin/activate
cvfuzz serve
```

Start the frontend in another:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3010`. Runs are stored by the API under
`backend/.cvfuzz/web-runs/` and reappear in the left sidebar after a restart.

`frontend/.env` controls both connections:

```dotenv
PORT=3010
NEXT_PUBLIC_CVFUZZ_API_URL=http://127.0.0.1:8020
```

The startup wrapper loads `PORT` before invoking Next.js, because Next.js cannot use a `PORT`
declared in `.env` by itself. `NEXT_PUBLIC_CVFUZZ_API_URL` is intentionally browser-visible;
do not put secrets in variables with the `NEXT_PUBLIC_` prefix.

## API usage

`NEXT_PUBLIC_CVFUZZ_API_URL` defaults to `http://127.0.0.1:8020`. The browser uses:

- `GET /v1/config` for the enabled full-video transform parameters.
- `POST /v1/runs` for multipart model and video upload.
- `GET /v1/runs` for the run archive.
- `GET /v1/runs/{id}` for progress, metrics, and artifact metadata.
- `GET /v1/runs/{id}/artifacts/{name}` for byte-range MP4 playback.

Supported model filenames are `.pt`, `.onnx`, and `.engine`, provided they can be loaded by the
Ultralytics adapter. Supported video containers are MP4, MOV, AVI, MKV, WebM, and M4V.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build:webpack
```

`build:webpack` is useful in sandboxed environments where Turbopack cannot open a worker port.
