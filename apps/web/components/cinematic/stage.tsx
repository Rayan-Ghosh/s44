"use client"

import * as React from "react"
import dynamic from "next/dynamic"

import { CinematicCursor } from "@/components/cinematic/cursor"
import { Narrative } from "@/components/cinematic/narrative"
import { QrDownloadCard } from "@/components/cinematic/qr-download-card"

/**
 * The landing route's client root.
 *
 * The WebGL stage is loaded with `ssr: false` and only after mount: it touches
 * `document`, `window.devicePixelRatio` and canvas 2D at module scope, none of
 * which exist on the server, and there is nothing about a coin on a black
 * field worth server-rendering.
 *
 * `cinematic-page` on <html> is what scopes app/cinematic.css to this route.
 * It is added on mount and removed on unmount so the product surfaces — which
 * stay light-first per docs/PRODUCT_DIRECTIVES.md §B — never inherit any of it.
 */
const CinematicScene = dynamic(
  () => import("@/components/cinematic/scene").then((m) => m.CinematicScene),
  { ssr: false }
)

export function Stage() {
  React.useEffect(() => {
    const root = document.documentElement
    root.classList.add("cinematic-page")
    // The product's theme toggle stores a preference; this route is a fixed
    // dark composition and must not be re-themed by it.
    root.classList.remove("dark")
    return () => root.classList.remove("cinematic-page")
  }, [])

  return (
    <div className="cinematic">
      <CinematicScene />
      <Narrative />
      <QrDownloadCard />
      <CinematicCursor />
    </div>
  )
}
