"use client"

import { useRef, useState } from "react"
import { Check, Film, Package, Upload, X } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/run-data"

type FileDropzoneProps = {
  kind: "model" | "video"
  file: File | null
  onFile: (file: File | null) => void
}

const copy = {
  model: {
    eyebrow: "01 / Model",
    title: "Add your detector",
    note: "Ultralytics weights or an exported runtime",
    accept: ".pt,.onnx,.engine",
    types: ".PT  .ONNX  .ENGINE",
  },
  video: {
    eyebrow: "02 / Evidence source",
    title: "Add a test video",
    note: "Every frame is evaluated and preserved",
    accept: "video/mp4,video/quicktime,video/webm,.mkv",
    types: "MP4  MOV  WEBM  MKV",
  },
}

export function FileDropzone({ kind, file, onFile }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const details = copy[kind]
  const Icon = kind === "model" ? Package : Film

  const takeFile = (next?: File) => {
    if (next) onFile(next)
    setDragging(false)
  }

  return (
    <motion.div
      layout
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        takeFile(event.dataTransfer.files[0])
      }}
      className={cn(
        "corner-frame group relative min-h-60 overflow-hidden rounded-lg border bg-card transition-colors",
        dragging ? "border-signal bg-signal-soft" : "border-border hover:border-white/20",
      )}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={details.accept}
        onChange={(event) => takeFile(event.target.files?.[0])}
      />
      {dragging && <span className="scan-line pointer-events-none absolute inset-x-0 top-0 h-px bg-signal" />}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{details.eyebrow}</span>
        <span>{details.types}</span>
      </div>

      {file ? (
        <div className="flex min-h-48 flex-col justify-between p-5">
          <div className="flex items-center justify-between gap-4">
            <span className="flex size-9 items-center justify-center rounded-md border border-stable/30 bg-stable/5 text-stable">
              <Check className="size-4" />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-stable">Ready</span>
          </div>
          <div className="flex items-end justify-between gap-4 pt-10">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium tracking-[-0.02em]">{file.name}</p>
              <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                {formatBytes(file.size)} · local input
              </p>
            </div>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive"
              onClick={() => onFile(null)}
              aria-label={`Remove ${kind} file`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-48 w-full flex-col items-start justify-between p-5 text-left"
        >
          <span className="flex size-10 items-center justify-center rounded-md border border-input bg-secondary text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-white/25 group-hover:text-foreground">
            {dragging ? <Icon className="size-4" /> : <Upload className="size-4" />}
          </span>
          <span>
            <span className="block text-[15px] font-medium tracking-[-0.02em]">
              {dragging ? "Release to ingest" : details.title}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{details.note}</span>
            <span className="mt-3 block font-mono text-[9px] uppercase tracking-[0.1em] text-steel">
              Drop here or <span className="text-foreground underline underline-offset-4">browse files</span>
            </span>
          </span>
        </button>
      )}
    </motion.div>
  )
}
