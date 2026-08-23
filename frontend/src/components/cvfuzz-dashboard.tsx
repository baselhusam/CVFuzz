"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Check,
  CircleStop,
  Film,
  FlaskConical,
  Gauge,
  LoaderCircle,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react"
import { useTheme } from "next-themes"
import { FileDropzone } from "@/components/file-dropzone"
import { MetricsPanel } from "@/components/metrics-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { VideoStage } from "@/components/video-stage"
import {
  formatParameters,
  formatTime,
  type RunArtifact,
  type RunRecord,
  type RunSummary,
  type InferenceDevice,
  type TransformConfig,
  type TransformMetrics,
} from "@/lib/run-data"
import { getRun, getRuns, getTransformConfig, submitRun } from "@/lib/run-service"

const reveal = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full border border-border"
            onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
          />
        }
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </TooltipTrigger>
      <TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  )
}

function Header({ onNewRun }: { onNewRun: () => void }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/88 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <button type="button" onClick={onNewRun} className="flex items-center gap-3">
          <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="text-sm font-bold tracking-[-0.025em]">CVFUZZ</span>
          <Badge variant="outline" className="hidden rounded-full px-2 font-mono text-[8px] text-muted-foreground sm:inline-flex">
            LOCAL LAB
          </Badge>
        </button>
        <div className="flex items-center gap-2">
          <span className="mr-2 hidden items-center gap-2 font-mono text-[9px] text-muted-foreground md:flex">
            <i className="size-1.5 rounded-full bg-signal" /> FILE-BACKED API
          </span>
          <ThemeToggle />
          <Button onClick={onNewRun} className="h-9 rounded-full bg-foreground px-4 text-background hover:bg-foreground/85">
            <Plus className="size-3.5" /> New run
          </Button>
        </div>
      </div>
    </header>
  )
}

