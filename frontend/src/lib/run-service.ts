import type {
  InferenceDevice,
  RunRecord,
  RunSummary,
  TransformConfig,
} from "@/lib/run-data"

export type RunProgress = {
  progress: number
  label: string
}

const API_URL = (process.env.NEXT_PUBLIC_CVFUZZ_API_URL || "http://127.0.0.1:8020").replace(
  /\/$/,
  "",
)

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string }
    return payload.detail || `CVFuzz API returned ${response.status}`
  } catch {
    return `CVFuzz API returned ${response.status}`
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init })
  } catch {
    throw new Error(`Cannot reach the CVFuzz API at ${API_URL}. Start it with: cvfuzz serve`)
  }
  if (!response.ok) throw new Error(await responseError(response))
  return (await response.json()) as T
}

function withArtifactUrls(run: RunRecord): RunRecord {
  return {
    ...run,
    artifacts: run.artifacts.map((artifact) => ({
      ...artifact,
      url: artifact.url.startsWith("http") ? artifact.url : `${API_URL}${artifact.url}`,
    })),
  }
}

export async function getRuns() {
  const payload = await request<{ runs: RunSummary[] }>("/v1/runs")
  return payload.runs
}

export async function getRun(id: string) {
  return withArtifactUrls(await request<RunRecord>(`/v1/runs/${encodeURIComponent(id)}`))
}

export async function getTransformConfig() {
  const payload = await request<{
    version: number
    transforms: TransformConfig[]
    default_device?: InferenceDevice["id"]
    devices?: InferenceDevice[]
  }>("/v1/config")
  const supportsDeviceSelection = Array.isArray(payload.devices)
  const devices = supportsDeviceSelection
    ? payload.devices
    : [{ id: "auto" as const, name: "Automatic", description: "Server default", available: true }]
  return {
    ...payload,
    devices,
    default_device: payload.default_device ?? "auto",
    supportsDeviceSelection,
  }
}

type RunSubmission = {
  model: File
  video: File
  device?: InferenceDevice["id"]
  onProgress: (progress: RunProgress) => void
  onAccepted?: (run: RunRecord) => void
  onUpdate?: (run: RunRecord) => void
}

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration))

export async function submitRun({
  model,
  video,
  device,
  onProgress,
  onAccepted,
  onUpdate,
}: RunSubmission) {
  onProgress({ progress: 1, label: "Uploading model and video" })
  const body = new FormData()
  body.append("model", model)
  body.append("video", video)
  if (device) body.append("device", device)
  const accepted = await request<{ id: string }>("/v1/runs", { method: "POST", body })
  let run = await getRun(accepted.id)
  onAccepted?.(run)

  while (run.status === "queued" || run.status === "running") {
    onProgress({ progress: run.progress, label: run.stage })
    onUpdate?.(run)
    await wait(900)
    run = await getRun(run.id)
  }
  onUpdate?.(run)
  if (run.status === "failed") throw new Error(run.error || "The CVFuzz run failed")
  onProgress({ progress: 100, label: "Run complete" })
  return run
}
