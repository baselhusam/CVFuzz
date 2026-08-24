"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleStop,
  FlaskConical,
  Gauge,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Server,
  Volume2,
  VolumeX,
} from "lucide-react"
import { FileDropzone } from "@/components/file-dropzone"
import { MetricsPanel } from "@/components/metrics-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { VideoStage } from "@/components/video-stage"
import {
  formatParameters,
  formatTime,
  type InferenceDevice,
  type RunArtifact,
  type RunRecord,
  type RunSummary,
  type TransformConfig,
  type TransformMetrics,
} from "@/lib/run-data"
import { getRun, getRuns, getTransformConfig, submitRun } from "@/lib/run-service"

const reveal = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

function Header({ onNewRun, apiState }: { onNewRun: () => void; apiState: "connecting" | "online" | "offline" }) {
  const apiLabel = apiState === "online" ? "Local API" : apiState === "offline" ? "API offline" : "Connecting"
  const apiTone = apiState === "online" ? "bg-stable" : apiState === "offline" ? "bg-failed" : "border border-queued"
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b border-border bg-card/95 px-4 backdrop-blur-xl sm:px-5">
      <button type="button" onClick={onNewRun} className="flex shrink-0 items-center gap-2.5 rounded-md">
        <Image src="/brand/cvfuzz-symbol-dark.svg" alt="" width={24} height={24} priority />
        <span className="text-[15px] font-semibold tracking-[-0.035em]">CVFuzz</span>
      </button>
      <span className="hidden h-5 w-px bg-border sm:block" />
      <div className="hidden min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground sm:flex">
        <span>Failure boundary lab</span>
        <ChevronRight className="size-3 text-queued" />
        <span className="truncate text-foreground">Runs</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="hidden h-8 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground md:flex" />
            }
          >
            <span className={`size-1.5 rounded-full ${apiTone}`} /> {apiLabel}
          </TooltipTrigger>
          <TooltipContent>{apiState === "offline" ? "Start the API with cvfuzz serve" : "Run data stays on this machine"}</TooltipContent>
        </Tooltip>
        <Button onClick={onNewRun}>
          <Plus className="size-3.5" /> New run
        </Button>
      </div>
    </header>
  )
}

function RunStatus({ status }: { status: RunSummary["status"] }) {
  const styles = {
    completed: "rounded-full bg-stable",
    failed: "bg-failed",
    running: "rotate-45 bg-signal signal-pulse",
    queued: "rounded-full border border-queued",
  }
  return <i className={`size-1.5 shrink-0 ${styles[status]}`} aria-hidden="true" />
}

