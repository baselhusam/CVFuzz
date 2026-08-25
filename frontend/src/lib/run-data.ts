export type RunStatus = "queued" | "running" | "completed" | "failed"

export type TimelinePoint = {
  frame: number
  timestamp_seconds: number
  retention: number
  failures: number
}

export type TransformMetrics = {
  id: string
  name: string
  parameters: Record<string, unknown>
  frames: number
  detections: number
  mean_confidence: number
  confidence_delta: number
  retention: number
  failures: number
  affected_frames: number
  first_failure_seconds: number | null
  mean_inference_ms: number
  failures_by_kind: Record<string, number>
  timeline: TimelinePoint[]
}

export type RunMetrics = {
  schema_version: number
  frames_analyzed: number
  video_duration_seconds: number
  fps: number
  resolution: { width: number; height: number }
  inference?: {
    batch_size: number
    image_size: { width: number; height: number }
  }
  baseline: {
    detections: number
    mean_confidence: number
    mean_inference_ms: number
  }
  robustness_score: number
  total_failures: number
  weakest_transform: string | null
  transforms: TransformMetrics[]
  duration_seconds: number
}

export type RunArtifact = {
  id: string
  name: string
  kind: "original" | "augmentation"
  parameters: Record<string, unknown>
  path: string
  bytes: number
  url: string
}

export type RunRecord = {
  id: string
  status: RunStatus
  progress: number
  stage: string
  phase?: "preparing" | "rendering" | "evaluation"
  stage_index?: number
  stage_total?: number
  phase_stage_index?: number
  phase_stage_total?: number
  stage_progress?: number
  started_at: string
  finished_at?: string
  error?: string
  model: {
    name?: string
    adapter?: string
    path?: string
    device?: string
    requested_device?: string
    accelerator?: string
  }
  source: {
    name?: string
    fps?: number
    width?: number
    height?: number
    declared_frames?: number
  }
  transform_count?: number
  inference?: {
    batch_size: number
    image_size: { width: number; height: number }
  }
  metrics: RunMetrics | null
  artifacts: RunArtifact[]
}

export type RunSummary = Omit<RunRecord, "artifacts" | "metrics"> & {
  metrics: Pick<
    RunMetrics,
    | "frames_analyzed"
    | "video_duration_seconds"
    | "robustness_score"
    | "total_failures"
    | "weakest_transform"
    | "duration_seconds"
  > | null
}

export type TransformConfig = {
  id: string
  name: string
  enabled: boolean
  parameters: Record<string, unknown>
  parameter_options?: Record<string, Array<string | number>>
  target_aware: boolean
}

export type InferenceDevice = {
  id: "auto" | "mps" | "cpu"
  name: string
  description: string
  available: boolean
}

export const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

export const formatTime = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return "—"
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0")
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${minutes}:${remainder}`
}

export const formatParameters = (parameters: Record<string, unknown>) =>
  Object.entries(parameters)
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${String(value)}`)
    .join(" · ")
