"use client"

import { motion } from "framer-motion"
import { ArrowDownRight, Gauge, ScanSearch, TimerReset, TriangleAlert } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { augmentationResults, timelineData } from "@/lib/run-data"

const metrics = [
  { label: "Baseline confidence", value: "91.8%", detail: "mean across 184 frames", icon: Gauge, tone: "text-signal" },
  { label: "Robustness score", value: "64.9", detail: "−12.4 vs. target", icon: ScanSearch, tone: "text-amber-500" },
  { label: "Failure events", value: "137", detail: "4 distinct failure types", icon: TriangleAlert, tone: "text-alert" },
  { label: "Inference time", value: "18.4ms", detail: "+3.1ms transformed", icon: TimerReset, tone: "text-sky-500" },
]

function OverviewChart() {
  return (
    <div className="border border-border bg-card p-5 md:p-6">
      <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">CONFIDENCE RETENTION</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">How each technique changes detection</h3>
        </div>
        <div className="flex gap-4 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2"><i className="size-2 bg-foreground" /> RETAINED</span>
          <span className="flex items-center gap-2"><i className="size-2 bg-alert" /> LOST</span>
        </div>
      </div>
      <div className="grid grid-cols-9 gap-2 sm:gap-3">
        {augmentationResults.map((item, index) => (
          <div key={item.id} className="flex min-w-0 flex-col items-center gap-2">
            <div className="relative flex h-44 w-full max-w-11 items-end overflow-hidden bg-muted/70">
              <motion.div
                initial={{ height: 0 }}
                whileInView={{ height: `${item.confidence}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.65, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="w-full bg-foreground"
              />
              <div className="absolute inset-x-0 top-[8.2%] border-t border-dashed border-signal/60" />
            </div>
            <span className="font-mono text-[9px] text-muted-foreground">{item.shortName}</span>
            <span className="hidden font-mono text-[9px] font-semibold sm:block">{item.confidence}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FailureTable() {
  return (
    <div className="overflow-hidden border border-border bg-card">
      <div className="grid grid-cols-[1fr_.75fr_.6fr_.55fr] border-b border-border bg-muted/35 px-4 py-3 font-mono text-[9px] tracking-[0.12em] text-muted-foreground md:px-6">
        <span>TECHNIQUE</span><span>FIRST FAILURE</span><span>EVENTS</span><span>DELTA</span>
      </div>
      {augmentationResults.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_.75fr_.6fr_.55fr] items-center border-b border-border/70 px-4 py-4 text-xs last:border-0 md:px-6 md:text-sm">
          <span className="flex min-w-0 items-center gap-2.5 font-medium"><i className="size-2 shrink-0" style={{ background: item.accent }} /><span className="truncate">{item.name}</span></span>
          <span className="font-mono text-[10px] text-muted-foreground">{item.failureTime}</span>
          <span className="font-mono text-[11px]">{item.failures}</span>
          <span className="font-mono text-[10px] text-alert">{item.confidenceDelta}%</span>
        </div>
      ))}
    </div>
  )
}

function TimelineChart() {
  const width = 920
  const height = 260
  const points = timelineData.map((value, index) => `${(index / (timelineData.length - 1)) * width},${height - (value / 100) * height}`).join(" ")
  return (
    <div className="border border-border bg-card p-5 md:p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">FULL-STREAM ANALYSIS</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Detection stability over time</h3>
        </div>
        <span className="font-mono text-[10px] text-alert">● 12 FAILURE WINDOWS</span>
      </div>
      <div className="relative overflow-hidden bg-muted/30 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible" role="img" aria-label="Detection stability timeline">
          {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="0" x2={width} y1={(height / 4) * line} y2={(height / 4) * line} className="stroke-border" strokeWidth="1" />)}
          <polyline points={points} fill="none" stroke="var(--signal)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          {timelineData.map((value, index) => (
            <circle key={index} cx={(index / (timelineData.length - 1)) * width} cy={height - (value / 100) * height} r={value < 55 ? 6 : 3} fill={value < 55 ? "var(--alert)" : "var(--signal)"} />
          ))}
        </svg>
        <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground"><span>00:00</span><span>00:12</span><span>00:24</span><span>00:36</span><span>00:48</span></div>
      </div>
    </div>
  )
}

export function MetricsPanel() {
  return (
    <section id="metrics" className="border-t border-border py-14 md:py-20">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="section-kicker">03 / EVALUATION</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] md:text-4xl">The numbers behind the wall.</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">Every metric is computed over the full stream—not hand-picked frames—so you see where performance bends and where it breaks.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-card p-4 md:p-5">
            <div className="flex items-center justify-between">
              <metric.icon className={`size-4 ${metric.tone}`} />
              <ArrowDownRight className="size-3.5 text-muted-foreground" />
            </div>
            <p className="mt-8 font-mono text-[9px] tracking-[0.11em] text-muted-foreground">{metric.label.toUpperCase()}</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] md:text-3xl">{metric.value}</p>
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
        <TabsContent value="overview"><OverviewChart /></TabsContent>
        <TabsContent value="failures"><FailureTable /></TabsContent>
        <TabsContent value="timeline"><TimelineChart /></TabsContent>
      </Tabs>
    </section>
  )
}
