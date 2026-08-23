export type AugmentationResult = {
  id: string
  name: string
  shortName: string
  parameter: string
  confidence: number
  confidenceDelta: number
  stability: number
  failures: number
  failureTime: string
  filter?: string
  overlay?: "fog" | "occlusion" | "glare" | "noise" | "compression"
  accent: string
}

export const augmentationResults: AugmentationResult[] = [
  {
    id: "exposure",
    name: "Exposure",
    shortName: "EXP",
    parameter: "-2.0 EV",
    confidence: 72.1,
    confidenceDelta: -19.7,
    stability: 78,
    failures: 8,
    failureTime: "00:08.4",
    filter: "brightness(.52) contrast(1.08)",
    accent: "#ffb454",
  },
  {
    id: "low-light",
    name: "Low light",
    shortName: "LOW",
    parameter: "-2.5 EV · σ 8",
    confidence: 65.4,
    confidenceDelta: -26.4,
    stability: 67,
    failures: 14,
    failureTime: "00:06.9",
    filter: "brightness(.38) saturate(.7) contrast(1.22)",
    overlay: "noise",
    accent: "#9b8cff",
  },
  {
    id: "motion-blur",
    name: "Motion blur",
    shortName: "MBL",
    parameter: "11 px · 45°",
    confidence: 58.7,
    confidenceDelta: -33.1,
    stability: 59,
    failures: 19,
    failureTime: "00:05.2",
    filter: "blur(2.2px) saturate(.92)",
    accent: "#ff6b6b",
  },
  {
    id: "defocus",
    name: "Defocus blur",
    shortName: "DEF",
    parameter: "σ 3.0",
    confidence: 69.8,
    confidenceDelta: -22,
    stability: 73,
    failures: 11,
    failureTime: "00:07.7",
    filter: "blur(1.35px)",
    accent: "#68a4ff",
  },
  {
    id: "jpeg",
    name: "JPEG compression",
    shortName: "JPG",
    parameter: "Q 30",
    confidence: 76.2,
    confidenceDelta: -15.6,
    stability: 82,
    failures: 6,
    failureTime: "00:11.1",
    filter: "contrast(1.04) saturate(.82)",
    overlay: "compression",
    accent: "#f7ca55",
  },
  {
    id: "resolution",
    name: "Resolution",
    shortName: "RES",
    parameter: "0.40×",
    confidence: 61.9,
    confidenceDelta: -29.9,
    stability: 63,
    failures: 16,
    failureTime: "00:06.1",
    filter: "contrast(1.1)",
    overlay: "compression",
    accent: "#fb7fc1",
  },
  {
    id: "fog",
    name: "Fog",
    shortName: "FOG",
    parameter: "0.40 strength",
    confidence: 63.2,
    confidenceDelta: -28.6,
    stability: 65,
    failures: 15,
    failureTime: "00:06.5",
    filter: "contrast(.72) brightness(1.1) saturate(.62)",
    overlay: "fog",
    accent: "#9bd6dc",
  },
  {
    id: "occlusion",
    name: "Partial occlusion",
    shortName: "OCC",
    parameter: "40% · center",
    confidence: 48.3,
    confidenceDelta: -43.5,
    stability: 46,
    failures: 27,
    failureTime: "00:03.8",
    overlay: "occlusion",
    accent: "#ff745e",
  },
  {
    id: "glare",
    name: "Glare",
    shortName: "GLR",
    parameter: "0.60 intensity",
    confidence: 56.8,
    confidenceDelta: -35,
    stability: 55,
    failures: 21,
    failureTime: "00:04.6",
    filter: "contrast(.9) saturate(.84)",
    overlay: "glare",
    accent: "#e9f56b",
  },
]

export const timelineData = [91, 89, 84, 77, 81, 68, 61, 73, 64, 52, 57, 49, 58, 46, 54, 44]

export const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}
