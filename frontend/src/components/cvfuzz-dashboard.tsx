"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Expand,
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
      <button type="button" onClick={onNewRun} className="group flex shrink-0 items-center gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-secondary/70" aria-label="CVFuzz home">
        <span className="flex size-8 items-center justify-center border border-signal/30 bg-signal/5 shadow-[inset_0_0_18px_rgba(215,250,3,.08)] transition-transform duration-200 group-hover:scale-105">
          <Image src="/brand/cvfuzz-symbol-light.svg" alt="" width={21} height={21} className="dark:hidden" priority />
          <Image src="/brand/cvfuzz-symbol-dark.svg" alt="" width={21} height={21} className="hidden dark:block" priority />
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-[15px] font-semibold leading-none tracking-[-0.05em] transition-colors group-hover:text-signal">CVFuzz</span>
          <span className="mt-1 hidden font-mono text-[7px] font-medium uppercase leading-none tracking-[0.2em] text-muted-foreground sm:block">Robustness lab</span>
        </span>
      </button>
      <span className="hidden h-6 w-px bg-border lg:block" />
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
  onTimeUpdate,
  time,
  duration,
  playing,
  onSeek,
  onTogglePlayback,
  onFullscreen,
}: {
  artifact: RunArtifact
  metric: TransformMetrics
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
  onTimeUpdate: (time: number, duration: number) => void
  time: number
  duration: number
  playing: boolean
  onSeek: (time: number) => void
  onTogglePlayback: () => void
  onFullscreen: () => void
}) {
  const state = metric.failures > 0 ? "Changes detected" : "No changes detected"
  return (
    <article className={`group overflow-hidden rounded-xl border bg-card shadow-[0_8px_30px_rgba(0,0,0,.06)] transition-colors hover:border-foreground/25 ${metric.failures ? "border-border" : "border-stable/30"}`}>
      <div className="flex items-start justify-between gap-4 border-b border-border bg-secondary/20 px-4 py-3.5">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] ${metric.failures ? "text-failed" : "text-stable"}`}><span className={`size-1.5 rounded-full ${metric.failures ? "bg-failed" : "bg-stable"}`} />{state}</p>
          <h3 className="mt-1.5 truncate text-[13px] font-medium">{metric.name}</h3>
        </div>
        <span className="max-w-36 text-right font-mono text-[8px] leading-4 text-muted-foreground">{formatParameters(metric.parameters)}</span>
      </div>
      <VideoStage id={artifact.id} videoUrl={artifact.url} label={artifact.name} registerVideo={registerVideo} onTimeUpdate={onTimeUpdate} showFullscreenControl={false} />
      <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2.5">
        <button type="button" onClick={onTogglePlayback} className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-signal hover:text-ink" aria-label={playing ? "Pause all synchronized videos" : "Play all synchronized videos"}>{playing ? <Pause className="size-3 fill-current" /> : <Play className="size-3 fill-current" />}</button>
        <span className="num shrink-0 text-[8px] text-muted-foreground">{formatTime(time)}</span>
        <input className="timeline-range h-1 min-w-6 flex-1" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(time, duration)} onChange={(event) => onSeek(Number(event.target.value))} aria-label={`Shared playback position for ${metric.name}`} />
        <span className="num shrink-0 text-[8px] text-muted-foreground">{formatTime(duration)}</span>
        <button type="button" onClick={onFullscreen} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label={`View ${metric.name} fullscreen`}><Expand className="size-3" /></button>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-secondary/15">
        <div className="p-3"><span className="metric-label">Detections kept</span><p className="num mt-1.5 text-xs">{metric.retention}%</p></div>
        <div className="p-3"><span className="metric-label">Confidence change</span><p className={`num mt-1.5 text-xs ${metric.confidence_delta < 0 ? "text-failed" : ""}`}>{metric.confidence_delta > 0 ? "+" : ""}{metric.confidence_delta}%</p></div>
        <div className="p-3"><span className="metric-label">Failure events</span><p className="num mt-1.5 text-xs">{metric.failures}</p></div>
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
  const lastTimelineUpdate = useRef(0)
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
  const updateTimeline = useCallback((nextTime: number, nextDuration: number) => {
    const now = performance.now()
    if (now - lastTimelineUpdate.current < 100) return
    lastTimelineUpdate.current = now
    setTime(nextTime)
    if (nextDuration) setDuration(nextDuration)
  }, [])
  const toggleVideoFullscreen = async (id: string) => {
    const video = videos.current.get(id)
    if (!video) return
    try {
      if (document.fullscreenElement === video) await document.exitFullscreen()
      else await video.requestFullscreen()
    } catch {
      // A browser can reject fullscreen when it is not allowed by the current context.
    }
  }
  const toggleOriginalFullscreen = () => toggleVideoFullscreen("original")

  if (!original || !run.metrics) return null
  const finding = weakest
    ? `The model kept ${weakest.retention}% of its original detections. Changes began at ${formatTime(weakest.first_failure_seconds)} and affected ${weakest.affected_frames} of ${run.metrics.frames_analyzed} frames.`
    : "The model stayed consistent across all tested video conditions."

  return (
    <>
      <section className="py-6 md:py-9">
        <div className="mb-5">
          <div>
            <p className="section-kicker text-stable">Test complete · #{run.id.slice(-8)}</p>
            <h1 className="mt-2 text-balance text-[clamp(2rem,5vw,3.35rem)] tracking-[-0.05em]">Test results</h1>
            <p className="mt-2 text-[12px] text-muted-foreground">{readableFileName(run.model.name)} · {readableFileName(run.source.name)}</p>
          </div>
        </div>

        <div className={`mb-5 rounded-lg border px-4 py-4 sm:px-5 ${weakest ? "border-failed/30 bg-failed/5" : "border-stable/30 bg-stable/5"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className={`text-[9px] font-medium uppercase tracking-[0.12em] ${weakest ? "text-failed" : "text-stable"}`}>{weakest ? "Key finding" : "Overall finding"}</p>
              <h2 className="mt-1 text-[17px] tracking-[-0.025em]">{weakest ? `${weakest.name} had the biggest impact` : "No major changes were found"}</h2>
              <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-steel">{finding}</p>
            </div>
            <dl className="flex shrink-0 divide-x divide-border/70 border-t border-border/70 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <div className="pr-5"><dt className="metric-label">Retention</dt><dd className={`num mt-1 text-sm ${weakest ? "text-failed" : "text-stable"}`}>{weakest ? `${weakest.retention}%` : "100%"}</dd></div>
              <div className="pl-5"><dt className="metric-label">Affected</dt><dd className="num mt-1 text-sm">{weakest ? `${weakest.affected_frames} / ${run.metrics.frames_analyzed}` : "0"}</dd></div>
            </dl>
          </div>
        </div>

        <div className="mb-7 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <div className="bg-card p-4 text-center"><span className="metric-label">Robustness score</span><p className="num mt-2 text-2xl">{Math.round(run.metrics.robustness_score)} <span className="text-sm text-muted-foreground">/ 100</span></p><p className="mt-1 text-[10px] text-muted-foreground">Higher is better</p></div>
          <div className="border-l border-border bg-card p-4 text-center"><span className="metric-label">Most affected</span><p className="mt-2 truncate text-[13px] font-medium">{weakest?.name || "None"}</p><p className="mt-1 text-[10px] text-muted-foreground">Test condition</p></div>
          <div className="border-t border-border bg-card p-4 text-center sm:border-l sm:border-t-0"><span className="metric-label">Frames tested</span><p className="num mt-2 text-2xl">{run.metrics.frames_analyzed}</p><p className="mt-1 text-[10px] text-muted-foreground">Every frame analyzed</p></div>
          <div className="border-l border-t border-border bg-card p-4 text-center sm:border-t-0"><span className="metric-label">Test length</span><p className="num mt-2 text-2xl">{formatTime(run.metrics.video_duration_seconds)}</p><p className="mt-1 text-[10px] text-muted-foreground">Source video</p></div>
        </div>

        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="section-kicker">Video comparison</p><h2 className="mt-2 text-xl tracking-[-0.03em]">Compare the videos</h2><p className="mt-1 text-[11px] text-muted-foreground">The shared controls synchronize the source and every condition video.</p></div>
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
            onTimeUpdate={updateTimeline}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="hidden font-mono text-[8px] uppercase tracking-[.12em] text-muted-foreground sm:block">Shared playback</span>
          <button type="button" onClick={togglePlayback} className="flex size-8 items-center justify-center rounded-md bg-signal text-ink" aria-label={playing ? "Pause all videos" : "Play all videos"}>{playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}</button>
          <span className="num w-11 text-[8.5px] text-muted-foreground">{formatTime(time)}</span>
          <input className="timeline-range h-1 flex-1" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Synchronized video timeline" />
          <span className="num w-11 text-[8.5px] text-muted-foreground">{formatTime(duration)}</span>
          <button type="button" onClick={() => void toggleOriginalFullscreen()} className="flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="View original video fullscreen"><Expand className="size-3.5" /><span className="hidden font-mono text-[8px] uppercase tracking-[.09em] md:inline">Full screen</span></button>
          <button type="button" onClick={toggleMute} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={muted ? "Unmute original" : "Mute original"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
        </div>
        <div className="mb-4 mt-8"><p className="section-kicker">Condition results</p><h2 className="mt-2 text-xl tracking-[-0.03em]">Results by condition</h2><p className="mt-1 text-[11px] text-muted-foreground">Every card follows the shared playback controls above.</p></div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {run.metrics.transforms.map((metric) => {
            const artifact = artifactById.get(metric.id)
            return artifact ? <ResultCard key={metric.id} artifact={artifact} metric={metric} registerVideo={registerVideo} onTimeUpdate={updateTimeline} time={time} duration={duration} playing={playing} onSeek={seek} onTogglePlayback={() => void togglePlayback()} onFullscreen={() => void toggleVideoFullscreen(metric.id)} /> : null
          })}
        </div>
      </section>
    </>
  )
}

type LiveStage = {
  id: string
  label: string
  parameters: string
}

function stageDisplayName(run: RunRecord, stages: LiveStage[]) {
  if (run.phase === "baseline") return "Baseline · original stream"
  if (run.phase === "preparing") return "Preparing staged evaluation"
  const index = run.stage_index ? run.stage_index - 2 : 0
  return stages[index]?.label || run.stage
}

function ActiveRun({ run, transforms }: { run: RunRecord; transforms: TransformConfig[] }) {
  if (run.status === "completed" && run.metrics) {
    return <><VideoWall run={run} /><MetricsPanel metrics={run.metrics} /></>
  }
  const configuredStages: LiveStage[] = transforms
    .filter((transform) => transform.enabled)
    .map((transform) => ({
      id: transform.id,
      label: transform.name,
      parameters: formatParameters(transform.parameters),
    }))
  const transformTotal = Math.max(0, (run.stage_total ?? 1) - 1)
  const liveStages = configuredStages.length === transformTotal
    ? configuredStages
    : Array.from({ length: transformTotal }, (_, index) => ({
        id: `condition-${index + 1}`,
        label: `Condition ${index + 1}`,
        parameters: "Configured augmentation",
      }))
  const stages: LiveStage[] = [{ id: "baseline", label: "Baseline", parameters: "Reference detections" }, ...liveStages]
  const stageIndex = Math.min(run.stage_index ?? 0, stages.length)
  const stageProgress = Math.max(0, Math.min(100, run.stage_progress ?? run.progress))
  const activeStage = stages[Math.max(0, stageIndex - 1)]
  const frameTotal = run.source.declared_frames
  const estimatedFrames = frameTotal ? Math.min(frameTotal, Math.round(frameTotal * stageProgress / 100)) : null
  const phaseLabel = run.phase === "baseline"
    ? "baseline inference"
    : run.phase === "processing"
      ? "render → inference → match"
      : run.phase === "preparing"
        ? "validating source and runtime"
        : "connecting to local runner"
  const readyArtifacts = run.artifacts.filter((artifact) => artifact.kind === "original" || artifact.kind === "augmentation")
  const running = run.status === "running" || run.status === "queued"
  const failed = run.status === "failed"
  const activeTitle = stageDisplayName(run, liveStages)
  const activeParameters = activeStage?.parameters || "Local run initialization"

  return (
    <div className="mx-auto max-w-6xl py-7 md:py-10">
      <section className={`overflow-hidden border bg-card ${failed ? "border-failed/40" : "border-border"}`} aria-labelledby="live-run-heading">
        <div className="border-b border-border px-5 py-7 text-center md:px-7 md:py-9">
          <div className="mx-auto max-w-2xl">
            <p className={`section-kicker inline-flex items-center gap-2 ${failed ? "text-failed" : "text-signal"}`}>
              {failed ? <AlertTriangle className="size-3" /> : <LoaderCircle className="size-3 animate-spin" />}
              {failed ? "Run needs attention" : `${run.status === "queued" ? "Queued" : "Executing"} · ${stageIndex || 0} of ${stages.length} stages`}
            </p>
            <h1 id="live-run-heading" className="mt-3 text-balance text-[clamp(2rem,4vw,3.25rem)] tracking-[-0.05em]">
              {failed ? "The run stopped" : activeTitle}
            </h1>
            <p className="mt-3 font-mono text-[10px] leading-5 text-muted-foreground">
              {failed ? run.error || "The local runner stopped before completion." : activeParameters}
            </p>
            <p className="mt-2 text-[11px] text-steel">{readableFileName(run.model.name)} · {readableFileName(run.source.name)}</p>
          </div>
        </div>

        {!failed && (
          <div className="px-5 py-5 md:px-7">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5" aria-label="Run stage progress">
              {stages.map((stage, index) => {
                const position = index + 1
                const complete = position < stageIndex || readyArtifacts.some((artifact) => artifact.id === stage.id)
                const active = position === stageIndex && running
                return (
                  <div key={stage.id} aria-current={active ? "step" : undefined} className={`min-h-15 border px-3 py-2.5 ${complete ? "border-border bg-card" : active ? "border-signal bg-signal-soft" : "border-border bg-secondary/20"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={`num text-[8px] ${active ? "text-signal" : complete ? "text-stable" : "text-muted-foreground"}`}>{String(position).padStart(2, "0")}</span>
                      {complete ? <Check className="size-3.5 text-stable" aria-label="Completed" /> : active ? <span className="mt-1 size-1.5 bg-signal" aria-label="In progress" /> : <span className="mt-1 size-1.5 rounded-full border border-queued" aria-label="Queued" />}
                    </div>
                    <p className="mt-2 truncate font-mono text-[9px] uppercase tracking-[.08em]">{stage.label}</p>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <span className="min-w-0 font-mono text-[9px] uppercase tracking-[.11em] text-muted-foreground">{phaseLabel}</span>
              <div className="h-1 min-w-10 flex-1 overflow-hidden bg-secondary"><motion.div className="h-full bg-signal" animate={{ width: `${stageProgress}%` }} transition={{ duration: 0.35, ease: "easeOut" }} /></div>
              <span className="num shrink-0 text-[10px]">{estimatedFrames != null ? `${estimatedFrames} / ${frameTotal} frames` : `${stageProgress}%`}</span>
            </div>
          </div>
        )}
      </section>

      {readyArtifacts.length > 0 && (
        <section className="mt-4 border border-border bg-card" aria-labelledby="ready-streams-heading">
          <div className="flex items-end justify-between gap-4 border-b border-border px-5 py-3.5"><div><p className="section-kicker text-stable">Streams</p><h2 id="ready-streams-heading" className="mt-1 text-[15px] tracking-[-0.025em]">Ready to review</h2></div><span className="num text-[9px] text-stable">{readyArtifacts.length} READY</span></div>
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {readyArtifacts.map((artifact) => (
              <article key={artifact.id} className="bg-card">
                <video controls playsInline preload="metadata" src={artifact.url} className="aspect-video w-full bg-ink" />
                <div className="flex items-center justify-between gap-3 px-4 py-3"><p className="truncate text-[11px] font-medium">{artifact.name}</p><Check className="size-3.5 shrink-0 text-stable" aria-label="Ready" /></div>
              </article>
            ))}
          </div>
        </section>
      )}
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
            <ActiveRun key={selectedRun.id} run={selectedRun} transforms={transforms} />
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
