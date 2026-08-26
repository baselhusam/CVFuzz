"use client"

import { type ReactNode, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type VideoStageProps = {
  id: string
  videoUrl: string
  label: string
  featured?: boolean
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
  onTimeUpdate?: (time: number, duration: number) => void
  overlay?: ReactNode
}

export function VideoStage({
  id,
  videoUrl,
  label,
  featured = false,
  registerVideo,
  onTimeUpdate,
  overlay,
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
      {overlay}
      {featured && !ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030504] text-[11px] text-muted-foreground" aria-live="polite">
          <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Loading video preview…</span>
        </div>
      )}
    </div>
  )
}
