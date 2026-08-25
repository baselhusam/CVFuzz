"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Search } from "lucide-react"
import {
  formatParameters,
  formatTime,
  type RunMetrics,
  type TimelinePoint,
  type TransformMetrics,
} from "@/lib/run-data"

const SERIES_COLORS = ["#5fd08a", "#69b9ff", "#f0ae52", "#f06977", "#cf8cff", "#52d0bd", "#ff9272", "#a2b9e8", "#d7fa03"]

type ChartKind = "retention" | "failures"
type SortKey = "name" | "retention" | "confidence_delta" | "failures" | "affected_frames" | "mean_inference_ms"
type Severity = "all" | "weakest" | "boundary" | "stable"

const humanize = (value: string) => value.replaceAll("_", " ")

function seriesPoint(item: TransformMetrics, index: number, count: number): TimelinePoint | undefined {
  if (!item.timeline.length) return undefined
  if (count <= 1) return item.timeline[0]
  return item.timeline[Math.round((index / (count - 1)) * (item.timeline.length - 1))]
}

function seriesTone(item: TransformMetrics, weakest: string | null) {
  if (item.id === weakest) return "var(--signal)"
  if (item.failures) return "var(--failed)"
  return "var(--stable)"
}

function MetricChart({ kind, metrics, visibleIds, hoverIndex, onHover }: { kind: ChartKind; metrics: RunMetrics; visibleIds: Set<string>; hoverIndex: number | null; onHover: (index: number | null) => void }) {
  const items = metrics.transforms.filter((item) => visibleIds.has(item.id) && item.timeline.length)
  const samples = Math.max(0, ...items.map((item) => item.timeline.length))
  const width = 1000
  const height = kind === "retention" ? 270 : 148
  const left = 48
  const right = 12
  const top = 14
  const bottom = 30
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const maxFailures = Math.max(1, ...items.flatMap((item) => item.timeline.map((point) => point.failures)))
  const maxValue = kind === "retention" ? 100 : maxFailures
  const valueAt = (item: TransformMetrics, index: number) => {
    const point = seriesPoint(item, index, samples)
    return point ? (kind === "retention" ? point.retention : point.failures) : 0
  }
  const pointX = (index: number) => left + (samples <= 1 ? 0 : (index / (samples - 1)) * chartWidth)
  const pointY = (value: number) => top + chartHeight - (value / maxValue) * chartHeight
  const line = (item: TransformMetrics) => Array.from({ length: samples }, (_, index) => `${pointX(index)},${pointY(valueAt(item, index))}`).join(" ")
  const area = (item: TransformMetrics) => `${line(item)} ${pointX(samples - 1)},${height - bottom} ${pointX(0)},${height - bottom}`
  const yLabels = kind === "retention" ? [100, 75, 50, 25, 0] : [maxValue, Math.round(maxValue * .75), Math.round(maxValue * .5), Math.round(maxValue * .25), 0]
  const hoverTime = hoverIndex == null ? null : seriesPoint(items[0] || metrics.transforms[0], hoverIndex, samples)?.timestamp_seconds
  const focus = items.find((item) => item.id === metrics.weakest_transform) || items[0]
  const chartId = `metric-${kind}`

  if (!items.length || samples < 2) return <div className="flex h-52 items-center justify-center border border-dashed border-border bg-card px-5 text-center font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">No sampled timeline evidence is available for this run.</div>

  return (
    <div className="overflow-hidden border border-[#24303b] bg-[#070b10] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
      <div className="relative cursor-crosshair px-2 pt-2 sm:px-4" onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left - (left / width) * bounds.width) / ((chartWidth / width) * bounds.width)))
        onHover(Math.round(ratio * (samples - 1)))
      }} onMouseLeave={() => onHover(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={kind === "retention" ? "Detection retention over the stream" : "Failure events per sampled frame"}>
          <defs>
            <linearGradient id={`${chartId}-canvas`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#111a23" /><stop offset=".55" stopColor="#080d13" /><stop offset="1" stopColor="#06090d" /></linearGradient>
            <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={SERIES_COLORS[metrics.transforms.indexOf(focus) % SERIES_COLORS.length]} stopOpacity=".25" /><stop offset="1" stopColor={SERIES_COLORS[metrics.transforms.indexOf(focus) % SERIES_COLORS.length]} stopOpacity="0" /></linearGradient>
            <filter id={`${chartId}-glow`} x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="2.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <rect x={left} y={top} width={chartWidth} height={chartHeight} fill={`url(#${chartId}-canvas)`} />
          {[.25, .5, .75].map((ratio) => <line key={ratio} x1={left + ratio * chartWidth} x2={left + ratio * chartWidth} y1={top} y2={height - bottom} stroke="#1d2a35" strokeWidth="1" strokeDasharray="2 7" />)}
          {yLabels.map((label) => {
            const y = pointY(label)
            return <g key={label}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#23313d" strokeWidth="1" /><text x={left - 9} y={y + 3} textAnchor="end" fill="#71808d" fontFamily="var(--font-plex-mono)" fontSize="10">{kind === "retention" ? `${label}%` : label}</text></g>
          })}
          <polygon points={area(focus)} fill={`url(#${chartId}-area)`} />
          {items.map((item) => <polyline key={item.id} points={line(item)} fill="none" stroke={SERIES_COLORS[metrics.transforms.indexOf(item) % SERIES_COLORS.length]} strokeWidth={item === focus ? "2.25" : "1.3"} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={item === focus ? "1" : ".5"} filter={item === focus ? `url(#${chartId}-glow)` : undefined} />)}
          {hoverIndex != null && <><line x1={pointX(hoverIndex)} x2={pointX(hoverIndex)} y1={top} y2={height - bottom} stroke="#e9f1f5" strokeWidth="1" strokeDasharray="3 4" opacity=".7" />{items.map((item) => <circle key={item.id} cx={pointX(hoverIndex)} cy={pointY(valueAt(item, hoverIndex))} r={item === focus ? "4" : "2.6"} fill={SERIES_COLORS[metrics.transforms.indexOf(item) % SERIES_COLORS.length]} stroke="#070b10" strokeWidth="1.5" />)}</>}
          {[0, .25, .5, .75, 1].map((ratio) => <text key={ratio} x={left + ratio * chartWidth} y={height - 7} textAnchor="middle" fill="#71808d" fontFamily="var(--font-plex-mono)" fontSize="10">{formatTime(metrics.video_duration_seconds * ratio)}</text>)}
        </svg>
      </div>
      <div className="border-t border-[#24303b] bg-[#0a1016] px-4 py-3 font-mono text-[8.5px] leading-5">
        <div className="mb-1.5 flex items-center justify-between gap-3"><span className="uppercase tracking-[.12em] text-[#81909c]">{hoverIndex == null ? "Stream totals" : `Sample ${formatTime(hoverTime)}`}</span><span className="hidden uppercase tracking-[.1em] text-[#5f6d78] sm:block">{hoverIndex == null ? "Hover to inspect one frame" : "Live readout"}</span></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">{items.map((item) => {
          const point = hoverIndex == null ? undefined : seriesPoint(item, hoverIndex, samples)
          const value = kind === "retention" ? `${point?.retention ?? item.retention}%` : `${point?.failures ?? item.failures} events`
          return <span key={item.id} className="flex items-center gap-1.5"><i className="size-1.5" style={{ background: SERIES_COLORS[metrics.transforms.indexOf(item) % SERIES_COLORS.length] }} /><span className="text-[#a7b2ba]">{item.name}</span><span className="text-[#eef3f5]">{value}</span></span>
        })}</div>
      </div>
    </div>
  )
}

