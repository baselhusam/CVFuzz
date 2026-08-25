"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LoaderCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react"
import { useTheme } from "next-themes"
import { MetricsPanel } from "@/components/metrics-panel"
import { NewRunWorkspace } from "@/components/new-run-workspace"
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

const runDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const readableFileName = (name?: string) => name?.replace(/\.[^.]+$/, "").replaceAll("-", " ") || "Not available"

type VideoDimensions = { width: number; height: number }

const readVideoDimensions = (file: File): Promise<VideoDimensions> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const element = document.createElement("video")
    const cleanup = () => {
      URL.revokeObjectURL(url)
      element.removeAttribute("src")
      element.load()
    }
    element.preload = "metadata"
    element.onloadedmetadata = () => {
      const dimensions = { width: element.videoWidth, height: element.videoHeight }
      cleanup()
      if (dimensions.width > 0 && dimensions.height > 0) resolve(dimensions)
      else reject(new Error("The video does not contain valid dimensions"))
    }
    element.onerror = () => {
      cleanup()
      reject(new Error("Could not read the video dimensions"))
    }
    element.src = url
  })

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Toggle color theme"
          />
        }
      >
        <Moon className="size-3.5 dark:hidden" />
        <Sun className="hidden size-3.5 dark:block" />
      </TooltipTrigger>
      <TooltipContent>
        <span className="dark:hidden">Use dark theme</span>
        <span className="hidden dark:inline">Use light theme</span>
      </TooltipContent>
    </Tooltip>
  )
}

