"use client"

import { motion } from "framer-motion"
import { Gauge, ScanSearch, TimerReset, TriangleAlert } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatParameters, formatTime, type RunMetrics, type TransformMetrics } from "@/lib/run-data"

function resultTone(item: TransformMetrics, weakest: string | null) {
  if (item.id === weakest) return "var(--signal)"
  if (item.failures > 0) return "var(--failed)"
  return "var(--stable)"
}

function OverviewChart({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="section-kicker">Baseline object retention</p>
          <h3 className="mt-2 text-[15px] tracking-[-0.02em]">Detections preserved in each transformed stream</h3>
        </div>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">100 = baseline held</span>
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
        {metrics.transforms.map((item, index) => (
          <div key={item.id} className="flex min-w-0 flex-col items-center gap-2">
            <div className="relative flex h-40 w-full max-w-10 items-end overflow-hidden rounded-sm bg-secondary">
              <motion.div
                initial={{ height: 0 }}
                whileInView={{ height: `${item.retention}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: index * 0.035, ease: [0.2, 0.8, 0.2, 1] }}
                className="w-full opacity-90"
                style={{ background: resultTone(item, metrics.weakest_transform) }}
              />
              {[25, 50, 75].map((mark) => <i key={mark} className="absolute inset-x-0 h-px bg-white/5" style={{ bottom: `${mark}%` }} />)}
            </div>
            <span className="max-w-full truncate font-mono text-[7.5px] uppercase tracking-[0.08em] text-muted-foreground">{item.id.slice(0, 4)}</span>
            <span className="num text-[9px]">{item.retention}%</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-4 border-t border-border pt-4 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
        <span className="flex items-center gap-2"><i className="size-1.5 rounded-full bg-stable" /> Stable in range</span>
        <span className="flex items-center gap-2"><i className="size-1.5 bg-failed" /> Boundary crossed</span>
        <span className="flex items-center gap-2"><i className="size-1.5 rotate-45 bg-signal" /> Weakest stream</span>
      </div>
    </div>
  )
}

function FailureTable({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="min-w-[660px]">
        <div className="grid grid-cols-[1.15fr_1fr_.55fr_.45fr] border-b border-border bg-secondary/70 px-4 py-2.5 font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground md:px-5">
          <span>Condition</span><span>Parameters</span><span>First event</span><span>Events</span>
        </div>
        {metrics.transforms.map((item) => (
          <div key={item.id} className="grid grid-cols-[1.15fr_1fr_.55fr_.45fr] items-center border-b border-border/70 px-4 py-3 text-xs last:border-0 md:px-5">
            <span className="flex min-w-0 items-center gap-2.5">
              <i className={`size-1.5 shrink-0 ${item.failures ? "bg-failed" : "rounded-full bg-stable"}`} />
              <span className="truncate font-medium">{item.name}</span>
            </span>
            <span className="truncate pr-4 font-mono text-[8.5px] text-muted-foreground">{formatParameters(item.parameters)}</span>
            <span className="num text-[9px] text-muted-foreground">{formatTime(item.first_failure_seconds)}</span>
            <span className={`num text-[10px] ${item.failures ? "text-failed" : "text-stable"}`}>{item.failures}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TimelineChart({ metrics }: { metrics: RunMetrics }) {
  const stream = metrics.transforms.find((item) => item.id === metrics.weakest_transform) ?? metrics.transforms[0]
  if (!stream || stream.timeline.length < 2) {
    return <div className="rounded-lg border border-border bg-card p-8 text-xs text-muted-foreground">No timeline evidence is available for this run.</div>
  }
  const width = 920
  const height = 250
  const points = stream.timeline
    .map((point, index) => `${(index / (stream.timeline.length - 1)) * width},${height - (point.retention / 100) * height}`)
    .join(" ")
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div><p className="section-kicker">Weakest stream / {stream.name}</p><h3 className="mt-2 text-[15px] tracking-[-0.02em]">Detection retention over the full video</h3></div>
        <span className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-failed"><i className="size-1.5 bg-failed" /> {stream.failures} failure events</span>
      </div>
      <div className="relative overflow-hidden rounded-md border border-border bg-background p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible" role="img" aria-label={`${stream.name} object retention timeline`}>
          {[0, 1, 2, 3, 4].map((line) => (
            <line key={line} x1="0" x2={width} y1={(height / 4) * line} y2={(height / 4) * line} stroke="rgba(255,255,255,.06)" strokeWidth="1" />
          ))}
          <line x1="0" x2={width} y1="1" y2="1" stroke="var(--queued)" strokeDasharray="3 5" strokeWidth="1" />
          <polyline points={points} fill="none" stroke="var(--signal)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
          {stream.timeline.map((point, index) => (
            <circle key={point.frame} cx={(index / (stream.timeline.length - 1)) * width} cy={height - (point.retention / 100) * height} r={point.failures ? 5 : 2.25} fill={point.failures ? "var(--failed)" : "var(--signal)"} />
          ))}
        </svg>
        <div className="mt-2 flex justify-between font-mono text-[8px] text-muted-foreground"><span>00:00</span><span>{formatTime(metrics.video_duration_seconds / 2)}</span><span>{formatTime(metrics.video_duration_seconds)}</span></div>
      </div>
    </div>
  )
}

export function MetricsPanel({ metrics }: { metrics: RunMetrics }) {
  const cards = [
    { label: "Baseline confidence", value: `${metrics.baseline.mean_confidence}%`, detail: `${metrics.baseline.detections} detections`, icon: Gauge, tone: "text-foreground" },
    { label: "Robustness score", value: metrics.robustness_score.toFixed(1), detail: "mean object retention", icon: ScanSearch, tone: "text-degraded" },
    { label: "Failure events", value: String(metrics.total_failures), detail: `${metrics.transforms.length} transformed streams`, icon: TriangleAlert, tone: metrics.total_failures ? "text-failed" : "text-stable" },
    { label: "Frames evaluated", value: String(metrics.frames_analyzed), detail: `${metrics.fps} FPS · ${formatTime(metrics.video_duration_seconds)}`, icon: TimerReset, tone: "text-steel" },
  ]

  return (
    <section id="metrics" className="border-t border-border py-10 md:py-14">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="section-kicker">02 / Evaluation record</p><h2 className="mt-2 text-2xl tracking-[-0.04em]">Measured frame by frame</h2></div>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">Observed detector outputs are separated from interpretation. Use the model, source, parameters, and saved artifacts above to reproduce the result.</p>
      </div>
      <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        {cards.map((metric, index) => (
          <div key={metric.label} className={`bg-card p-4 ${index % 2 === 1 ? "border-l border-border" : ""} ${index > 1 ? "border-t border-border" : ""} ${index > 0 ? "lg:border-l" : ""} lg:border-t-0`}>
            <metric.icon className={`size-3.5 ${metric.tone}`} />
            <p className="metric-label mt-6">{metric.label}</p>
            <p className={`num mt-1 text-2xl tracking-[-0.04em] ${metric.tone}`}>{metric.value}</p>
            <p className="mt-1.5 text-[10px] text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </div>
      <Tabs defaultValue="overview" className="gap-5">
        <TabsList variant="line" className="h-9 gap-6 border-b border-border px-0">
          <TabsTrigger value="overview" className="px-0 text-[11.5px]">Overview</TabsTrigger>
          <TabsTrigger value="failures" className="px-0 text-[11.5px]">Failure log</TabsTrigger>
          <TabsTrigger value="timeline" className="px-0 text-[11.5px]">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewChart metrics={metrics} /></TabsContent>
        <TabsContent value="failures"><FailureTable metrics={metrics} /></TabsContent>
        <TabsContent value="timeline"><TimelineChart metrics={metrics} /></TabsContent>
      </Tabs>
    </section>
  )
}
