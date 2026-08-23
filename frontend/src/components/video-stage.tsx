"use client"

import { motion } from "framer-motion"
import { ScanLine } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AugmentationResult } from "@/lib/run-data"

type VideoStageProps = {
  id: string
  videoUrl: string | null
  result?: AugmentationResult
  featured?: boolean
  playing: boolean
  registerVideo: (id: string, node: HTMLVideoElement | null) => void
  onTimeUpdate?: (time: number, duration: number) => void
}

const boxes = [
  { className: "car", confidence: "0.94", left: "19%", top: "39%", width: "27%", height: "33%" },
  { className: "person", confidence: "0.87", left: "69%", top: "32%", width: "12%", height: "44%" },
  { className: "truck", confidence: "0.81", left: "48%", top: "43%", width: "18%", height: "27%" },
]

function SyntheticRoad({ playing }: { playing: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#111714]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#52655e_0%,#9ba59b_45%,#353835_46%,#171a18_100%)]" />
      <div className="absolute left-[12%] top-[15%] h-[32%] w-[12%] bg-[#26312c] shadow-[26px_6px_0_#334039,54px_-8px_0_#1f2924,88px_4px_0_#3b4740]" />
      <div className="absolute inset-x-0 bottom-0 h-[53%] bg-[linear-gradient(106deg,transparent_0_34%,#4d504d_34%_66%,transparent_66%)]" />
      <motion.div
        className="absolute bottom-[7%] left-[48%] h-[34%] w-[1.5%] bg-[#e8e1b9] opacity-75"
        animate={playing ? { y: [45, 0], scaleY: [0.1, 1.4], opacity: [0, 0.8, 0] } : {}}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      />
      <motion.div
        className="absolute left-[20%] top-[49%] h-[19%] w-[26%] rounded-[12%_18%_5%_5%] bg-[#bcb5a7] shadow-[inset_0_8px_0_#6f7771]"
        animate={playing ? { x: [0, 6, 0] } : {}}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
      />
      <div className="absolute left-[23%] top-[66%] size-[7%] rounded-full bg-[#0a0c0b] ring-2 ring-[#777]" />
      <div className="absolute left-[38%] top-[66%] size-[7%] rounded-full bg-[#0a0c0b] ring-2 ring-[#777]" />
      <motion.div
        className="absolute left-[52%] top-[54%] h-[15%] w-[15%] bg-[#777f7a] shadow-[inset_0_6px_0_#a3aaa5]"
        animate={playing ? { x: [2, -3, 2] } : {}}
        transition={{ repeat: Infinity, duration: 2.8 }}
      />
      <div className="absolute left-[73%] top-[44%] h-[30%] w-[5%] rounded-t-full bg-[#202c27]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,.34)_100%)]" />
    </div>
  )
}

function EffectOverlay({ effect }: { effect?: AugmentationResult["overlay"] }) {
  if (effect === "fog") return <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(232,242,239,.68),rgba(190,204,199,.28))]" />
  if (effect === "occlusion") return <div className="absolute left-[25%] top-[43%] h-[30%] w-[27%] bg-[#4e504c]/95 shadow-lg" />
  if (effect === "glare") return <div className="absolute inset-0 bg-[radial-gradient(circle_at_69%_34%,rgba(255,255,240,.96)_0,rgba(255,245,181,.57)_10%,transparent_31%)]" />
  if (effect === "noise") return <div className="video-noise absolute inset-0 opacity-35 mix-blend-screen" />
  if (effect === "compression") return <div className="video-compression absolute inset-0 opacity-18 mix-blend-overlay" />
  return null
}

export function VideoStage({
  id,
  videoUrl,
  result,
  featured = false,
  playing,
  registerVideo,
  onTimeUpdate,
}: VideoStageProps) {
  const confidenceLoss = result ? Math.min(0.75, Math.abs(result.confidenceDelta) / 80) : 0

  return (
    <div className={cn("group/video relative aspect-video overflow-hidden bg-[#111714]", featured && "min-h-55")}>
      <div className="absolute inset-0" style={{ filter: result?.filter }}>
        {videoUrl ? (
          <video
            ref={(node) => registerVideo(id, node)}
            src={videoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={cn("size-full object-cover", result?.id === "resolution" && "video-pixelated")}
            onTimeUpdate={(event) => {
              if (!onTimeUpdate) return
              const node = event.currentTarget
              onTimeUpdate(node.currentTime, Number.isFinite(node.duration) ? node.duration : 0)
            }}
          />
        ) : (
          <SyntheticRoad playing={playing} />
        )}
      </div>

      <EffectOverlay effect={result?.overlay} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.32),transparent_22%,transparent_72%,rgba(0,0,0,.58))]" />

      <div className="absolute left-3 top-3 flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] text-white/76">
        <span className="flex items-center gap-1.5 bg-black/45 px-2 py-1 backdrop-blur-sm">
          <span className="size-1.5 animate-pulse rounded-full bg-signal" /> LIVE INFERENCE
        </span>
        {featured && <span className="bg-black/45 px-2 py-1 backdrop-blur-sm">1920×1080</span>}
      </div>

      <div className="absolute inset-0">
        {boxes.map((box, index) => {
          const hidden = result?.id === "occlusion" && index === 0
          const score = Math.max(0.21, Number(box.confidence) - confidenceLoss - index * 0.03)
          return (
            <motion.div
              key={box.className}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: hidden ? 0.16 : 1, scale: 1 }}
              transition={{ delay: 0.08 * index, duration: 0.3 }}
              className={cn("absolute border", score < 0.5 ? "border-alert" : "border-signal")}
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            >
              <span className={cn("absolute -top-5 left-[-1px] px-1.5 py-0.5 font-mono text-[8px] font-semibold text-ink", score < 0.5 ? "bg-alert" : "bg-signal")}>
                {box.className} {score.toFixed(2)}
              </span>
            </motion.div>
          )
        })}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 font-mono text-[9px] text-white/65">
        <ScanLine className="size-3" /> FRAME 0184
      </div>
    </div>
  )
}
