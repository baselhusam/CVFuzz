export type RunProgress = {
  progress: number
  label: string
}

export type RunSubmission = {
  model: File
  video: File
  onProgress: (progress: RunProgress) => void
}

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration))

async function runLocalPreview(onProgress: RunSubmission["onProgress"]) {
  const steps: RunProgress[] = [
    { progress: 8, label: "Loading model adapter" },
    { progress: 19, label: "Reading the full video stream" },
    { progress: 38, label: "Running baseline inference" },
    { progress: 56, label: "Rendering 9 augmentation streams" },
    { progress: 76, label: "Matching detections across frames" },
    { progress: 91, label: "Calculating robustness metrics" },
    { progress: 100, label: "Run complete" },
  ]

  for (const step of steps) {
    await wait(step.progress === 100 ? 260 : 520)
    onProgress(step)
  }
}

export async function submitRun({ model, video, onProgress }: RunSubmission) {
  const apiUrl = process.env.NEXT_PUBLIC_CVFUZZ_API_URL

  if (!apiUrl) {
    await runLocalPreview(onProgress)
    return { mode: "preview" as const, runId: `local-${Date.now()}` }
  }

  onProgress({ progress: 4, label: "Uploading model and video" })
  const body = new FormData()
  body.append("model", model)
  body.append("video", video)

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/runs`, {
    method: "POST",
    body,
  })

  if (!response.ok) {
    throw new Error(`CVFuzz API returned ${response.status}`)
  }

  const run = (await response.json()) as { id: string; statusUrl?: string }
  onProgress({ progress: 100, label: "Run accepted by CVFuzz" })
  return { mode: "api" as const, runId: run.id, statusUrl: run.statusUrl }
}
