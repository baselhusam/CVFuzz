"use client"

import { useEffect, useRef, useState } from "react"
import { Expand, LoaderCircle, Minimize } from "lucide-react"
import { cn } from "@/lib/utils"

type VideoStageProps = {
  id: string
  videoUrl: string
  label: string
  featured?: boolean
  showFullscreenControl?: boolean
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
  onTimeUpdate?: (time: number, duration: number) => void
}

export function VideoStage({
  id,
  videoUrl,
  label,
  featured = false,
  showFullscreenControl = featured,
  registerVideo,
  onTimeUpdate,
}: VideoStageProps) {
  const [ready, setReady] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncFullscreenState = () => setFullscreen(document.fullscreenElement === stage.current)
    document.addEventListener("fullscreenchange", syncFullscreenState)
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState)
  }, [])

  const toggleFullscreen = async () => {
    if (!stage.current) return
    if (document.fullscreenElement === stage.current) await document.exitFullscreen()
    else await stage.current.requestFullscreen()
  }

  return (
    <div
      ref={stage}
      className={cn(
        "group/video relative aspect-video overflow-hidden bg-[#030504]",
        featured && "md:min-h-64",
      )}
    >
      <video
        ref={(node) => registerVideo(id, node)}
        src={videoUrl}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={label}
        className="size-full object-contain"
        onLoadedData={() => setReady(true)}
        onTimeUpdate={(event) => {
          if (!onTimeUpdate) return
          const node = event.currentTarget
          onTimeUpdate(node.currentTime, Number.isFinite(node.duration) ? node.duration : 0)
        }}
      />
      {featured && !ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030504] text-[11px] text-muted-foreground" aria-live="polite">
          <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Loading video preview…</span>
        </div>
      )}
      {showFullscreenControl && (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="absolute right-3 top-3 z-20 flex h-7 items-center gap-1.5 border border-white/20 bg-black/60 px-2 font-mono text-[8px] uppercase tracking-[.1em] text-white/80 opacity-0 backdrop-blur-sm transition-opacity hover:border-signal hover:text-white focus-visible:opacity-100 group-hover/video:opacity-100"
          aria-label={`${fullscreen ? "Exit" : "Expand"} ${label} video`}
        >
          {fullscreen ? <Minimize className="size-3" /> : <Expand className="size-3" />}
          <span className="hidden sm:inline">{fullscreen ? "Close" : "Expand"}</span>
        </button>
      )}
    </div>
  )
}
