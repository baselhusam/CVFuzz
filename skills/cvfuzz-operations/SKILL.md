---
name: cvfuzz-operations
description: Use and operate CVFuzz through its CLI, native local web workflow, or Docker Compose deployment. Use when asked to run, serve, deploy, inspect, or troubleshoot the platform.
---

# CVFuzz operations

Choose the workflow that matches the user's intent. CVFuzz is local-first: it uses filesystem
artifacts and does not require a database or a separate network service.

## Choose a workflow

| User intent | Workflow |
| --- | --- |
| Run a robustness evaluation from files or inspect an existing run | CLI from `backend/` |
| Develop or use the local browser interface | Native API and frontend in separate terminals |
| Run a durable, production-style local deployment | Docker Compose from the repository root |

Do not start, stop, restart, or build long-running services unless the user asks for that action.

## CLI workflow

Work from `backend/` using Python 3.11 and `backend/.venv`. If the environment has not been
created, create it and install the required extras before attempting a model-backed run:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev,yolo]'
```

Use `cvfuzz init-config`, `cvfuzz validate-config`, and `cvfuzz transforms` to create and verify
configuration. Use `cvfuzz run` for object-level failure-boundary search, and `cvfuzz video-run`
for full-stream evaluation. Use `cvfuzz inspect` or `cvfuzz inspect-video` to review their
results. CLI runs default to `.cvfuzz/runs/` relative to the working directory.

Read `backend/README.md` when selecting CLI options or explaining full-stream artifacts.

## Native web-development workflow

Run the API from an activated `backend/.venv`:

```bash
cd backend
source .venv/bin/activate
cvfuzz serve
```

The tracked local defaults are API `http://127.0.0.1:8020` and API documentation at `/docs`.
The API reads `backend/.env`; `--host` and `--port` take precedence. Web uploads and generated
artifacts are stored at `backend/.cvfuzz/web-runs/` unless `CVFUZZ_RUNS_DIR` overrides it.

In a second terminal, run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3010`. The frontend defaults to the local API, but its `frontend/.env`
can set `NEXT_PUBLIC_CVFUZZ_API_URL` and `PORT`. Do not place secrets in `NEXT_PUBLIC_` variables.

For frontend commands and API interaction details, read `frontend/README.md`.

## Docker Compose workflow

Run Compose commands from the repository root through the Makefile:

```bash
make up       # CPU deployment at http://localhost:3010
make up-gpu   # NVIDIA GPU deployment on a Linux host
make ps
make logs
make down
```

`make up-gpu` is for Linux hosts with NVIDIA Docker support. On macOS, use the native backend
workflow when Apple MPS acceleration is desired. The Compose backend is private to the Compose
network; the frontend publishes the web port (default `3010`).

`make down` preserves the `cvfuzz-data` volume and its runs. Never use `docker compose down
--volumes` or remove that volume unless the user explicitly requests permanent deletion and the
target has been confirmed. Read `docs/deployment.md` for prerequisites, port overrides, updates,
backups, and security boundaries.

## Verification and handoff

After an operation, report the selected workflow, the relevant local URL or artifact location,
and the observed status. For Compose, prefer `make ps` and the service logs. For the native API,
use its health endpoint when verification is requested. Keep model files, uploaded videos,
virtual environments, caches, and generated run artifacts out of version control.
