"use client"

import { useRef, useState } from "react"
import { FileArchive, Film, Upload, X } from "lucide-react"
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
    eyebrow: "01 / MODEL",
    title: "Drop your detector",
    note: "Ultralytics or exported weights",
    accept: ".pt,.onnx,.engine",
    types: "PT, ONNX, ENGINE",
  },
  video: {
    eyebrow: "02 / SOURCE",
    title: "Drop your test video",
    note: "The entire stream will be evaluated",
    accept: "video/mp4,video/quicktime,video/webm,.mkv",
    types: "MP4, MOV, WEBM, MKV",
  },
}

export function FileDropzone({ kind, file, onFile }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const details = copy[kind]
  const Icon = kind === "model" ? FileArchive : Film

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
        "group relative min-h-56 overflow-hidden border bg-card p-5 transition-colors",
        dragging ? "border-signal bg-signal-soft" : "border-border hover:border-foreground/35",
      )}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={details.accept}
        onChange={(event) => takeFile(event.target.files?.[0])}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
        <span>{details.eyebrow}</span>
        <span>{details.types}</span>
      </div>

      {file ? (
        <div className="flex h-43 flex-col justify-end">
          <div className="mb-auto mt-7 flex size-12 items-center justify-center rounded-full bg-signal text-ink shadow-[0_0_0_7px_var(--signal-soft)]">
            <Icon className="size-5" />
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-[-0.025em]">{file.name}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{formatBytes(file.size)} · READY</p>
            </div>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              onClick={() => onFile(null)}
              aria-label={`Remove ${kind} file`}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-43 w-full flex-col items-start justify-end text-left"
        >
          <span className="mb-auto mt-7 flex size-12 items-center justify-center rounded-full border border-border bg-background transition-transform duration-300 group-hover:-translate-y-1">
            <Upload className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.025em]">{details.title}</span>
          <span className="mt-1 text-sm text-muted-foreground">{details.note}</span>
        </button>
      )}
    </motion.div>
  )
}
