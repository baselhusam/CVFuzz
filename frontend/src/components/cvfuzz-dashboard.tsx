"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowDown,
  Check,
  ChevronRight,
  CircleStop,
  Code2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FileDropzone } from "@/components/file-dropzone"
import { MetricsPanel } from "@/components/metrics-panel"
import { VideoStage } from "@/components/video-stage"
import { augmentationResults } from "@/lib/run-data"
import { submitRun } from "@/lib/run-service"

const reveal = {
  hidden: { opacity: 0, y: 22 },
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
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="CVFuzz home">
          <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="text-sm font-bold tracking-[-0.025em]">CVFUZZ</span>
          <Badge variant="outline" className="hidden rounded-full border-border px-2 font-mono text-[8px] text-muted-foreground sm:inline-flex">ALPHA 0.1</Badge>
        </a>
        <nav className="hidden items-center gap-7 font-mono text-[10px] tracking-[0.08em] text-muted-foreground md:flex">
          <a className="transition-colors hover:text-foreground" href="#run">RUN</a>
          <a className="transition-colors hover:text-foreground" href="#results">VIDEO WALL</a>
          <a className="transition-colors hover:text-foreground" href="#metrics">METRICS</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={onNewRun} className="h-9 rounded-full bg-foreground px-4 text-background hover:bg-foreground/85">New run <ChevronRight className="ml-1 size-3.5" /></Button>
        </div>
      </div>
    </header>
  )
}

