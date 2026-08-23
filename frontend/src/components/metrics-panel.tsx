"use client"

import { motion } from "framer-motion"
import { Gauge, ScanSearch, TimerReset, TriangleAlert } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  formatParameters,
  formatTime,
  transformAccent,
  type RunMetrics,
} from "@/lib/run-data"

function OverviewChart({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="border border-border bg-card p-5 md:p-6">
      <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
            BASELINE OBJECT RETENTION
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
            How many original detections survive each stream
          </h3>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">
          100 = NO FAILURES
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-9">
        {metrics.transforms.map((item, index) => (
          <div key={item.id} className="flex min-w-0 flex-col items-center gap-2">
            <div className="relative flex h-44 w-full max-w-12 items-end overflow-hidden bg-muted/70">
              <motion.div
                initial={{ height: 0 }}
                whileInView={{ height: `${item.retention}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.65, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="w-full"
                style={{ background: transformAccent(index) }}
              />
            </div>
            <span className="font-mono text-[8px] text-muted-foreground">
              {item.id.slice(0, 3).toUpperCase()}
            </span>
            <span className="font-mono text-[9px] font-semibold">{item.retention}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FailureTable({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="overflow-hidden border border-border bg-card">
      <div className="grid grid-cols-[1fr_.8fr_.55fr_.55fr] border-b border-border bg-muted/35 px-4 py-3 font-mono text-[9px] tracking-[0.12em] text-muted-foreground md:px-6">
        <span>TECHNIQUE</span>
        <span>PARAMETERS</span>
        <span>FIRST FAIL</span>
        <span>EVENTS</span>
      </div>
      {metrics.transforms.map((item, index) => (
        <div
          key={item.id}
          className="grid grid-cols-[1fr_.8fr_.55fr_.55fr] items-center border-b border-border/70 px-4 py-4 text-xs last:border-0 md:px-6 md:text-sm"
        >
          <span className="flex min-w-0 items-center gap-2.5 font-medium">
            <i className="size-2 shrink-0" style={{ background: transformAccent(index) }} />
            <span className="truncate">{item.name}</span>
          </span>
          <span className="truncate pr-4 font-mono text-[9px] text-muted-foreground">
            {formatParameters(item.parameters)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatTime(item.first_failure_seconds)}
          </span>
          <span className="font-mono text-[11px]">{item.failures}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineChart({ metrics }: { metrics: RunMetrics }) {
  const stream =
    metrics.transforms.find((item) => item.id === metrics.weakest_transform) ??
    metrics.transforms[0]
  if (!stream || stream.timeline.length < 2) {
    return <div className="border border-border bg-card p-8 text-sm text-muted-foreground">No timeline data.</div>
  }
  const width = 920
  const height = 250
  const points = stream.timeline
    .map(
      (point, index) =>
        `${(index / (stream.timeline.length - 1)) * width},${height - (point.retention / 100) * height}`,
    )
    .join(" ")
  return (
    <div className="border border-border bg-card p-5 md:p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
            WEAKEST STREAM · {stream.name.toUpperCase()}
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
            Detection retention over the full video
          </h3>
        </div>
        <span className="font-mono text-[10px] text-alert">● {stream.failures} FAILURES</span>
      </div>
      <div className="relative overflow-hidden bg-muted/30 p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full overflow-visible"
          role="img"
          aria-label={`${stream.name} object retention timeline`}
        >
          {[0, 1, 2, 3, 4].map((line) => (
            <line
              key={line}
              x1="0"
              x2={width}
              y1={(height / 4) * line}
              y2={(height / 4) * line}
              className="stroke-border"
              strokeWidth="1"
            />
          ))}
          <polyline
            points={points}
            fill="none"
            stroke="var(--signal)"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
          {stream.timeline.map((point, index) => (
            <circle
              key={point.frame}
              cx={(index / (stream.timeline.length - 1)) * width}
              cy={height - (point.retention / 100) * height}
              r={point.failures ? 5 : 2.5}
              fill={point.failures ? "var(--alert)" : "var(--signal)"}
            />
          ))}
        </svg>
        <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>00:00</span>
          <span>{formatTime(metrics.video_duration_seconds / 2)}</span>
          <span>{formatTime(metrics.video_duration_seconds)}</span>
        </div>
      </div>
    </div>
  )
}

export function MetricsPanel({ metrics }: { metrics: RunMetrics }) {
  const cards = [
    {
      label: "Baseline confidence",
      value: `${metrics.baseline.mean_confidence}%`,
      detail: `${metrics.baseline.detections} detections`,
      icon: Gauge,
      tone: "text-signal",
    },
    {
      label: "Robustness score",
      value: metrics.robustness_score.toFixed(1),
      detail: "mean object retention",
      icon: ScanSearch,
      tone: "text-amber-500",
    },
    {
      label: "Failure events",
      value: String(metrics.total_failures),
      detail: `${metrics.transforms.length} transformed streams`,
      icon: TriangleAlert,
      tone: "text-alert",
    },
    {
      label: "Frames evaluated",
      value: String(metrics.frames_analyzed),
      detail: `${metrics.fps} FPS · ${formatTime(metrics.video_duration_seconds)}`,
      icon: TimerReset,
      tone: "text-sky-500",
    },
  ]

  return (
    <section id="metrics" className="border-t border-border py-14 md:py-20">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="section-kicker">03 / EVALUATION</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] md:text-4xl">
            Measured, frame by frame.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          These values come from the detector outputs stored for this run. No sample metrics or
          browser effects are used.
        </p>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
        {cards.map((metric) => (
          <div key={metric.label} className="bg-card p-4 md:p-5">
            <metric.icon className={`size-4 ${metric.tone}`} />
            <p className="mt-8 font-mono text-[9px] tracking-[0.11em] text-muted-foreground">
              {metric.label.toUpperCase()}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] md:text-3xl">
              {metric.value}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </div>
      <Tabs defaultValue="overview" className="gap-5">
        <TabsList variant="line" className="h-10 gap-6 border-b border-border px-0">
          <TabsTrigger value="overview" className="px-0 text-xs">Overview</TabsTrigger>
          <TabsTrigger value="failures" className="px-0 text-xs">Failures</TabsTrigger>
          <TabsTrigger value="timeline" className="px-0 text-xs">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewChart metrics={metrics} /></TabsContent>
        <TabsContent value="failures"><FailureTable metrics={metrics} /></TabsContent>
        <TabsContent value="timeline"><TimelineChart metrics={metrics} /></TabsContent>
      </Tabs>
    </section>
  )
}