function Header({
  onNewRun,
  apiState,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  onNewRun: () => void
  apiState: "connecting" | "online" | "offline"
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}) {
  const apiLabel = apiState === "online" ? "Ready" : apiState === "offline" ? "API unavailable" : "Connecting…"
  const apiTone = apiState === "online" ? "bg-stable" : apiState === "offline" ? "bg-failed" : "border border-queued"
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur-xl sm:px-4">
      <button type="button" onClick={onNewRun} className="group flex shrink-0 items-center gap-2" aria-label="CVFuzz home">
        <span className="flex size-7 items-center justify-center transition-transform duration-200 group-hover:scale-105">
          <Image src="/brand/cvfuzz-symbol-light.svg" alt="" width={23} height={23} className="dark:hidden" priority />
          <Image src="/brand/cvfuzz-symbol-dark.svg" alt="" width={23} height={23} className="hidden dark:block" priority />
        </span>
        <span className="border-l border-border/70 pl-2.5 text-left">
          <span className="block text-[15px] font-semibold leading-none tracking-[-0.05em] transition-colors group-hover:text-signal">CVFuzz</span>
          <span className="mt-1 hidden font-mono text-[7px] font-medium uppercase leading-none tracking-[0.18em] text-muted-foreground sm:block">Robustness lab</span>
        </span>
      </button>
      <span className="hidden h-5 w-px bg-border lg:block" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onToggleSidebar}
              className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:flex"
              aria-label={sidebarCollapsed ? "Expand recent tests panel" : "Collapse recent tests panel"}
              aria-expanded={!sidebarCollapsed}
              aria-controls="runs-sidebar"
            />
          }
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </TooltipTrigger>
        <TooltipContent>{sidebarCollapsed ? "Expand recent tests" : "Collapse recent tests"}</TooltipContent>
      </Tooltip>
      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="hidden h-8 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 text-[10px] text-muted-foreground md:flex" />
            }
          >
            <span className={`size-1.5 rounded-full ${apiTone}`} /> {apiLabel}
          </TooltipTrigger>
          <TooltipContent>{apiState === "offline" ? "Start the API with cvfuzz serve" : "CVFuzz is connected and ready"}</TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <Button onClick={onNewRun}>
          <Plus className="size-3.5" /> New test
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
}: {
  runs: RunSummary[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}) {
  const mobileDetails = useRef<HTMLDetailsElement>(null)
  const runItems = runs.map((run) => {
    const statusLabel = run.status === "completed" ? "Complete" : run.status[0].toUpperCase() + run.status.slice(1)
    return (
      <button
        type="button"
        key={run.id}
        onClick={() => {
          onSelect(run.id)
          mobileDetails.current?.removeAttribute("open")
        }}
        className={`group w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ${
          selectedId === run.id
            ? "border-signal/50 bg-signal-soft"
            : "border-border/70 bg-card/70 hover:border-foreground/15 hover:bg-secondary/60"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[9px] text-steel">
            <RunStatus status={run.status} /> {statusLabel}
          </span>
          <span className="num text-[8px] tracking-[0.08em] text-muted-foreground">#{run.id.slice(-6)}</span>
        </div>
        <p className="mt-2 truncate text-[12px] font-medium tracking-[-0.015em]" title={run.model.name}>{readableFileName(run.model.name)}</p>
        <p className="mt-0.5 truncate text-[9px] text-muted-foreground" title={run.source.name}>{readableFileName(run.source.name)}</p>
        <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
          <span>{runDateFormatter.format(new Date(run.started_at))}</span>
          <span className={`num ${run.status === "failed" ? "text-failed" : "text-steel"}`}>
            {run.metrics ? `${Math.round(run.metrics.robustness_score)} / 100` : `${run.progress}%`}
          </span>
        </div>
      </button>
    )
  })

  return (
    <aside id="runs-sidebar" className="min-w-0 overflow-hidden border-b border-border bg-card lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:border-b-0 lg:border-r">
      <details ref={mobileDetails} className="group lg:hidden">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 text-xs font-medium hover:bg-secondary">
          Recent tests
          <span className="num rounded-full bg-secondary px-2 py-0.5 text-[9px] text-steel">{runs.length}</span>
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="max-h-80 space-y-1 overflow-y-auto border-t border-border p-2.5">
          <p className="mb-2 px-1 text-[10px] text-muted-foreground">Select a previous test</p>
          {runItems}
          {!runs.length && !loading && <p className="p-3 text-xs text-muted-foreground">Completed tests will appear here.</p>}
        </div>
      </details>

      <div className="hidden h-full lg:block">
      <div className="flex h-12 items-center border-b border-border px-3.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Recent tests</span>
          <span className="num rounded-sm bg-secondary px-1.5 py-0.5 text-[9px] text-steel">{runs.length}</span>
        </div>
      </div>
      <div className="scrollbar-thin h-[calc(100%-3rem)] space-y-2 overflow-y-auto p-2.5 [content-visibility:auto]">
        {runItems}
        {!runs.length && !loading && (
          <div className="rounded-md border border-dashed border-border p-4">
            <p className="text-xs font-medium">No tests yet</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Your first completed test will appear here.</p>
          </div>
        )}
      </div>
      </div>
    </aside>
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
  const state = metric.failures > 0 ? "Changes detected" : "No changes detected"
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/15">
      <div className="flex items-start justify-between gap-4 border-b border-border px-3.5 py-3">
        <div className="min-w-0">
          <p className={`font-mono text-[8px] uppercase tracking-[0.12em] ${metric.failures ? "text-failed" : "text-stable"}`}>{state}</p>
          <h3 className="mt-1.5 truncate text-[13px]">{metric.name}</h3>
        </div>
        <span className="max-w-44 text-right font-mono text-[8px] leading-4 text-muted-foreground">{formatParameters(metric.parameters)}</span>
      </div>
      <VideoStage id={artifact.id} videoUrl={artifact.url} label={artifact.name} registerVideo={registerVideo} />
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
        <div className="p-3"><span className="metric-label">Detections kept</span><p className="num mt-1 text-xs">{metric.retention}%</p></div>
        <div className="p-3"><span className="metric-label">Confidence change</span><p className={`num mt-1 text-xs ${metric.confidence_delta < 0 ? "text-failed" : ""}`}>{metric.confidence_delta > 0 ? "+" : ""}{metric.confidence_delta}%</p></div>
        <div className="p-3"><span className="metric-label">Failure events</span><p className="num mt-1 text-xs">{metric.failures}</p></div>
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
    ? `The model kept ${weakest.retention}% of its original detections. Changes began at ${formatTime(weakest.first_failure_seconds)} and affected ${weakest.affected_frames} of ${run.metrics.frames_analyzed} frames.`
    : "The model stayed consistent across all tested video conditions."

  return (
    <>
      <section className="py-6 md:py-9">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="section-kicker text-stable">Test complete · #{run.id.slice(-8)}</p>
            <h1 className="mt-2 text-balance text-[clamp(2rem,5vw,3.35rem)] tracking-[-0.05em]">Test results</h1>
            <p className="mt-2 text-[12px] text-muted-foreground">{readableFileName(run.model.name)} · {readableFileName(run.source.name)}</p>
          </div>
          <Badge variant="outline"><span className="size-1.5 rounded-full bg-stable" /> Saved locally</Badge>
        </div>

        <div className={`mb-4 rounded-lg border p-4 sm:p-5 ${weakest ? "border-failed/30 bg-failed/5" : "border-stable/30 bg-stable/5"}`}>
          <p className={`text-[10px] font-medium uppercase tracking-[0.1em] ${weakest ? "text-failed" : "text-stable"}`}>{weakest ? "Biggest impact" : "Overall finding"}</p>
          <h2 className="mt-2 text-xl tracking-[-0.025em]">{weakest ? `${weakest.name} had the biggest impact` : "No major changes were found"}</h2>
          <p className="mt-2 max-w-3xl text-[12px] leading-5 text-steel">{finding}</p>
        </div>

        <div className="mb-7 grid overflow-hidden rounded-lg border border-border bg-border grid-cols-2 xl:grid-cols-4">
          <div className="bg-card p-4"><span className="metric-label">Robustness score</span><p className="num mt-2 text-2xl">{Math.round(run.metrics.robustness_score)} <span className="text-sm text-muted-foreground">/ 100</span></p><p className="mt-1 text-[10px] text-muted-foreground">Higher is better</p></div>
          <div className="border-l border-border bg-card p-4"><span className="metric-label">Most affected</span><p className="mt-2 truncate text-[13px] font-medium">{weakest?.name || "None"}</p><p className="mt-1 text-[10px] text-muted-foreground">Test condition</p></div>
          <div className="border-t border-border bg-card p-4 xl:border-l xl:border-t-0"><span className="metric-label">Frames tested</span><p className="num mt-2 text-2xl">{run.metrics.frames_analyzed}</p><p className="mt-1 text-[10px] text-muted-foreground">Every frame analyzed</p></div>
          <div className="border-l border-t border-border bg-card p-4 xl:border-t-0"><span className="metric-label">Test length</span><p className="num mt-2 text-2xl">{formatTime(run.metrics.video_duration_seconds)}</p><p className="mt-1 text-[10px] text-muted-foreground">Source video</p></div>
        </div>

        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="section-kicker">Video comparison</p><h2 className="mt-2 text-xl tracking-[-0.03em]">Compare the videos</h2><p className="mt-1 text-[11px] text-muted-foreground">Press play to keep every video synchronized.</p></div>
          <span className="text-[10px] text-muted-foreground">{run.metrics.frames_analyzed} frames · one shared timeline</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h3 className="text-[13px]">Original video</h3><span className="max-w-56 truncate text-[10px] text-muted-foreground">{run.source.name}</span></div>
          <VideoStage
            id="original"
            videoUrl={original.url}
            label="Original video"
            featured
            registerVideo={registerVideo}
            onTimeUpdate={(nextTime, nextDuration) => {
              setTime(nextTime)
              if (nextDuration) setDuration(nextDuration)
            }}
          />
        </div>
        <div className="flex items-center gap-3 rounded-b-lg border-x border-b border-border bg-card px-4 py-3">
          <button type="button" onClick={togglePlayback} className="flex size-8 items-center justify-center rounded-md bg-signal text-ink" aria-label={playing ? "Pause all videos" : "Play all videos"}>{playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}</button>
          <span className="num w-11 text-[8.5px] text-muted-foreground">{formatTime(time)}</span>
          <input className="timeline-range h-1 flex-1" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Synchronized video timeline" />
          <span className="num w-11 text-[8.5px] text-muted-foreground">{formatTime(duration)}</span>
          <button type="button" onClick={toggleMute} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={muted ? "Unmute original" : "Mute original"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
        </div>
        <div className="mb-4 mt-8"><p className="section-kicker">Condition results</p><h2 className="mt-2 text-xl tracking-[-0.03em]">Results by condition</h2><p className="mt-1 text-[11px] text-muted-foreground">Each card compares one changed video with the original.</p></div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
  const availableVideos = run.artifacts.filter((artifact) => artifact.kind === "augmentation")
  return (
    <div className="evidence-grid mx-auto my-8 flex min-h-[calc(100vh-12rem)] max-w-5xl items-center justify-center rounded-[1.25rem] border border-border p-5">
      <div className="w-full max-w-3xl rounded-[1.15rem] border border-border bg-card p-7 text-center shadow-[0_22px_60px_rgba(11,14,18,.08)] md:p-10">
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
        {availableVideos.length > 0 && (
          <section className="mt-8 border-t border-border pt-6 text-left" aria-labelledby="ready-videos-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="section-kicker text-stable">Live results</p>
                <h2 id="ready-videos-heading" className="mt-1 text-base tracking-[-0.02em]">Ready to review</h2>
              </div>
              <span className="num rounded-full bg-stable/10 px-2 py-1 text-[9px] text-stable">{availableVideos.length} {availableVideos.length === 1 ? "video" : "videos"}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {availableVideos.map((artifact) => (
                <article key={artifact.id} className="overflow-hidden rounded-xl border border-border bg-secondary/45">
                  <video controls playsInline preload="metadata" src={artifact.url} className="aspect-video w-full bg-ink" />
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <p className="truncate text-[11px] font-medium">{artifact.name}</p>
                    <Check className="size-3.5 shrink-0 text-stable" aria-label="Ready" />
                  </div>
                </article>
              ))}
            </div>
          </section>
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

function runSummary(run: RunRecord): RunSummary {
  return Object.fromEntries(
    Object.entries(run).filter(([key]) => key !== "artifacts"),
  ) as RunSummary
}

function updateRunInList(current: RunSummary[], run: RunRecord) {
  const next = runSummary(run)
  const withoutCurrent = current.filter((item) => item.id !== run.id)
  return [next, ...withoutCurrent]
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
  const [batchSize, setBatchSize] = useState(2)
  const [imageSize, setImageSize] = useState<number | null>(null)
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions | null>(null)
  const [supportsDeviceSelection, setSupportsDeviceSelection] = useState(false)
  const [running, setRunning] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [apiState, setApiState] = useState<"connecting" | "online" | "offline">("connecting")
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
        if (cancelled) return
        setRuns(initialRuns)
        setTransforms(initialConfig.transforms)
        setDevices(initialConfig.devices ?? [])
        setDevice(initialConfig.default_device)
        setBatchSize(initialConfig.inference?.batch_size ?? 2)
        setImageSize(initialConfig.inference?.image_size ?? null)
        setSupportsDeviceSelection(initialConfig.supportsDeviceSelection)
        // A fresh session always starts at the upload workspace. Previous runs remain optional.
        setSelectedId(null)
        setSelectedRun(null)
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
    let cancelled = false
    if (!video) {
      return () => { cancelled = true }
    }
    void readVideoDimensions(video)
      .then((dimensions) => { if (!cancelled) setVideoDimensions(dimensions) })
      .catch(() => { if (!cancelled) setVideoDimensions(null) })
    return () => { cancelled = true }
  }, [video])

  const newRun = () => {
    setSelectedId(null)
    setSelectedRun(null)
    setModel(null)
    setVideo(null)
    setVideoDimensions(null)
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
        batchSize,
        imageSize,
        transforms,
        onProgress: (state) => { setProgress(state.progress); setProgressLabel(state.label) },
        onAccepted: (run) => {
          setSelectedId(run.id)
          setSelectedRun(run)
          setRuns((current) => updateRunInList(current, run))
        },
        onUpdate: (run) => {
          setSelectedRun(run)
          setRuns((current) => updateRunInList(current, run))
        },
      })
      setSelectedRun(completed)
      setRuns((current) => updateRunInList(current, completed))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run could not be completed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="sr-only fixed left-3 top-3 z-[100] rounded-md bg-foreground px-3 py-2 text-xs text-background focus:not-sr-only">Skip to main content</a>
      <Header
        onNewRun={newRun}
        apiState={apiState}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] transition-[grid-template-columns] duration-300 ease-out ${sidebarCollapsed ? "lg:grid-cols-[0_minmax(0,1fr)]" : "lg:grid-cols-[232px_minmax(0,1fr)]"}`}>
        <div className={`min-w-0 transition-opacity duration-200 ${sidebarCollapsed ? "lg:invisible lg:opacity-0" : "lg:visible lg:opacity-100"}`}>
          <RunsSidebar runs={runs} selectedId={selectedId} loading={loadingRuns} onSelect={(id) => void selectRun(id)} />
        </div>
        <main id="main-content" tabIndex={-1} className="min-w-0 px-3 sm:px-5 xl:px-7">
          {!initialLoaded ? (
            <LoadingWorkspace />
          ) : selectedRun ? (
            <ActiveRun key={selectedRun.id} run={selectedRun} />
          ) : (
            <NewRunWorkspace
              model={model}
              video={video}
              devices={devices}
              device={device}
              batchSize={batchSize}
              imageSize={imageSize}
              videoDimensions={videoDimensions}
              supportsDeviceSelection={supportsDeviceSelection}
              transforms={transforms}
              onModel={setModel}
              onVideo={(file) => {
                setVideo(file)
                setVideoDimensions(null)
              }}
              onDevice={setDevice}
              onBatchSize={setBatchSize}
              onImageSize={setImageSize}
              onTransforms={setTransforms}
              onRun={() => void handleRun()}
              running={running}
              progress={progress}
              progressLabel={progressLabel}
              error={error}
            />
          )}
          {error && selectedRun && (
            <div role="alert" className="fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-failed/30 bg-popover p-4 shadow-[0_18px_50px_rgba(0,0,0,.65)]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-failed" />
              <div><p className="text-xs font-medium">Run data could not be refreshed</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{error}</p></div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