function RunSetup({
  model,
  video,
  onModel,
  onVideo,
  onRun,
  running,
  progress,
  progressLabel,
  error,
}: {
  model: File | null
  video: File | null
  onModel: (file: File | null) => void
  onVideo: (file: File | null) => void
  onRun: () => void
  running: boolean
  progress: number
  progressLabel: string
  error: string | null
}) {
  const ready = Boolean(model && video)
  return (
    <motion.section
      id="run"
      variants={reveal}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-28 border border-border bg-card shadow-[0_22px_80px_rgba(0,0,0,.06)] dark:shadow-[0_22px_80px_rgba(0,0,0,.25)]"
    >
      <div className="grid gap-px bg-border md:grid-cols-2">
        <FileDropzone kind="model" file={model} onFile={onModel} />
        <FileDropzone kind="video" file={video} onFile={onVideo} />
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2"><Check className="size-3 text-signal" /> FULL VIDEO</span>
          <span className="flex items-center gap-2"><Check className="size-3 text-signal" /> 9 TECHNIQUES</span>
          <span className="flex items-center gap-2"><Check className="size-3 text-signal" /> ALL DETECTIONS</span>
        </div>
        <Button
          size="lg"
          disabled={!ready || running}
          onClick={onRun}
          className="h-12 min-w-48 rounded-none bg-signal px-7 font-semibold text-ink shadow-[4px_4px_0_var(--foreground)] hover:bg-signal/85 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          {running ? <><CircleStop className="size-4 animate-pulse" /> Running {progress}%</> : <><Play className="size-4 fill-current" /> Run robustness test</>}
        </Button>
      </div>
      <AnimatePresence>
        {(running || progress === 100 || error) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border">
            <div className="flex items-center justify-between px-5 py-3 font-mono text-[10px]">
              <span className={error ? "text-destructive" : "text-muted-foreground"}>{error ?? progressLabel}</span>
              <span>{error ? "FAILED" : `${progress}%`}</span>
            </div>
            {!error && <div className="h-1 bg-muted"><motion.div className="h-full bg-signal" animate={{ width: `${progress}%` }} transition={{ ease: "easeOut" }} /></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "00:00"
  const minutes = Math.floor(value / 60).toString().padStart(2, "0")
  const seconds = Math.floor(value % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

function ResultCard({
  result,
  videoUrl,
  playing,
  registerVideo,
}: {
  result: (typeof augmentationResults)[number]
  videoUrl: string | null
  playing: boolean
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
}) {
  return (
    <motion.article
      variants={reveal}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[9px] text-muted-foreground">{result.shortName}</span>
          <h3 className="text-sm font-semibold tracking-[-0.02em]">{result.name}</h3>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">{result.parameter}</span>
      </div>
      <VideoStage id={result.id} videoUrl={videoUrl} result={result} playing={playing} registerVideo={registerVideo} />
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
        <div className="p-3"><span className="metric-label">CONF.</span><p className="mt-1 font-mono text-xs font-semibold">{result.confidence}%</p></div>
        <div className="p-3"><span className="metric-label">DELTA</span><p className="mt-1 font-mono text-xs font-semibold text-alert">{result.confidenceDelta}%</p></div>
        <div className="p-3"><span className="metric-label">FAILURES</span><p className="mt-1 font-mono text-xs font-semibold">{result.failures}</p></div>
      </div>
    </motion.article>
  )
}

function VideoWall({ videoUrl, videoName }: { videoUrl: string | null; videoName: string | null }) {
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [time, setTime] = useState(12.4)
  const [duration, setDuration] = useState(48)

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

  return (
    <section id="results" className="scroll-mt-24 py-16 md:py-24">
      <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="section-kicker">02 / VIDEO WALL</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] md:text-5xl">One stream. Ten realities.</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground"><i className="size-1.5 animate-pulse rounded-full bg-signal" /> SYNCHRONIZED PLAYBACK</span>
          <Badge variant="outline" className="rounded-full font-mono text-[9px]">184 FRAMES</Badge>
        </div>
      </div>

      <div className="grid gap-px border border-border bg-border lg:grid-cols-[1.65fr_.65fr]">
        <div className="bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5"><span className="font-mono text-[9px] text-muted-foreground">ORG</span><h3 className="text-sm font-semibold">Original + inference</h3></div>
            <span className="max-w-44 truncate font-mono text-[9px] text-muted-foreground">{videoName ?? "street-sequence-04.mp4"}</span>
          </div>
          <VideoStage id="original" videoUrl={videoUrl} featured playing={playing} registerVideo={registerVideo} onTimeUpdate={(nextTime, nextDuration) => { setTime(nextTime); setDuration(nextDuration || 48) }} />
        </div>
        <aside className="flex flex-col justify-between bg-card p-5 md:p-7">
          <div>
            <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">RUN DIAGNOSIS</p>
            <div className="mt-5 flex items-start justify-between">
              <div><p className="text-sm text-muted-foreground">Weakest condition</p><p className="mt-1 text-xl font-semibold tracking-[-0.035em]">Partial occlusion</p></div>
              <span className="flex size-9 items-center justify-center rounded-full bg-alert/12 text-alert"><ArrowDown className="size-4" /></span>
            </div>
            <p className="mt-5 border-l-2 border-alert pl-4 text-sm leading-6 text-muted-foreground">The first sustained miss appears at 40% center occlusion. Motion blur causes the earliest localization drift.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-px bg-border">
            <div className="bg-card py-4 pr-3"><span className="metric-label">BASELINE</span><p className="mt-1 text-2xl font-semibold">91.8%</p></div>
            <div className="bg-card py-4 pl-4"><span className="metric-label">WORST CASE</span><p className="mt-1 text-2xl font-semibold text-alert">48.3%</p></div>
          </div>
        </aside>
      </div>

      <div className="flex flex-col items-center gap-3 border-x border-b border-border bg-card px-4 py-3 sm:flex-row">
        <button type="button" onClick={togglePlayback} className="flex size-8 items-center justify-center rounded-full bg-foreground text-background" aria-label={playing ? "Pause all videos" : "Play all videos"}>{playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}</button>
        <span className="w-11 font-mono text-[9px] text-muted-foreground">{formatTime(time)}</span>
        <input className="timeline-range h-1 flex-1" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} aria-label="Video timeline" />
        <span className="w-11 font-mono text-[9px] text-muted-foreground">{formatTime(duration)}</span>
        <button type="button" onClick={toggleMute} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={muted ? "Unmute original video" : "Mute original video"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
      </div>

      <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.06, delayChildren: 0.12 }} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {augmentationResults.map((result) => <ResultCard key={result.id} result={result} videoUrl={videoUrl} playing={playing} registerVideo={registerVideo} />)}
      </motion.div>
    </section>
  )
}

export function CVFuzzDashboard() {
  const [model, setModel] = useState<File | null>(null)
  const [video, setVideo] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [runMode, setRunMode] = useState<"sample" | "preview" | "api">("sample")

  const handleVideo = (file: File | null) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideo(file)
    setVideoUrl(file ? URL.createObjectURL(file) : null)
  }

  const handleRun = async () => {
    if (!model || !video) return
    setRunning(true)
    setProgress(0)
    setError(null)
    try {
      const result = await submitRun({ model, video, onProgress: (state) => { setProgress(state.progress); setProgressLabel(state.label) } })
      setRunMode(result.mode)
      window.setTimeout(() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }), 320)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run could not be started")
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setModel(null)
    handleVideo(null)
    setProgress(0)
    setError(null)
    document.querySelector("#run")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <div id="top" className="min-h-screen overflow-clip bg-background text-foreground">
      <Header onNewRun={reset} />
      <main className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <section className="relative grid min-h-[520px] items-center py-16 md:grid-cols-[1.15fr_.85fr] md:py-24">
          <div className="pointer-events-none absolute right-[-8%] top-[8%] -z-0 size-[430px] rounded-full bg-signal-soft blur-[90px]" />
          <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.08 }} className="relative z-10">
            <motion.div variants={reveal} className="mb-7 flex items-center gap-3"><span className="h-px w-8 bg-signal" /><span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">LOCAL-FIRST MODEL ROBUSTNESS LAB</span></motion.div>
            <motion.h1 variants={reveal} className="max-w-4xl text-[clamp(3.5rem,8vw,8.6rem)] font-semibold leading-[0.82] tracking-[-0.075em]">
              Break the model<span className="text-signal">.</span><br />Before the road does<span className="text-alert">.</span>
            </motion.h1>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.7 }} className="relative z-10 mt-10 flex flex-col justify-end md:mt-28 md:pl-12">
            <div className="max-w-md border-l border-border pl-5">
              <p className="text-base leading-7 text-muted-foreground">Upload one detector and one video. CVFuzz runs every frame through nine realistic degradations, then shows you exactly where detection confidence gives way.</p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <a href="#run" className="flex items-center gap-2 text-sm font-semibold">Start a run <ArrowDown className="size-4" /></a>
                <span className="font-mono text-[9px] text-muted-foreground">NO CLOUD REQUIRED</span>
              </div>
            </div>
          </motion.div>
        </section>

        <RunSetup model={model} video={video} onModel={setModel} onVideo={handleVideo} onRun={handleRun} running={running} progress={progress} progressLabel={progressLabel} error={error} />

        <div className="mt-5 flex items-center justify-between font-mono text-[9px] text-muted-foreground">
          <span className="flex items-center gap-2"><Sparkles className="size-3 text-signal" /> {runMode === "sample" ? "SHOWING A SYNTHETIC SAMPLE RUN" : runMode === "preview" ? "LOCAL PREVIEW COMPLETE" : "API RUN ACCEPTED"}</span>
          {runMode !== "sample" && <button type="button" onClick={reset} className="flex items-center gap-1.5 transition-colors hover:text-foreground"><RotateCcw className="size-3" /> RESET</button>}
        </div>

        <VideoWall videoUrl={videoUrl} videoName={video?.name ?? null} />
        <MetricsPanel />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><span className="logo-mark scale-75" aria-hidden="true"><i /><i /><i /></span><span className="text-xs font-bold">CVFUZZ</span><span className="font-mono text-[9px] text-muted-foreground">/ BUILT FOR MODELS THAT LEAVE THE LAB</span></div>
          <a href="https://github.com" className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground transition-colors hover:text-foreground"><Code2 className="size-3.5" /> VIEW SOURCE</a>
        </div>
      </footer>
    </div>
  )
}
