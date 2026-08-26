# Self-hosting CVFuzz

CVFuzz is designed for a single trusted operator on one Linux host. Docker Compose supplies a
repeatable production-style deployment; the native setup remains the recommended development
workflow on macOS, especially when using Apple MPS acceleration.

## What Compose runs

```text
browser -> frontend :3010 -> private backend :8020 -> persistent cvfuzz-data volume
```

Only the frontend port is published to the host. It proxies browser requests from `/api/*` to the
backend over the internal Compose network, so the API itself is not reachable from the network.
The `cvfuzz-data` named volume persists uploaded models, source videos, run state, and generated
artifacts across restarts and image upgrades.

## Prerequisites

- Docker Engine 25+ with the Docker Compose plugin
- At least 16 GB RAM and enough local disk for the model, source video, intermediate data, and
  generated artifacts. Plan for several times the source video size per run.
- A Linux host for Docker acceleration. CPU inference works everywhere Docker supports Linux
  containers, but the GPU profile requires a Linux NVIDIA host.

## Start a CPU deployment

From the repository root:

```bash
make up
```

Open `http://localhost:3010`. Check service state or follow a run:

```bash
make ps
make logs
```

The frontend waits for the backend health endpoint before it starts. Stop services without
removing runs with:

```bash
make down
```

To use a different host port, set `CVFUZZ_WEB_PORT` before starting. For example,
`CVFUZZ_WEB_PORT=8080 make up` publishes the frontend on port 8080.

## NVIDIA GPU deployment

Install the NVIDIA driver and NVIDIA Container Toolkit on the Linux host, then verify Docker can
see the GPU using your normal NVIDIA Container Toolkit validation command. Start CVFuzz with:

```bash
make up-gpu
```

The GPU override builds PyTorch from its CUDA 13.0 wheel index and reserves all NVIDIA GPUs for the
backend container. In the UI, choose Automatic or CUDA when available. Docker Desktop on macOS
does **not** expose Apple MPS to Linux containers; use the native backend setup on macOS to use
MPS.

## Data, updates, and recovery

`cvfuzz-data` is the only durable Compose volume. Inspect it with `docker volume inspect
cvfuzz_cvfuzz-data`; back it up before major upgrades. `make down` leaves the volume intact.
Removing it with `docker compose down --volumes` permanently deletes all uploaded inputs and run
artifacts.

To update CVFuzz, pull the desired source revision and run `make up`. Compose rebuilds the images
and preserves the named volume.

## Security boundary

This baseline is for a trusted, single-user environment. CVFuzz accepts uploaded model files that
the inference stack loads, so do not expose it directly to the public internet or allow untrusted
users to upload models. For remote access, put an authenticated TLS reverse proxy or VPN in front
of port 3010, enforce upload-size and rate limits there, and restrict access to trusted users.

Run jobs are currently executed inside the API process and share its filesystem volume. Multi-user
hosting, arbitrary public uploads, job isolation, and distributed workers are future architecture
work—not properties provided by this Compose deployment.