function RunsSidebar({
  runs,
  selectedId,
  loading,
  onSelect,
  onRefresh,
  onNewRun,
}: {
  runs: RunSummary[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
  onNewRun: () => void
}) {
  return (
    <aside className="min-w-0 border-b border-border bg-card lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:border-b-0 lg:border-r">
      <div className="flex h-12 items-center justify-between border-b border-border px-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground">Run archive</span>
          <span className="num rounded-sm bg-secondary px-1.5 py-0.5 text-[8px] text-steel">{runs.length}</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Refresh runs"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="scrollbar-thin flex gap-2 overflow-x-auto p-2.5 lg:block lg:h-[calc(100%-6.75rem)] lg:space-y-1 lg:overflow-y-auto">
        {runs.map((run) => (
          <button
            type="button"
            key={run.id}
            onClick={() => onSelect(run.id)}
            className={`group min-w-60 rounded-md border p-3 text-left transition-all lg:w-full lg:min-w-0 ${
              selectedId === run.id
                ? "border-white/14 bg-accent"
                : "border-transparent bg-transparent hover:border-border hover:bg-secondary"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-steel">
                <RunStatus status={run.status} /> {run.status}
              </span>
              <span className="num text-[8px] text-muted-foreground">#{run.id.slice(-6)}</span>
            </div>
            <p className="mt-2.5 truncate text-xs font-medium">{run.source.name || "Untitled source"}</p>
            <p className="mt-1 truncate font-mono text-[8.5px] text-muted-foreground">{run.model.name || "Model unavailable"}</p>
            <div className="mt-3 flex items-center justify-between font-mono text-[8px] text-muted-foreground">
              <span>{new Date(run.started_at).toLocaleDateString()}</span>
              <span className={run.status === "failed" ? "text-failed" : "text-steel"}>
                {run.metrics ? `${run.metrics.robustness_score} score` : `${run.progress}%`}
              </span>
            </div>
          </button>
        ))}
        {!runs.length && !loading && (
          <div className="min-w-60 rounded-md border border-dashed border-border p-4 lg:min-w-0">
            <p className="text-xs font-medium">No runs yet</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Your first local evaluation will appear here.</p>
          </div>
        )}
      </div>
      <div className="hidden border-t border-border p-2.5 lg:block">
        <Button variant="outline" onClick={onNewRun} className="w-full justify-start">
          <Plus className="size-3.5" /> Create evaluation
        </Button>
      </div>
    </aside>
  )
}

function RunSetup({
  model,
  video,
  devices,
  device,
  supportsDeviceSelection,
  transforms,
  onModel,
  onVideo,
  onDevice,
  onRun,
  running,
  progress,
  progressLabel,
  error,
}: {
  model: File | null
  video: File | null
  devices: InferenceDevice[]
  device: InferenceDevice["id"]
  supportsDeviceSelection: boolean
  transforms: TransformConfig[]
  onModel: (file: File | null) => void
  onVideo: (file: File | null) => void
  onDevice: (device: InferenceDevice["id"]) => void
  onRun: () => void
  running: boolean
  progress: number
  progressLabel: string
  error: string | null
}) {
  const enabled = transforms.filter((item) => item.enabled)
  const ready = Boolean(model && video)

  return (
    <motion.div variants={reveal} initial="hidden" animate="visible" className="mx-auto max-w-6xl px-1 py-8 md:px-3 md:py-11">
      <section className="relative mb-7 overflow-hidden rounded-lg border border-border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <div className="evidence-grid absolute inset-0 opacity-80" />
        <div className="absolute inset-y-0 right-0 hidden w-2/5 bg-[linear-gradient(90deg,#0b0e12,transparent),url('/brand/cvfuzz-boundary-cover.png')] bg-cover bg-center opacity-30 md:block" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-end">
          <div>
            <p className="section-kicker text-signal">New full-stream evaluation</p>
            <h1 className="mt-4 max-w-[760px] text-[clamp(2.45rem,6vw,4.6rem)] leading-[0.94] tracking-[-0.055em]">
              Find the first change<br className="hidden sm:block" /> that breaks the model.
            </h1>
            <div className="mt-6 h-1.5 w-24 bg-signal" />
          </div>
          <p className="max-w-[48ch] text-[13px] leading-6 text-steel xl:border-l xl:border-white/14 xl:pl-5">
            Upload one detector and one source video. CVFuzz applies every configured transformation,
            compares each frame with the baseline, and stores reproducible evidence locally.
          </p>
        </div>
      </section>

      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="section-kicker">01 / Inputs</p>
          <h2 className="mt-2 text-xl tracking-[-0.03em]">Choose what to probe</h2>
        </div>
        <p className="hidden font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground sm:block">Files stay on this machine</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FileDropzone kind="model" file={model} onFile={onModel} />
        <FileDropzone kind="video" file={video} onFile={onVideo} />
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <p className="section-kicker">02 / Test envelope</p>
            <h2 className="mt-2 text-xl tracking-[-0.03em]">Conditions under evaluation</h2>
          </div>
          <Badge variant="outline">{enabled.length} active streams</Badge>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {enabled.map((item, index) => (
                <div key={item.id} className="flex min-w-0 items-start gap-3 rounded-md border border-border bg-secondary/55 px-3 py-2.5">
                  <span className="num mt-0.5 text-[8px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium">{item.name}</p>
                    <p className="mt-1 truncate font-mono text-[8px] text-muted-foreground">{formatParameters(item.parameters)}</p>
                  </div>
                </div>
              ))}
              {!enabled.length && (
                <div className="col-span-full rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                  Start the local API to load the versioned transformation configuration.
                </div>
              )}
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <label htmlFor="inference-device" className="section-kicker block">Inference device</label>
            <select
              id="inference-device"
              value={device}
              onChange={(event) => onDevice(event.target.value as InferenceDevice["id"])}
              disabled={!supportsDeviceSelection}
              className="mt-2 h-8 w-full appearance-none rounded-md border border-input bg-secondary px-3 text-[12px] text-foreground outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              {devices.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.available}>
                  {option.name}{!option.available ? " — unavailable" : ""}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              {supportsDeviceSelection
                ? devices.find((option) => option.id === device)?.description
                : "The API chooses the available accelerator."}
            </p>
          </div>
        </div>
        <div className="grid gap-4 border-t border-border bg-background/30 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-steel">
            <span className="flex items-center gap-2"><Check className="size-3 text-stable" /> Every frame</span>
            <span className="flex items-center gap-2"><Check className="size-3 text-stable" /> Real inference</span>
            <span className="flex items-center gap-2"><Check className="size-3 text-stable" /> Local artifacts</span>
          </div>
          <Button size="lg" disabled={!ready || running} onClick={onRun} className="min-w-52">
            {running ? (
              <><CircleStop className="size-4 signal-pulse" /> Running {progress}%</>
            ) : (
              <><Play className="size-3.5 fill-current" /> Start evaluation</>
            )}
          </Button>
        </div>
        <AnimatePresence>
          {(running || error) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`overflow-hidden border-t ${error ? "border-failed/30 bg-failed/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-4 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.08em]">
                <span className={error ? "text-failed" : "text-muted-foreground"}>{error ?? progressLabel}</span>
                <span>{error ? "Needs attention" : `${progress}%`}</span>
              </div>
              {!error && <div className="h-0.5 bg-secondary"><motion.div className="h-full bg-signal" animate={{ width: `${progress}%` }} /></div>}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </motion.div>
  )
}

function ResultCard({
  artifact,
  metric,
  registerVideo,
}: {
  artifact: RunArtifact
  metric: TransformMetrics
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
}) {
  const state = metric.failures > 0 ? "Boundary crossed" : "Stable in range"
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-white/15">
      <div className="flex items-start justify-between gap-4 border-b border-border px-3.5 py-3">
        <div className="min-w-0">
          <p className={`font-mono text-[8px] uppercase tracking-[0.12em] ${metric.failures ? "text-failed" : "text-stable"}`}>{state}</p>
          <h3 className="mt-1.5 truncate text-[13px]">{metric.name}</h3>
        </div>
        <span className="max-w-44 text-right font-mono text-[8px] leading-4 text-muted-foreground">{formatParameters(metric.parameters)}</span>
      </div>
      <VideoStage id={artifact.id} videoUrl={artifact.url} label={artifact.name} registerVideo={registerVideo} />
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
        <div className="p-3"><span className="metric-label">Retention</span><p className="num mt-1 text-xs">{metric.retention}%</p></div>
        <div className="p-3"><span className="metric-label">Confidence Δ</span><p className={`num mt-1 text-xs ${metric.confidence_delta < 0 ? "text-failed" : ""}`}>{metric.confidence_delta > 0 ? "+" : ""}{metric.confidence_delta}%</p></div>
        <div className="p-3"><span className="metric-label">Events</span><p className="num mt-1 text-xs">{metric.failures}</p></div>
      </div>
    </article>
  )
}

function VideoWall({ run }: { run: RunRecord }) {
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(run.metrics?.video_duration_seconds || 0)
  const original = run.artifacts.find((item) => item.kind === "original")
  const artifactById = new Map(run.artifacts.map((item) => [item.id, item]))
  const weakest = run.metrics?.transforms.find((item) => item.id === run.metrics?.weakest_transform)

  const registerVideo = (id: string, node: HTMLVideoElement | null) => {
    if (node) videos.current.set(id, node)
    else videos.current.delete(id)
  }
  const togglePlayback = async () => {
    const next = !playing
    setPlaying(next)
    for (const video of videos.current.values()) {
      if (next) await video.play().catch(() => undefined)
      else video.pause()
    }
  }
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    for (const [id, element] of videos.current) element.muted = id !== "original" || next
  }
  const seek = (next: number) => {
    setTime(next)
    for (const element of videos.current.values()) element.currentTime = next
  }

  if (!original || !run.metrics) return null
  const finding = weakest
    ? `${weakest.name} produced ${weakest.failures} object-level failure events across ${weakest.affected_frames} frames. The first event appears at ${formatTime(weakest.first_failure_seconds)}.`
    : "No object-level instability was observed within the configured transformation range."

  return (
    <>
      <section className="py-8 md:py-10">
        <div className="mb-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="section-kicker">Run #{run.id.slice(-8)} / Completed</p>
            <h1 className="mt-2 text-[clamp(2rem,5vw,3.4rem)] tracking-[-0.05em]">Failure boundary evidence</h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-steel">{finding}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline"><span className="size-1.5 rounded-full bg-stable" /> Reproducible</Badge>
            <Badge variant="outline">{run.metrics.transforms.length} streams</Badge>
          </div>
        </div>

        <div className="mb-6 grid overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-card p-4"><span className="metric-label">Model</span><p className="mt-2 truncate text-[13px] font-medium">{run.model.name}</p><p className="mt-1 font-mono text-[8px] text-muted-foreground">{run.model.device || run.model.adapter || "default adapter"}</p></div>
          <div className="border-t border-border bg-card p-4 sm:border-l sm:border-t-0"><span className="metric-label">Source</span><p className="mt-2 truncate text-[13px] font-medium">{run.source.name}</p><p className="mt-1 font-mono text-[8px] text-muted-foreground">{run.metrics.resolution.width}×{run.metrics.resolution.height} · {run.metrics.fps} FPS</p></div>
          <div className="border-t border-border bg-card p-4 xl:border-l xl:border-t-0"><span className="metric-label">Robustness score</span><p className="num mt-2 text-2xl">{run.metrics.robustness_score.toFixed(1)}</p><p className="mt-1 text-[10px] text-muted-foreground">Mean object retention</p></div>
          <div className="border-t border-border bg-card p-4 sm:border-l xl:border-t-0"><span className="metric-label">Failure events</span><p className={`num mt-2 text-2xl ${run.metrics.total_failures ? "text-failed" : "text-stable"}`}>{run.metrics.total_failures}</p><p className="mt-1 text-[10px] text-muted-foreground">Across all transformed streams</p></div>
        </div>

        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="section-kicker">01 / Synchronized evidence</p><h2 className="mt-2 text-xl tracking-[-0.03em]">Baseline and changed conditions</h2></div>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">{run.metrics.frames_analyzed} frames · one timeline</span>
        </div>
        <div className="grid overflow-hidden rounded-lg border border-border xl:grid-cols-[minmax(0,1.65fr)_320px]">
          <div className="bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h3 className="text-[13px]">Original inference</h3><span className="max-w-56 truncate font-mono text-[8.5px] text-muted-foreground">{run.source.name}</span></div>
            <VideoStage
              id="original"
              videoUrl={original.url}
              label="Baseline"
              featured
              registerVideo={registerVideo}
              onTimeUpdate={(nextTime, nextDuration) => {
                setTime(nextTime)
                if (nextDuration) setDuration(nextDuration)
              }}
            />
          </div>
          <aside className="flex flex-col justify-between border-t border-border bg-card p-5 xl:border-l xl:border-t-0">
            <div>
              <div className="flex items-start justify-between gap-5">
                <div><p className="section-kicker">Observed boundary</p><p className="mt-2 text-xl tracking-[-0.03em]">{weakest?.name || "None observed"}</p></div>
                <span className={`flex size-9 items-center justify-center rounded-md border ${weakest ? "border-failed/30 bg-failed/5 text-failed" : "border-stable/30 bg-stable/5 text-stable"}`}><Gauge className="size-4" /></span>
              </div>
              <p className={`mt-5 border-l-2 pl-4 text-[12px] leading-5 text-muted-foreground ${weakest ? "border-failed" : "border-stable"}`}>{finding}</p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border">
              <div className="bg-secondary p-3"><span className="metric-label">Baseline conf.</span><p className="num mt-1.5 text-xl">{run.metrics.baseline.mean_confidence}%</p></div>
              <div className="bg-secondary p-3"><span className="metric-label">First event</span><p className="num mt-1.5 text-xl">{formatTime(weakest?.first_failure_seconds)}</p></div>
            </div>
          </aside>
        </div>
        <div className="flex items-center gap-3 rounded-b-lg border-x border-b border-border bg-card px-4 py-3">
          <button type="button" onClick={togglePlayback} className="flex size-8 items-center justify-center rounded-md bg-signal text-ink" aria-label={playing ? "Pause all videos" : "Play all videos"}>{playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}</button>
          <span className="num w-11 text-[8.5px] text-muted-foreground">{formatTime(time)}</span>
          <input className="timeline-range h-1 flex-1" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Synchronized video timeline" />
          <span className="num w-11 text-[8.5px] text-muted-foreground">{formatTime(duration)}</span>
          <button type="button" onClick={toggleMute} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={muted ? "Unmute original" : "Mute original"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {run.metrics.transforms.map((metric) => {
            const artifact = artifactById.get(metric.id)
            return artifact ? <ResultCard key={metric.id} artifact={artifact} metric={metric} registerVideo={registerVideo} /> : null
          })}
        </div>
      </section>
    </>
  )
}

function ActiveRun({ run }: { run: RunRecord }) {
  if (run.status === "completed" && run.metrics) {
    return <><VideoWall run={run} /><MetricsPanel metrics={run.metrics} /></>
  }
  const stageCounter = run.stage_index && run.stage_total
    ? `Stage ${run.stage_index} of ${run.stage_total}`
    : "Full-stream processing"
  const stageProgress = run.stage_progress ?? run.progress
  return (
    <div className="evidence-grid mx-auto my-8 flex min-h-[calc(100vh-12rem)] max-w-4xl items-center justify-center rounded-lg border border-border p-5">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-7 text-center md:p-10">
        {run.status === "failed" ? (
          <span className="mx-auto flex size-10 items-center justify-center rounded-md border border-failed/30 bg-failed/5 text-failed"><AlertTriangle className="size-5" /></span>
        ) : (
          <span className="mx-auto flex size-10 items-center justify-center rounded-md border border-signal/30 bg-signal-soft text-signal"><LoaderCircle className="size-5 animate-spin" /></span>
        )}
        <p className="section-kicker mt-5">Run #{run.id.slice(-8)}</p>
        <h1 className="mt-3 text-2xl tracking-[-0.035em]">{run.status === "failed" ? "The run stopped" : run.stage}</h1>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-muted-foreground">{run.error || `${run.model.name} × ${run.source.name}`}</p>
        {run.status !== "failed" && (
          <div className="mx-auto mt-8 max-w-xl">
            <div className="mb-2 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground"><span>{stageCounter}</span><span>{stageProgress}%</span></div>
            <div className="h-1 overflow-hidden rounded-full bg-secondary"><motion.div className="h-full bg-signal" animate={{ width: `${stageProgress}%` }} /></div>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingWorkspace() {
  return (
    <div className="mx-auto max-w-6xl py-10" aria-label="Loading local runs">
      <div className="mb-5 h-3 w-32 rounded-sm skeleton" />
      <div className="mb-8 h-16 w-full max-w-2xl rounded-md skeleton" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-60 rounded-lg border border-border skeleton" />
        <div className="h-60 rounded-lg border border-border skeleton" />
      </div>
      <div className="mt-5 h-48 rounded-lg border border-border skeleton" />
      <p className="mt-4 flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground"><span className="size-1.5 rounded-full bg-signal signal-pulse" /> Loading local evidence</p>
    </div>
  )
}

export function CVFuzzDashboard() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null)
  const [transforms, setTransforms] = useState<TransformConfig[]>([])
  const [model, setModel] = useState<File | null>(null)
  const [video, setVideo] = useState<File | null>(null)
  const [devices, setDevices] = useState<InferenceDevice[]>([])
  const [device, setDevice] = useState<InferenceDevice["id"]>("auto")
  const [supportsDeviceSelection, setSupportsDeviceSelection] = useState(false)
  const [running, setRunning] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [apiState, setApiState] = useState<"connecting" | "online" | "offline">("connecting")
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  const refreshRuns = useCallback(async () => {
    setLoadingRuns(true)
    try {
      setRuns(await getRuns())
      setApiState("online")
    } catch (cause) {
      setApiState("offline")
      setError(cause instanceof Error ? cause.message : "Could not load runs")
    } finally {
      setLoadingRuns(false)
    }
  }, [])

  const selectRun = useCallback(async (id: string) => {
    setSelectedId(id)
    setError(null)
    try {
      setSelectedRun(await getRun(id))
      setApiState("online")
    } catch (cause) {
      setApiState("offline")
      setError(cause instanceof Error ? cause.message : "Could not load the run")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadInitialState() {
      try {
        const [initialRuns, initialConfig] = await Promise.all([getRuns(), getTransformConfig()])
        const initialRun = initialRuns[0] ? await getRun(initialRuns[0].id) : null
        if (cancelled) return
        setRuns(initialRuns)
        setTransforms(initialConfig.transforms)
        setDevices(initialConfig.devices ?? [])
        setDevice(initialConfig.default_device)
        setSupportsDeviceSelection(initialConfig.supportsDeviceSelection)
        setSelectedId(initialRun?.id ?? null)
        setSelectedRun(initialRun)
        setApiState("online")
      } catch (cause) {
        if (!cancelled) {
          setApiState("offline")
          setError(cause instanceof Error ? cause.message : "Could not load CVFuzz")
        }
      } finally {
        if (!cancelled) {
          setLoadingRuns(false)
          setInitialLoaded(true)
        }
      }
    }
    void loadInitialState()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const hasActiveRun = runs.some((run) => run.status === "queued" || run.status === "running")
    if (!hasActiveRun || running) return
    const timer = window.setInterval(() => {
      void refreshRuns()
      if (selectedId) void getRun(selectedId).then(setSelectedRun).catch(() => undefined)
    }, 1400)
    return () => window.clearInterval(timer)
  }, [refreshRuns, running, runs, selectedId])

  const newRun = () => {
    setSelectedId(null)
    setSelectedRun(null)
    setModel(null)
    setVideo(null)
    setProgress(0)
    setError(null)
  }

  const handleRun = async () => {
    if (!model || !video) return
    setRunning(true)
    setProgress(0)
    setError(null)
    try {
      const completed = await submitRun({
        model,
        video,
        device: supportsDeviceSelection ? device : undefined,
        onProgress: (state) => { setProgress(state.progress); setProgressLabel(state.label) },
        onAccepted: (run) => { setSelectedId(run.id); setSelectedRun(run); void refreshRuns() },
        onUpdate: (run) => setSelectedRun(run),
      })
      setSelectedRun(completed)
      await refreshRuns()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run could not be completed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onNewRun={newRun} apiState={apiState} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
        <RunsSidebar runs={runs} selectedId={selectedId} loading={loadingRuns} onSelect={(id) => void selectRun(id)} onRefresh={() => void refreshRuns()} onNewRun={newRun} />
        <main className="min-w-0 px-3 sm:px-5 xl:px-7">
          {!initialLoaded ? (
            <LoadingWorkspace />
          ) : selectedRun ? (
            <ActiveRun key={selectedRun.id} run={selectedRun} />
          ) : (
            <RunSetup
              model={model}
              video={video}
              devices={devices}
              device={device}
              supportsDeviceSelection={supportsDeviceSelection}
              transforms={transforms}
              onModel={setModel}
              onVideo={setVideo}
              onDevice={setDevice}
              onRun={() => void handleRun()}
              running={running}
              progress={progress}
              progressLabel={progressLabel}
              error={error}
            />
          )}
          {error && selectedRun && (
            <div className="fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-failed/30 bg-popover p-4 shadow-[0_18px_50px_rgba(0,0,0,.65)]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-failed" />
              <div><p className="text-xs font-medium">Run data could not be refreshed</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{error}</p></div>
            </div>
          )}
        </main>
      </div>
      <footer className="border-t border-border px-5 py-4 lg:ml-[232px]">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="flex items-center gap-2"><FlaskConical className="size-3" /> Controlled distortion. Clear evidence.</span>
          <span className="flex items-center gap-2"><Server className="size-3" /> Local-first · file-backed</span>
        </div>
      </footer>
    </div>
  )
}
