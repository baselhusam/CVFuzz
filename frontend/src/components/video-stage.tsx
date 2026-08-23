"use client"

import { ScanLine } from "lucide-react"
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
  return (
    <div
      className={cn(
        "group/video relative aspect-video overflow-hidden bg-[#090d0a]",
        featured && "md:min-h-60",
      )}
    >
      <video
        ref={(node) => registerVideo(id, node)}
        src={videoUrl}
        muted
        loop
        playsInline
        preload={featured ? "metadata" : "none"}
        className="size-full object-contain"
        onTimeUpdate={(event) => {
          if (!onTimeUpdate) return
          const node = event.currentTarget
          onTimeUpdate(node.currentTime, Number.isFinite(node.duration) ? node.duration : 0)
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.22),transparent_18%,transparent_82%,rgba(0,0,0,.4))]" />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 font-mono text-[8px] tracking-[0.12em] text-white/78">
        <span className="flex items-center gap-1.5 bg-black/52 px-2 py-1 backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-signal" /> MODEL OUTPUT BAKED IN
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/45 px-2 py-1 font-mono text-[8px] text-white/70 backdrop-blur-sm">
        <ScanLine className="size-3" /> {label.toUpperCase()}
      </div>
    </div>
  )
}
