import type { Metadata } from "next"
import localFont from "next/font/local"
import { Providers } from "@/components/providers"
import "./globals.css"

const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-Variable.ttf",
  variable: "--font-space-grotesk",
  display: "swap",
  weight: "300 700",
})

const plexMono = localFont({
  src: "./fonts/IBMPlexMono-Regular.ttf",
  variable: "--font-plex-mono",
  display: "swap",
  weight: "400",
})

export const metadata: Metadata = {
  title: "CVFuzz — Failure boundary lab",
  description: "Find the smallest realistic change that destabilizes your computer-vision model.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plexMono.variable} dark h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full"><Providers>{children}</Providers></body>
    </html>
  )
}