function DetailTable({ metrics }: { metrics: RunMetrics }) {
  const [query, setQuery] = useState("")
  const [severity, setSeverity] = useState<Severity>("all")
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "retention", direction: "asc" })
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return metrics.transforms.filter((item) => {
      const matchesQuery = !normalized || `${item.name} ${formatParameters(item.parameters)}`.toLowerCase().includes(normalized)
      const matchesSeverity = severity === "all" || (severity === "weakest" && item.id === metrics.weakest_transform) || (severity === "boundary" && item.failures > 0 && item.id !== metrics.weakest_transform) || (severity === "stable" && item.failures === 0)
      return matchesQuery && matchesSeverity
    }).sort((left, right) => {
      const leftValue = sort.key === "name" ? left.name : left[sort.key]
      const rightValue = sort.key === "name" ? right.name : right[sort.key]
      const comparison = typeof leftValue === "string" && typeof rightValue === "string" ? leftValue.localeCompare(rightValue) : Number(leftValue) - Number(rightValue)
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [metrics.transforms, metrics.weakest_transform, query, severity, sort])
  const changeSort = (key: SortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" ? "asc" : "desc" })
  const arrow = (key: SortKey) => sort.key === key ? (sort.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null
  const dominantKind = (item: TransformMetrics) => Object.entries(item.failures_by_kind).sort(([, left], [, right]) => right - left)[0]

  return (
    <section className="overflow-hidden border border-border bg-card" aria-labelledby="transform-detail-heading">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5 lg:flex-row lg:items-center"><div className="min-w-0 lg:mr-auto"><h3 id="transform-detail-heading" className="text-[15px] tracking-[-.02em]">Per-transform detail</h3><p className="mt-1 text-[10px] text-muted-foreground">Sort, filter, and compare every tested condition.</p></div><label className="flex h-9 min-w-44 items-center gap-2 border border-input bg-background px-3 text-muted-foreground lg:max-w-60"><Search className="size-3.5" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter conditions" className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground" /></label><div className="flex flex-wrap gap-1.5">{(["all", "weakest", "boundary", "stable"] as Severity[]).map((item) => <button key={item} type="button" onClick={() => setSeverity(item)} className={`border px-2.5 py-2 font-mono text-[8px] uppercase tracking-[.09em] transition-colors ${severity === item ? "border-signal bg-signal text-ink" : "border-input text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}>{item}</button>)}</div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1010px] border-collapse text-left"><thead className="border-b border-border bg-secondary/50 font-mono text-[8px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-4 py-3 font-normal sm:px-5"><button type="button" onClick={() => changeSort("name")} className="flex items-center gap-1 hover:text-foreground">Condition {arrow("name")}</button></th><th className="px-4 py-3 font-normal">Parameters</th><th className="px-4 py-3 font-normal"><button type="button" onClick={() => changeSort("retention")} className="flex items-center gap-1 hover:text-foreground">Retention {arrow("retention")}</button></th><th className="px-4 py-3 font-normal"><button type="button" onClick={() => changeSort("confidence_delta")} className="flex items-center gap-1 hover:text-foreground">Δ confidence {arrow("confidence_delta")}</button></th><th className="px-4 py-3 font-normal"><button type="button" onClick={() => changeSort("failures")} className="flex items-center gap-1 hover:text-foreground">Events {arrow("failures")}</button></th><th className="px-4 py-3 font-normal"><button type="button" onClick={() => changeSort("affected_frames")} className="flex items-center gap-1 hover:text-foreground">Affected {arrow("affected_frames")}</button></th><th className="px-4 py-3 font-normal">First change</th><th className="px-4 py-3 font-normal"><button type="button" onClick={() => changeSort("mean_inference_ms")} className="flex items-center gap-1 hover:text-foreground">Inference {arrow("mean_inference_ms")}</button></th><th className="px-4 py-3 font-normal">Failure mix</th></tr></thead><tbody>{rows.map((item) => {
        const dominant = dominantKind(item)
        const tone = seriesTone(item, metrics.weakest_transform)
        return <tr key={item.id} className="border-b border-border/70 last:border-0 hover:bg-secondary/25"><th scope="row" className="px-4 py-3.5 text-left font-normal sm:px-5"><span className="flex items-center gap-2.5"><i className="size-2 shrink-0" style={{ background: tone }} /><span className="font-medium">{item.name}</span>{item.id === metrics.weakest_transform && <span className="font-mono text-[7px] uppercase tracking-[.09em] text-signal">Weakest</span>}</span></th><td className="max-w-56 truncate px-4 py-3.5 font-mono text-[8.5px] text-muted-foreground">{formatParameters(item.parameters)}</td><td className="px-4 py-3.5"><span className="flex min-w-28 items-center gap-2"><i className="h-1 min-w-8 flex-1 bg-secondary"><i className="block h-full" style={{ width: `${item.retention}%`, background: tone }} /></i><span className="num text-[10px]" style={{ color: tone }}>{item.retention}%</span></span></td><td className={`num px-4 py-3.5 text-[10px] ${item.confidence_delta < 0 ? "text-failed" : "text-stable"}`}>{item.confidence_delta > 0 ? "+" : ""}{item.confidence_delta}%</td><td className={`num px-4 py-3.5 text-[10px] ${item.failures ? "text-failed" : "text-stable"}`}>{item.failures}</td><td className="num px-4 py-3.5 text-[10px] text-muted-foreground">{item.affected_frames} / {metrics.frames_analyzed}</td><td className="num px-4 py-3.5 text-[10px] text-muted-foreground">{formatTime(item.first_failure_seconds)}</td><td className="num px-4 py-3.5 text-[10px] text-muted-foreground">{item.mean_inference_ms} ms</td><td className="px-4 py-3.5 font-mono text-[8.5px] text-muted-foreground">{dominant ? `${humanize(dominant[0])} · ${dominant[1]}` : "—"}</td></tr>
      })}</tbody></table></div>
      {!rows.length && <p className="px-5 py-10 text-center text-[11px] text-muted-foreground">No conditions match the current filter.</p>}
    </section>
  )
}

