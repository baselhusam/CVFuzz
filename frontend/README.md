# CVFuzz frontend

The CVFuzz web interface is a local-first Next.js application for uploading a detector and a
video, running robustness analysis, reviewing the original inference stream beside nine
full-length augmentation streams, and comparing their metrics.

## Stack

- Next.js 16 App Router and React 19
- Tailwind CSS 4
- Framer Motion
- shadcn/ui primitives with Base UI
- TypeScript

## Development

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. With no API URL configured, the run action uses a local preview
sequence and the page starts with a synthetic sample run. Uploaded videos stay in the browser
and are reused across the synchronized comparison wall.

Run the quality checks with:

```bash
npm run lint
npm run typecheck
npm run build:webpack
```

`build:webpack` is provided for sandboxed environments where Turbopack cannot open its CSS
worker port. The standard `npm run build` remains available.

## API connection

Copy the example environment file and point it at the future CVFuzz HTTP service:

```bash
cp .env.example .env.local
```

The client submits multipart form data to `POST {NEXT_PUBLIC_CVFUZZ_API_URL}/v1/runs` with:

- `model`: `.pt`, `.onnx`, or `.engine` model file
- `video`: `.mp4`, `.mov`, `.webm`, or `.mkv` video file

The accepted response contract is:

```json
{
  "id": "run-id",
  "statusUrl": "/v1/runs/run-id"
}
```

The API adapter is isolated in `src/lib/run-service.ts`, so polling or server-sent progress,
artifact URLs, and parameter controls can be added without coupling them to the UI components.

## Current integration boundary

The Python CLI currently emits manifests, JSONL measurements, summaries, and failure images.
It does not yet expose HTTP endpoints or render annotated full-length videos. The frontend makes
that boundary explicit: its sample data exercises the complete result experience, while a set
`NEXT_PUBLIC_CVFUZZ_API_URL` switches the Run action to the live upload endpoint.