function RunStatus({ status }: { status: RunSummary["status"] }) {
  const tone =
    status === "completed"
      ? "bg-signal"
      : status === "failed"
        ? "bg-alert"
        : "animate-pulse bg-amber-400"
  return <i className={`size-1.5 shrink-0 rounded-full ${tone}`} />
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
    <aside className="min-w-0 max-w-full border-b border-border bg-card/75 lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div>
          <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground">RUN ARCHIVE</p>
          <p className="mt-1 text-sm font-semibold">{runs.length} local runs</p>
        </div>
        <button type="button" onClick={onRefresh} className="text-muted-foreground hover:text-foreground" aria-label="Refresh runs">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto p-3 lg:block lg:max-h-[calc(100vh-9rem)] lg:space-y-2 lg:overflow-y-auto">
        <button
          type="button"
          onClick={onNewRun}
          className="flex min-w-52 items-center gap-3 border border-dashed border-border bg-background/45 p-3 text-left transition-colors hover:border-signal lg:w-full"
        >
          <span className="flex size-8 items-center justify-center bg-signal text-ink"><Plus className="size-4" /></span>
          <span><strong className="block text-xs">Create a run</strong><small className="text-[10px] text-muted-foreground">Upload model + video</small></span>
        </button>
        {runs.map((run) => (
          <button
            type="button"
            key={run.id}
            onClick={() => onSelect(run.id)}
            className={`min-w-64 border p-3 text-left transition-colors lg:w-full lg:min-w-0 ${
              selectedId === run.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:border-foreground/45"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 font-mono text-[8px] tracking-[0.08em]">
                <RunStatus status={run.status} /> {run.status.toUpperCase()}
              </span>
              <span className={`font-mono text-[8px] ${selectedId === run.id ? "text-background/55" : "text-muted-foreground"}`}>
                {run.id.slice(-8)}
              </span>
            </div>
            <p className="mt-3 truncate text-xs font-semibold">{run.source.name || "Video"}</p>
            <p className={`mt-1 truncate font-mono text-[9px] ${selectedId === run.id ? "text-background/60" : "text-muted-foreground"}`}>
              {run.model.name || "Model"}
            </p>
            <div className="mt-3 flex items-center justify-between font-mono text-[8px]">
              <span>{new Date(run.started_at).toLocaleDateString()}</span>
              <span>{run.metrics ? `${run.metrics.robustness_score} SCORE` : `${run.progress}%`}</span>
            </div>
          </button>
        ))}
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
  return (
    <motion.div variants={reveal} initial="hidden" animate="visible" className="mx-auto max-w-6xl py-8 md:py-12">
      <div className="mb-10 grid gap-8 xl:grid-cols-[1fr_.48fr] xl:items-end">
        <div>
          <p className="section-kicker">NEW FULL-STREAM EVALUATION</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
            One video in<span className="text-signal">.</span><br />Every condition out<span className="text-alert">.</span>
          </h1>
        </div>
        <p className="border-l border-border pl-5 text-sm leading-6 text-muted-foreground">
          CVFuzz applies every enabled augmentation to every frame, runs your detector on the
          original and every generated stream, then stores playable outputs and evaluation files.
        </p>
      </div>
      <section className="border border-border bg-card shadow-[0_22px_80px_rgba(0,0,0,.08)]">
        <div className="grid gap-px bg-border md:grid-cols-2">
          <FileDropzone kind="model" file={model} onFile={onModel} />
          <FileDropzone kind="video" file={video} onFile={onVideo} />
        </div>
        <div className="border-t border-border p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">ACTIVE AUGMENTATION VIDEOS</p>
            <Badge variant="outline" className="rounded-full font-mono text-[9px]">{enabled.length || 9} OUTPUTS</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {enabled.map((item) => (
              <span key={item.id} className="border border-border bg-background px-2.5 py-2 font-mono text-[8px] text-muted-foreground">
                <strong className="mr-2 text-foreground">{item.name.toUpperCase()}</strong>
                {formatParameters(item.parameters)}
              </span>
            ))}
            {!enabled.length && <span className="text-xs text-muted-foreground">Connect the API to load the configured techniques.</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div>
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">INFERENCE DEVICE</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {supportsDeviceSelection
                ? "Apple GPU is used automatically when MPS is available."
                : "This API version uses its server-default inference device."}
            </p>
          </div>
          <select
            value={device}
            onChange={(event) => onDevice(event.target.value as InferenceDevice["id"])}
            disabled={!supportsDeviceSelection}
            className="h-10 border border-border bg-background px-3 text-xs font-medium outline-none focus:border-signal"
            aria-label="Inference device"
          >
            {devices.map((option) => (
              <option key={option.id} value={option.id} disabled={!option.available}>
                {option.name} — {option.description}{!option.available ? " (unavailable)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-4 border-t border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[9px] text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="size-3 text-signal" /> EVERY FRAME</span>
            <span className="flex items-center gap-2"><Check className="size-3 text-signal" /> REAL INFERENCE</span>
            <span className="flex items-center gap-2"><Check className="size-3 text-signal" /> FILE-BACKED RUN</span>
          </div>
          <Button
            size="lg"
            disabled={!model || !video || running}
            onClick={onRun}
            className="h-12 min-w-56 rounded-none bg-signal px-7 font-semibold text-ink shadow-[4px_4px_0_var(--foreground)] hover:bg-signal/85 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {running ? <><CircleStop className="size-4 animate-pulse" /> Running {progress}%</> : <><Play className="size-4 fill-current" /> Apply + evaluate</>}
          </Button>
        </div>
        <AnimatePresence>
          {(running || error) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden border-t border-border">
              <div className="flex items-center justify-between px-5 py-3 font-mono text-[10px]">
                <span className={error ? "text-alert" : "text-muted-foreground"}>{error ?? progressLabel}</span>
                <span>{error ? "FAILED" : `${progress}%`}</span>
              </div>
              {!error && <div className="h-1 bg-muted"><motion.div className="h-full bg-signal" animate={{ width: `${progress}%` }} /></div>}
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
  return (
    <article className="overflow-hidden border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-3.5 py-3">
        <div><p className="font-mono text-[8px] text-muted-foreground">{metric.id.slice(0, 3).toUpperCase()}</p><h3 className="mt-1 text-sm font-semibold">{metric.name}</h3></div>
        <span className="max-w-48 text-right font-mono text-[8px] leading-4 text-muted-foreground">{formatParameters(metric.parameters)}</span>
      </div>
      <VideoStage id={artifact.id} videoUrl={artifact.url} label={artifact.name} registerVideo={registerVideo} />
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
        <div className="p-3"><span className="metric-label">RETENTION</span><p className="mt-1 font-mono text-xs font-semibold">{metric.retention}%</p></div>
        <div className="p-3"><span className="metric-label">CONF. Δ</span><p className="mt-1 font-mono text-xs font-semibold text-alert">{metric.confidence_delta}%</p></div>
        <div className="p-3"><span className="metric-label">FAILURES</span><p className="mt-1 font-mono text-xs font-semibold">{metric.failures}</p></div>
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
    for (const [id, video] of videos.current) video.muted = id !== "original" || next
  }
  const seek = (next: number) => {
    setTime(next)
    for (const video of videos.current.values()) video.currentTime = next
  }

  if (!original || !run.metrics) return null
  return (
    <section id="results" className="py-8 md:py-12">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><p className="section-kicker">02 / GENERATED OUTPUTS</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] md:text-5xl">One timeline. {run.artifacts.length} realities.</h2></div>
        <div className="flex items-center gap-3"><span className="font-mono text-[9px] text-muted-foreground">{run.metrics.frames_analyzed} FRAMES · {run.metrics.fps} FPS</span><Badge variant="outline" className="rounded-full font-mono text-[9px]">SYNCHRONIZED</Badge></div>
      </div>
      <div className="grid gap-px border border-border bg-border xl:grid-cols-[1.65fr_.65fr]">
        <div className="bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">Original + model inference</h3><span className="max-w-56 truncate font-mono text-[9px] text-muted-foreground">{run.source.name}</span></div>
          <VideoStage id="original" videoUrl={original.url} label="Original inference" featured registerVideo={registerVideo} onTimeUpdate={(nextTime, nextDuration) => { setTime(nextTime); if (nextDuration) setDuration(nextDuration) }} />
        </div>
        <aside className="flex flex-col justify-between bg-card p-5 md:p-7">
          <div><p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">RUN DIAGNOSIS</p><div className="mt-6 flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Weakest stream</p><p className="mt-1 text-xl font-semibold">{weakest?.name || "No failures"}</p></div><span className="flex size-9 items-center justify-center rounded-full bg-alert/12 text-alert"><Gauge className="size-4" /></span></div><p className="mt-5 border-l-2 border-alert pl-4 text-sm leading-6 text-muted-foreground">{weakest ? `${weakest.failures} object failures across ${weakest.affected_frames} frames. First failure at ${formatTime(weakest.first_failure_seconds)}.` : "All baseline detections remained stable."}</p></div>
          <div className="mt-8 grid grid-cols-2 gap-px bg-border"><div className="bg-card py-4 pr-3"><span className="metric-label">BASELINE CONF.</span><p className="mt-1 text-2xl font-semibold">{run.metrics.baseline.mean_confidence}%</p></div><div className="bg-card py-4 pl-4"><span className="metric-label">ROBUSTNESS</span><p className="mt-1 text-2xl font-semibold text-alert">{run.metrics.robustness_score}</p></div></div>
        </aside>
      </div>
      <div className="flex items-center gap-3 border-x border-b border-border bg-card px-4 py-3">
        <button type="button" onClick={togglePlayback} className="flex size-8 items-center justify-center rounded-full bg-foreground text-background" aria-label={playing ? "Pause all videos" : "Play all videos"}>{playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}</button>
        <span className="w-11 font-mono text-[9px] text-muted-foreground">{formatTime(time)}</span>
        <input className="timeline-range h-1 flex-1" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Video timeline" />
        <span className="w-11 font-mono text-[9px] text-muted-foreground">{formatTime(duration)}</span>
        <button type="button" onClick={toggleMute} className="text-muted-foreground hover:text-foreground" aria-label={muted ? "Unmute original" : "Mute original"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {run.metrics.transforms.map((metric) => {
          const artifact = artifactById.get(metric.id)
          return artifact ? <ResultCard key={metric.id} artifact={artifact} metric={metric} registerVideo={registerVideo} /> : null
        })}
      </div>
    </section>
  )
}

function ActiveRun({ run }: { run: RunRecord }) {
  if (run.status === "completed" && run.metrics) return <><VideoWall run={run} /><MetricsPanel metrics={run.metrics} /></>
  const stageCounter = run.stage_index && run.stage_total
    ? `STAGE ${run.stage_index} OF ${run.stage_total}`
    : "FULL-STREAM PROCESSING"
  const stageProgress = run.stage_progress ?? run.progress
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center py-16">
      <div className="w-full border border-border bg-card p-8 text-center md:p-12">
        {run.status === "failed" ? <AlertTriangle className="mx-auto size-9 text-alert" /> : <LoaderCircle className="mx-auto size-9 animate-spin text-signal" />}
        <p className="mt-5 section-kicker">RUN {run.id.slice(-8).toUpperCase()}</p>
        <h1 className="mt-3 text-3xl font-semibold">{run.status === "failed" ? "Run failed" : run.stage}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{run.error || `${run.model.name} × ${run.source.name}`}</p>
        {run.status !== "failed" && <div className="mx-auto mt-8 max-w-xl"><div className="mb-2 flex justify-between font-mono text-[9px] text-muted-foreground"><span>{stageCounter}</span><span>{stageProgress}%</span></div><div className="h-1 bg-muted"><motion.div className="h-full bg-signal" animate={{ width: `${stageProgress}%` }} /></div></div>}
      </div>
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
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  const refreshRuns = useCallback(async () => {
    setLoadingRuns(true)
    try {
      setRuns(await getRuns())
    } catch (cause) {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the run")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadInitialState() {
      try {
        const [initialRuns, initialConfig] = await Promise.all([
          getRuns(),
          getTransformConfig(),
        ])
        const initialRun = initialRuns[0] ? await getRun(initialRuns[0].id) : null
        if (cancelled) return
        setRuns(initialRuns)
        setTransforms(initialConfig.transforms)
        setDevices(initialConfig.devices ?? [])
        setDevice(initialConfig.default_device)
        setSupportsDeviceSelection(initialConfig.supportsDeviceSelection)
        setSelectedId(initialRun?.id ?? null)
        setSelectedRun(initialRun)
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load CVFuzz")
        }
      } finally {
        if (!cancelled) setLoadingRuns(false)
      }
    }
    void loadInitialState()
    return () => {
      cancelled = true
    }
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
      <Header onNewRun={newRun} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
        <RunsSidebar runs={runs} selectedId={selectedId} loading={loadingRuns} onSelect={(id) => void selectRun(id)} onRefresh={() => void refreshRuns()} onNewRun={newRun} />
        <main className="min-w-0 px-4 sm:px-6 xl:px-8">
          {selectedRun ? <ActiveRun key={selectedRun.id} run={selectedRun} /> : <RunSetup model={model} video={video} devices={devices} device={device} supportsDeviceSelection={supportsDeviceSelection} transforms={transforms} onModel={setModel} onVideo={setVideo} onDevice={setDevice} onRun={() => void handleRun()} running={running} progress={progress} progressLabel={progressLabel} error={error} />}
          {error && selectedRun && <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 border border-alert/40 bg-card p-4 shadow-xl"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" /><div><p className="text-xs font-semibold">API error</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p></div></div>}
        </main>
      </div>
      <footer className="border-t border-border px-6 py-5 lg:ml-[280px]"><div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[8px] text-muted-foreground"><span className="flex items-center gap-2"><FlaskConical className="size-3" /> CVFUZZ FULL-STREAM ROBUSTNESS LAB</span><span className="flex items-center gap-2"><Film className="size-3" /> OUTPUTS STORED LOCALLY</span></div></footer>
    </div>
  )
}