export function MetricsPanel({ metrics }: { metrics: RunMetrics }) {
  const [visibleIds, setVisibleIds] = useState(() => new Set(metrics.transforms.map((item) => item.id)))
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const failureKinds = Object.entries(metrics.failure_events_by_kind || metrics.transforms.reduce<Record<string, number>>((total, item) => {
    for (const [kind, count] of Object.entries(item.failures_by_kind)) total[kind] = (total[kind] || 0) + count
    return total
  }, {}))
  const sampleNote = metrics.timeline_sample_every_n_frames ? `sampled every ${metrics.timeline_sample_every_n_frames} frames` : "sampled across the full stream"
  const toggleSeries = (id: string) => setVisibleIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <section id="metrics" className="mb-10 border-t border-border pt-8 md:mb-14 md:pt-10" aria-labelledby="metrics-heading">
      <header className="mb-5 flex flex-col justify-between gap-2 border-b border-border pb-3 sm:flex-row sm:items-end"><div><p className="section-kicker">Run analysis</p><h2 id="metrics-heading" className="mt-2 text-xl tracking-[-.03em]">Metrics</h2></div><p className="font-mono text-[8.5px] uppercase tracking-[.12em] text-muted-foreground">{metrics.transforms.length} streams · {sampleNote}</p></header>
      <section className="mb-4 border border-border bg-card p-4 sm:p-5" aria-labelledby="retention-heading"><div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-start"><div><h3 id="retention-heading" className="text-[15px] tracking-[-.02em]">Detection retention over the stream</h3><p className="mt-1 font-mono text-[8.5px] uppercase tracking-[.1em] text-muted-foreground">Share of baseline objects still detected · {sampleNote}</p></div><div className="flex flex-wrap gap-1.5 xl:max-w-[650px] xl:justify-end">{metrics.transforms.map((item, index) => <button key={item.id} type="button" onClick={() => toggleSeries(item.id)} className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[.06em] transition-colors ${visibleIds.has(item.id) ? "border-input bg-background text-foreground" : "border-transparent bg-secondary text-muted-foreground line-through"}`}><i className="size-1.5" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{item.name}</button>)}</div></div><MetricChart kind="retention" metrics={metrics} visibleIds={visibleIds} hoverIndex={hoverIndex} onHover={setHoverIndex} /></section>
      <section className="mb-4 border border-border bg-card p-4 sm:p-5" aria-labelledby="failure-chart-heading"><div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline"><div><h3 id="failure-chart-heading" className="text-[15px] tracking-[-.02em]">Failure events per sampled frame</h3><p className="mt-1 text-[10px] text-muted-foreground">{failureKinds.length ? failureKinds.map(([kind]) => humanize(kind)).join(" · ") : "No failure events recorded"}</p></div><span className="font-mono text-[8px] uppercase tracking-[.1em] text-muted-foreground">{metrics.total_failures} total events</span></div><MetricChart kind="failures" metrics={metrics} visibleIds={visibleIds} hoverIndex={hoverIndex} onHover={setHoverIndex} /></section>
      <DetailTable metrics={metrics} />
    </section>
  )
}
