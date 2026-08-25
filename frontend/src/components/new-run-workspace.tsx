"use client"

import Image from "next/image"
import { Select } from "@base-ui/react/select"
import { motion } from "framer-motion"
import {
  Check,
  ChevronDown,
  CircleStop,
  ImageIcon,
  Play,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { FileDropzone } from "@/components/file-dropzone"
import { Button } from "@/components/ui/button"
import { formatParameters, type InferenceDevice, type TransformConfig } from "@/lib/run-data"

type VideoDimensions = { width: number; height: number }

type NewRunWorkspaceProps = {
  model: File | null
  video: File | null
  devices: InferenceDevice[]
  device: InferenceDevice["id"]
  batchSize: number
  imageSize: number | null
  videoDimensions: VideoDimensions | null
  supportsDeviceSelection: boolean
  transforms: TransformConfig[]
  onModel: (file: File | null) => void
  onVideo: (file: File | null) => void
  onDevice: (device: InferenceDevice["id"]) => void
  onBatchSize: (batchSize: number) => void
  onImageSize: (imageSize: number | null) => void
  onTransforms: (transforms: TransformConfig[]) => void
  onRun: () => void
  running: boolean
  progress: number
  progressLabel: string
  error: string | null
}

type ParameterValue = string | number
type ParameterSpec = { label: string; values: ParameterValue[]; unit?: string }

const parameterSpecs: Record<string, Record<string, ParameterSpec>> = {
  exposure: {
    stops: { label: "Exposure", values: [-0.5, -1, -1.5, -2, -2.5, -3], unit: " EV" },
  },
  low_light: {
    stops: { label: "Light loss", values: [-0.5, -1, -1.5, -2, -2.5, -3], unit: " EV" },
    noise_std: { label: "Sensor noise", values: [4, 8, 12, 16] },
  },
  motion_blur: {
    kernel_size: { label: "Kernel", values: [3, 5, 7, 9, 11, 15, 21], unit: " px" },
    angle_degrees: { label: "Angle", values: [0, 45, 90], unit: "°" },
  },
  defocus_blur: {
    sigma: { label: "Blur radius", values: [0.5, 1, 1.5, 2, 3, 4], unit: " px" },
  },
  jpeg_compression: {
    quality: { label: "JPEG quality", values: [90, 75, 60, 45, 30, 15, 5], unit: "%" },
  },
  resolution_degradation: {
    scale: { label: "Resolution scale", values: [0.85, 0.7, 0.55, 0.4, 0.25, 0.15] },
    interpolation: { label: "Interpolation", values: ["area", "linear", "nearest", "cubic"] },
  },
  fog: {
    strength: { label: "Fog density", values: [0.1, 0.2, 0.3, 0.4, 0.55, 0.7] },
  },
  partial_occlusion: {
    fraction: { label: "Frame coverage", values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.65] },
    position: { label: "Position", values: ["center", "top", "bottom"] },
    color: { label: "Fill", values: ["mean", "black", "white"] },
  },
  glare: {
    intensity: { label: "Intensity", values: [0.15, 0.3, 0.45, 0.6, 0.75] },
    radius_fraction: { label: "Radius", values: [0.18, 0.3, 0.42] },
    center_x: { label: "Horizontal origin", values: [0.35, 0.5, 0.65] },
    center_y: { label: "Vertical origin", values: [0.35, 0.5, 0.65] },
  },
}

const transformIndex: Record<string, string> = {
  exposure: "01",
  low_light: "02",
  motion_blur: "03",
  defocus_blur: "04",
  jpeg_compression: "05",
  resolution_degradation: "06",
  fog: "07",
  partial_occlusion: "08",
  glare: "09",
}

