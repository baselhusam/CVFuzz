"use client"

import { useState } from "react"
import { LoaderCircle, ScanLine } from "lucide-react"
import { cn } from "@/lib/utils"

type VideoStageProps = {
  id: string
  videoUrl: string
  label: string
  featured?: boolean
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
  onTimeUpdate?: (time: number, duration: number) => void
}

export function VideoStage({
  id,
  videoUrl,
  label,
  featured = false,
  registerVideo,
  onTimeUpdate,
}: VideoStageProps) {
  const [ready, setReady] = useState(false)
  return (
    <div
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
        preload={featured ? "auto" : "metadata"}
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
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.35),transparent_22%,transparent_75%,rgba(0,0,0,.55))]" />
      <span className="pointer-events-none absolute left-2.5 top-2.5 size-4 border-l border-t border-white/35" />
      <span className="pointer-events-none absolute bottom-2.5 right-2.5 size-4 border-b border-r border-signal/80" />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-sm bg-black/55 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/75 backdrop-blur-sm">
        <span className="size-1.5 rounded-full bg-stable" /> Inference overlay
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 flex max-w-[70%] items-center gap-1.5 rounded-sm bg-black/55 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-white/70 backdrop-blur-sm">
        <ScanLine className="size-3" /> <span className="truncate">{label}</span>
      </div>
    </div>
  )
}