function extractFirstFrame(file: File | null) {
  return new Promise<string | null>((resolve) => {
    if (!file) {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    let settled = false
    const finish = (result: string | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      video.removeAttribute("src")
      video.load()
      resolve(result)
    }
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.onloadeddata = () => {
      try {
        const scale = Math.min(1, 960 / video.videoWidth)
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext("2d")
        if (!context) return finish(null)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL("image/jpeg", 0.82))
      } catch {
        finish(null)
      }
    }
    video.onerror = () => finish(null)
    video.src = url
  })
}

function useFirstFrame(video: File | null) {
  const [result, setResult] = useState<{ video: File | null; frame: string | null }>({
    video: null,
    frame: null,
  })

  useEffect(() => {
    let cancelled = false
    if (!video) return () => { cancelled = true }
    void extractFirstFrame(video).then((next) => {
      if (!cancelled) {
        setResult({ video, frame: next })
      }
    })
    return () => { cancelled = true }
  }, [video])

  const current = result.video === video
  return {
    frame: current ? result.frame : null,
    loading: Boolean(video && !current),
  }
}

function RuntimeSelect({
  devices,
  device,
  disabled,
  onDevice,
}: {
  devices: InferenceDevice[]
  device: InferenceDevice["id"]
  disabled: boolean
  onDevice: (device: InferenceDevice["id"]) => void
}) {
  return (
    <Select.Root
      id="inference-device"
      name="inference-device"
      value={device}
      disabled={disabled}
      items={devices.map((option) => ({ label: option.name, value: option.id }))}
      onValueChange={(value) => value && onDevice(value as InferenceDevice["id"])}
    >
      <Select.Label className="metric-label">Processing device</Select.Label>
      <Select.Trigger className="group mt-3 flex h-11 w-full items-center justify-between gap-3 border border-input bg-background px-3.5 text-left text-[12px] text-foreground transition-colors hover:not-data-disabled:border-signal/50 data-pressed:border-signal/50 disabled:cursor-not-allowed disabled:opacity-50">
        <Select.Value className="truncate" />
        <Select.Icon className="text-muted-foreground transition-transform group-data-open:rotate-180">
          <ChevronDown className="size-4" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-[80] outline-hidden" sideOffset={7}>
          <Select.Popup className="min-w-[var(--anchor-width)] border border-border bg-popover p-1.5 text-foreground shadow-[0_22px_60px_rgba(0,0,0,.35)] outline-hidden">
            <Select.List className="space-y-1">
              {devices.map((option) => (
                <Select.Item
                  key={option.id}
                  value={option.id}
                  disabled={!option.available}
                  className="group/item grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-2.5 px-2.5 py-2.5 text-[12px] outline-hidden data-highlighted:bg-secondary data-selected:bg-signal-soft data-disabled:cursor-not-allowed data-disabled:opacity-40"
                >
                  <Select.ItemIndicator keepMounted className="invisible text-signal group-data-[selected]/item:visible">
                    <Check className="size-3.5" />
                  </Select.ItemIndicator>
                  <span className="min-w-0">
                    <Select.ItemText className="block truncate">{option.name}</Select.ItemText>
                    <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
                      {option.available ? option.description : "Unavailable on this computer"}
                    </span>
                  </span>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

function NumericPreset({
  label,
  value,
  presets,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string
  value: number
  presets: number[]
  min: number
  max: number
  suffix: string
  disabled: boolean
  onChange: (value: number) => void
}) {
  const custom = !presets.includes(value)
  const customInput = useRef<HTMLInputElement>(null)
  return (
    <fieldset disabled={disabled}>
      <legend className="metric-label">{label}</legend>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {presets.map((preset) => (
          <button
            type="button"
            key={preset}
            onClick={() => {
              onChange(preset)
              if (customInput.current) customInput.current.value = ""
            }}
            className={`num h-9 border text-[10px] transition-colors ${
              value === preset
                ? "border-signal bg-signal text-ink"
                : "border-input bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
      <label className={`mt-2 flex h-9 items-center border bg-background ${custom ? "border-signal" : "border-input"}`}>
        <span className="num border-r border-inherit px-2.5 text-[8px] uppercase tracking-[.1em] text-muted-foreground">Custom</span>
        <input
          type="number"
          min={min}
          max={max}
          ref={customInput}
          defaultValue={custom ? value : ""}
          placeholder={`Enter ${label.toLowerCase()}`}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next >= min && next <= max) onChange(next)
          }}
          aria-label={`Custom ${label.toLowerCase()}`}
          className="num h-full min-w-0 flex-1 bg-transparent px-2.5 text-[10px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        {custom ? `Custom value: ${value} ${suffix}` : `${value} ${suffix}`} · choose a preset or type your own
      </p>
    </fieldset>
  )
}

function ImageSizePreset({
  value,
  sourceLabel,
  disabled,
  onChange,
}: {
  value: number | null
  sourceLabel: string
  disabled: boolean
  onChange: (value: number | null) => void
}) {
  const presets = [1280, 960, 640]
  const custom = value !== null && !presets.includes(value)
  const customInput = useRef<HTMLInputElement>(null)
  return (
    <fieldset disabled={disabled}>
      <legend className="metric-label">Inference image size</legend>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => {
            onChange(null)
            if (customInput.current) customInput.current.value = ""
          }}
          className={`num h-9 border text-[9px] uppercase transition-colors ${value === null ? "border-signal bg-signal text-ink" : "border-input bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground"}`}
        >
          Source
        </button>
        {presets.map((preset) => (
          <button
            type="button"
            key={preset}
            onClick={() => {
              onChange(preset)
              if (customInput.current) customInput.current.value = ""
            }}
            className={`num h-9 border text-[10px] transition-colors ${value === preset ? "border-signal bg-signal text-ink" : "border-input bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground"}`}
          >
            {preset}
          </button>
        ))}
      </div>
      <label className={`mt-2 flex h-9 items-center border bg-background ${custom ? "border-signal" : "border-input"}`}>
        <span className="num border-r border-inherit px-2.5 text-[8px] uppercase tracking-[.1em] text-muted-foreground">Custom</span>
        <input
          type="number"
          min={32}
          max={4096}
          ref={customInput}
          defaultValue={custom ? value : ""}
          placeholder="Enter pixels, e.g. 1024"
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next >= 32 && next <= 4096) onChange(next)
          }}
          aria-label="Custom inference image size"
          className="num h-full min-w-0 flex-1 bg-transparent px-2.5 text-[10px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <p className="mt-2 truncate text-[10px] leading-4 text-muted-foreground" title={sourceLabel}>
        {value === null ? sourceLabel : `${value} × ${value} square input`} · preset or custom pixels
      </p>
    </fieldset>
  )
}

function parameterNumber(parameters: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(parameters[key])
  return Number.isFinite(value) ? value : fallback
}

function previewStyle(transform: TransformConfig) {
  const p = transform.parameters
  switch (transform.id) {
    case "exposure":
      return { filter: `brightness(${Math.max(0.12, 2 ** parameterNumber(p, "stops", -2))})` }
    case "low_light":
      return { filter: `brightness(${Math.max(0.1, 2 ** parameterNumber(p, "stops", -2.5))}) saturate(.55) contrast(1.18)` }
    case "motion_blur":
      return { filter: `blur(${Math.max(1, parameterNumber(p, "kernel_size", 11) / 3.5)}px)`, transform: "scale(1.04)" }
    case "defocus_blur":
      return { filter: `blur(${parameterNumber(p, "sigma", 3)}px)`, transform: "scale(1.035)" }
    case "jpeg_compression":
      return { filter: `contrast(${1 + (100 - parameterNumber(p, "quality", 30)) / 260}) saturate(${1 + (100 - parameterNumber(p, "quality", 30)) / 320})` }
    case "resolution_degradation":
      return { filter: `blur(${Math.max(0, (1 - parameterNumber(p, "scale", 0.4)) * 3)}px)`, transform: "scale(1.025)" }
    case "fog":
      return { filter: `contrast(${1 - parameterNumber(p, "strength", 0.4) * 0.55}) brightness(${1 + parameterNumber(p, "strength", 0.4) * 0.18}) saturate(.55)` }
    case "glare":
      return { filter: "contrast(1.04)" }
    default:
      return undefined
  }
}

function PreviewOverlay({ transform }: { transform: TransformConfig }) {
  const p = transform.parameters
  if (transform.id === "low_light") {
    return <span className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,.8)_.45px,transparent_.6px)] [background-size:3px_3px]" />
  }
  if (transform.id === "jpeg_compression") {
    const opacity = Math.min(0.25, (100 - parameterNumber(p, "quality", 30)) / 420)
    return <span className="absolute inset-0 [background-image:linear-gradient(90deg,rgba(255,255,255,.45)_1px,transparent_1px),linear-gradient(rgba(0,0,0,.55)_1px,transparent_1px)] [background-size:9px_9px]" style={{ opacity }} />
  }
  if (transform.id === "fog") {
    return <span className="absolute inset-0 bg-[linear-gradient(155deg,rgba(245,248,240,.92),rgba(226,234,235,.62))]" style={{ opacity: parameterNumber(p, "strength", 0.4) * 0.72 }} />
  }
  if (transform.id === "partial_occlusion") {
    const fraction = parameterNumber(p, "fraction", 0.4)
    const position = String(p.position || "center")
    const color = String(p.color || "mean")
    const background = color === "white" ? "#f7f9f2" : color === "black" ? "#06080b" : "#52595d"
    return (
      <span
        className="absolute left-0 right-0"
        style={{
          height: `${Math.min(75, fraction * 100)}%`,
          top: position === "top" ? 0 : position === "bottom" ? undefined : "50%",
          bottom: position === "bottom" ? 0 : undefined,
          transform: position === "center" ? "translateY(-50%)" : undefined,
          background,
        }}
      />
    )
  }
  if (transform.id === "glare") {
    const intensity = parameterNumber(p, "intensity", 0.6)
    const radius = parameterNumber(p, "radius_fraction", 0.3) * 100
    const x = parameterNumber(p, "center_x", 0.65) * 100
    const y = parameterNumber(p, "center_y", 0.35) * 100
    return <span className="absolute inset-0" style={{ opacity: intensity, background: `radial-gradient(circle ${radius}% at ${x}% ${y}%, rgba(255,255,255,.98), rgba(255,255,255,.35) 45%, transparent 72%)` }} />
  }
  return null
}

function ParameterControl({
  transform,
  name,
  value,
  onChange,
}: {
  transform: TransformConfig
  name: string
  value: unknown
  onChange: (value: ParameterValue) => void
}) {
  const baseSpec = parameterSpecs[transform.id]?.[name]
  const configuredValues = transform.parameter_options?.[name]
  const spec = baseSpec
    ? { ...baseSpec, values: configuredValues || baseSpec.values }
    : configuredValues
      ? { label: name.replaceAll("_", " "), values: configuredValues }
      : undefined
  if (!spec) {
    return (
      <label className="block">
        <span className="metric-label">{name.replaceAll("_", " ")}</span>
        <input
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 h-9 w-full border border-input bg-background px-2.5 font-mono text-[10px] outline-none focus:border-signal"
        />
      </label>
    )
  }
  const numeric = spec.values.every((option) => typeof option === "number")
  if (numeric) {
    const activeIndex = Math.max(
      0,
      spec.values.findIndex((option) => Number(option) === Number(value)),
    )
    return (
      <label className="block">
        <span className="flex items-baseline justify-between gap-3">
          <span className="metric-label">{spec.label}</span>
          <span className="num text-[10px] text-foreground">{String(spec.values[activeIndex])}{spec.unit}</span>
        </span>
        <input
          type="range"
          min={0}
          max={spec.values.length - 1}
          step={1}
          value={activeIndex}
          onChange={(event) => onChange(spec.values[Number(event.target.value)])}
          className="augmentation-range mt-2 h-1 w-full"
        />
      </label>
    )
  }
  return (
    <fieldset>
      <legend className="metric-label">{spec.label}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {spec.values.map((option) => (
          <button
            type="button"
            key={String(option)}
            onClick={() => onChange(option)}
            className={`border px-2 py-1 font-mono text-[9px] uppercase transition-colors ${String(value) === String(option) ? "border-signal bg-signal text-ink" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}
          >
            {String(option)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function AugmentationCard({
  transform,
  frame,
  frameLoading,
  onToggle,
  onParameter,
  onReset,
  resetAvailable,
}: {
  transform: TransformConfig
  frame: string | null
  frameLoading: boolean
  onToggle: () => void
  onParameter: (name: string, value: ParameterValue) => void
  onReset: () => void
  resetAvailable: boolean
}) {
  return (
    <motion.article
      layout
      className={`group overflow-hidden border bg-card transition-colors ${transform.enabled ? "border-border hover:border-foreground/20" : "border-border/50 opacity-60"}`}
    >
      <div className="flex items-center gap-3 border-b border-border px-3.5 py-3">
        <span className="num text-[8px] text-muted-foreground">{transformIndex[transform.id] || "--"}</span>
        <h3 className="min-w-0 flex-1 truncate text-[12px] font-medium">{transform.name}</h3>
        {transform.target_aware && <span className="hidden font-mono text-[7px] uppercase tracking-[.1em] text-muted-foreground sm:block">target aware</span>}
        <button
          type="button"
          role="switch"
          aria-checked={transform.enabled}
          aria-label={`${transform.enabled ? "Disable" : "Enable"} ${transform.name}`}
          onClick={onToggle}
          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${transform.enabled ? "border-signal bg-signal" : "border-input bg-secondary"}`}
        >
          <span className={`absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full transition-all ${transform.enabled ? "left-[18px] bg-ink" : "left-[2px] bg-muted-foreground"}`} />
        </button>
      </div>

      <div className="relative aspect-[16/9] overflow-hidden bg-ink evidence-grid">
        {frame ? (
          <>
            <Image
              src={frame}
              alt={`${transform.name} preview from the first video frame`}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover"
              style={previewStyle(transform)}
            />
            <PreviewOverlay transform={transform} />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <ImageIcon className={`size-5 ${frameLoading ? "signal-pulse text-signal" : "text-muted-foreground"}`} />
            <p className="mt-3 font-mono text-[8px] uppercase tracking-[.12em] text-muted-foreground">
              {frameLoading ? "Extracting frame 0001" : "Upload video to render preview"}
            </p>
          </div>
        )}
        <span className="absolute bottom-2 left-2 bg-ink/80 px-2 py-1 font-mono text-[7px] uppercase tracking-[.12em] text-white/70 backdrop-blur">
          frame 0001 · preview
        </span>
      </div>

      <details className="group/editor">
        <summary
          aria-disabled={!transform.enabled}
          onClick={(event) => { if (!transform.enabled) event.preventDefault() }}
          className={`flex min-h-12 list-none items-center gap-2 px-3.5 text-[10px] text-muted-foreground ${transform.enabled ? "cursor-pointer hover:bg-secondary/45" : "cursor-not-allowed"}`}
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="min-w-0 flex-1 truncate font-mono text-[8px]">{formatParameters(transform.parameters)}</span>
          <ChevronDown className="size-3.5 transition-transform group-open/editor:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-border bg-secondary/30 px-3.5 py-4">
          {Object.entries(transform.parameters).map(([name, value]) => (
            <ParameterControl
              key={name}
              transform={transform}
              name={name}
              value={value}
              onChange={(next) => onParameter(name, next)}
            />
          ))}
          <div className="flex justify-end border-t border-border/70 pt-3">
            <button
              type="button"
              disabled={!resetAvailable}
              onClick={onReset}
              className="border border-input px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[.1em] text-muted-foreground transition-colors hover:border-signal hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </details>
    </motion.article>
  )
}

export function NewRunWorkspace({
  model,
  video,
  devices,
  device,
  batchSize,
  imageSize,
  videoDimensions,
  supportsDeviceSelection,
  transforms,
  onModel,
  onVideo,
  onDevice,
  onBatchSize,
  onImageSize,
  onTransforms,
  onRun,
  running,
  progress,
  progressLabel,
  error,
}: NewRunWorkspaceProps) {
  const ready = Boolean(model && video)
  const enabled = transforms.filter((transform) => transform.enabled)
  const { frame, loading: frameLoading } = useFirstFrame(video)
  const selectedDevice = devices.find((option) => option.id === device)
  const sourceLabel = videoDimensions
    ? `Source frame · ${videoDimensions.width} × ${videoDimensions.height}`
    : "Source frame dimensions"
  const stageCount = enabled.length + 1
  const summary = `${stageCount} stages · ${selectedDevice?.name || "Automatic"} · batch ${batchSize} · ${imageSize ? `${imageSize}px` : "source size"}`
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const defaultsRef = useRef<Record<string, Record<string, unknown>>>({})
  const [changedTransforms, setChangedTransforms] = useState<Set<string>>(() => new Set())

  const updateTransform = (id: string, update: (transform: TransformConfig) => TransformConfig) => {
    onTransforms(transforms.map((transform) => transform.id === id ? update(transform) : transform))
  }

  const resetParameters = (id: string) => {
    const defaults = defaultsRef.current[id]
    if (!defaults) return
    updateTransform(id, (current) => ({ ...current, parameters: { ...defaults } }))
    setChangedTransforms((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const updateParameter = (id: string, name: string, value: ParameterValue) => {
    const transform = transforms.find((item) => item.id === id)
    if (!transform) return
    const defaults = defaultsRef.current[id] ||= { ...transform.parameters }
    const parameters = { ...transform.parameters, [name]: value }
    updateTransform(id, (current) => ({ ...current, parameters }))
    setChangedTransforms((current) => {
      const next = new Set(current)
      if (JSON.stringify(parameters) === JSON.stringify(defaults)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-[1280px] px-0 pb-16 pt-10 md:px-4 md:pt-16"
    >
      <section className="relative py-10 sm:py-12" aria-labelledby="inputs-heading">
        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="mx-auto w-full max-w-[31rem]">
            <Image
              src="/brand/cvfuzz-logo-light.png"
              alt="CVFuzz"
              width={2172}
              height={724}
              priority
              className="h-auto w-full dark:hidden"
            />
            <Image
              src="/brand/cvfuzz-logo-dark.png"
              alt="CVFuzz"
              width={2172}
              height={724}
              priority
              className="hidden h-auto w-full dark:block"
            />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-[13px] leading-6 text-steel">
            Upload a detector and source clip, then configure the conditions that reveal where your model holds up — and where it fails.
          </p>
        </div>
        <div className="relative mx-auto mt-10 max-w-5xl">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
            <h2 id="inputs-heading" className="text-lg tracking-[-.025em]">Model and source</h2>
            <span className="hidden font-mono text-[8px] uppercase tracking-[.13em] text-muted-foreground sm:block">Local files · never uploaded to a cloud service</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FileDropzone kind="model" file={model} onFile={onModel} />
            <FileDropzone kind="video" file={video} onFile={onVideo} previewSrc={frame} previewLoading={frameLoading} />
          </div>
        </div>

      {ready ? (
        <div className="mx-auto mt-7 max-w-5xl text-center">
          <p className="text-[12px] text-steel">Files attached. You can run with the recommended defaults or fine-tune below.</p>
          <Button size="lg" disabled={running || enabled.length === 0} onClick={onRun} className="mt-4 min-w-56 rounded-none">
            {running ? <><CircleStop className="size-4 signal-pulse" /> Running {progress}%</> : <><Play className="size-3.5 fill-current" /> Start run</>}
          </Button>

          <section className="mt-8 text-left" aria-labelledby="runtime-heading">
            <button
              type="button"
              onClick={() => setRuntimeOpen((open) => !open)}
              aria-expanded={runtimeOpen}
              aria-controls="runtime-controls"
              className="flex w-full items-center gap-4 border border-border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/20 hover:bg-secondary/40"
            >
              <span className="min-w-0 flex-1">
                <span id="runtime-heading" className="block text-[13px] font-medium">Run settings</span>
                <span className="mt-1 block truncate font-mono text-[9px] text-muted-foreground">{summary}</span>
              </span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">Customize</span>
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${runtimeOpen ? "rotate-180" : ""}`} />
            </button>
            {runtimeOpen && (
              <div id="runtime-controls" className="grid border-x border-b border-border bg-card md:grid-cols-3">
              <div className="border-b border-border p-4 md:border-b-0 md:border-r">
                <RuntimeSelect devices={devices} device={device} disabled={!supportsDeviceSelection} onDevice={onDevice} />
                <p className="mt-2 min-h-8 text-[10px] leading-4 text-muted-foreground">
                  {supportsDeviceSelection ? selectedDevice?.description : "CVFuzz chooses the best available accelerator."}
                </p>
              </div>
              <div className="border-b border-border p-4 md:border-b-0 md:border-r">
                <NumericPreset label="Batch frames" value={batchSize} presets={[1, 2, 4, 8]} min={1} max={64} suffix={batchSize === 1 ? "frame" : "frames"} disabled={false} onChange={onBatchSize} />
              </div>
              <div className="p-4">
                <ImageSizePreset value={imageSize} sourceLabel={sourceLabel} disabled={false} onChange={onImageSize} />
              </div>
              </div>
            )}
          </section>

          <section className="mt-3 text-left" aria-labelledby="augmentations-heading">
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              aria-controls="augmentation-controls"
              className="flex w-full items-center gap-4 border border-border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/20 hover:bg-secondary/40"
            >
              <Sparkles className="size-4 shrink-0 text-signal" />
              <span className="min-w-0 flex-1">
                <span id="augmentations-heading" className="block text-[13px] font-medium">Advanced augmentation tuning</span>
                <span className="mt-1 block font-mono text-[9px] text-muted-foreground">{enabled.length} of {transforms.length} conditions enabled</span>
              </span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">Optional</span>
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </button>
            {advancedOpen && (
              <div id="augmentation-controls" className="mt-3">
                {transforms.length ? (
                  <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {transforms.map((transform) => (
                      <AugmentationCard
                        key={transform.id}
                        transform={transform}
                        frame={frame}
                        frameLoading={frameLoading}
                        onToggle={() => updateTransform(transform.id, (current) => ({ ...current, enabled: !current.enabled }))}
                        onParameter={(name, value) => updateParameter(transform.id, name, value)}
                        onReset={() => resetParameters(transform.id)}
                        resetAvailable={changedTransforms.has(transform.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-border bg-card px-5 py-10 text-center">
                    <SlidersHorizontal className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-3 text-[12px]">Augmentation configuration is unavailable.</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Start the local CVFuzz API, then refresh this page.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {(running || error) && (
            <div role={error ? "alert" : "status"} aria-live="polite" className={`mt-3 border px-4 py-2 text-left font-mono text-[8px] uppercase tracking-[.1em] ${error ? "border-failed/30 bg-failed/5 text-failed" : "border-border bg-card text-muted-foreground"}`}>
              <div className="flex items-center gap-3"><span className="truncate">{error ?? progressLabel}</span><span className="ml-auto">{error ? "Needs attention" : `${progress}%`}</span></div>
            </div>
          )}
        </div>
      ) : (
        <p className="mx-auto mt-7 max-w-xl text-center text-[12px] text-steel">Add a model and source clip to continue. CVFuzz will keep the recommended settings ready for you.</p>
      )}
      </section>
    </motion.div>
  )
}
