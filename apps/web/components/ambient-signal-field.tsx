"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Ambient signal field — Canvas 2D hero background.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ THIS IS A PLACEHOLDER VISUAL. IT IS NOT REAL DATA.
 *
 * The drifting nodes and proximity links are pure ambience. They are NOT
 * derived from live detector output, audio analysis, or any transaction
 * signal, and nothing here should ever be captioned or labelled as if they
 * were. `docs/UX_PRINCIPLES.md` lists "fake AI features" as an explicit
 * anti-pattern: an AI-looking element must be backed by a real
 * implementation or clearly marked as a placeholder. This is the marking.
 *
 * When real data arrives, the wiring point is `readPalette()` plus the
 * `nodes` seeding in `buildScene()` — a node's radius/alpha can be driven by
 * a detector's ComponentScore, and a link's opacity by fusion coupling.
 * Until that exists, the motion is deliberately meaningless.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Design rationale (see docs/DESIGN_RESEARCH.md §6):
 * an ambient node field reads as "a system is quietly watching" without a
 * video file and without WebGL. Restraint is the whole point — our motion
 * tokens are short and decelerating, and "animation everywhere" is a listed
 * anti-pattern, so this drifts slowly at low contrast and stays strictly
 * behind content.
 *
 * Behaviour:
 *  - THEME-AWARE: colours are read from CSS custom properties at runtime and
 *    re-read when the theme class changes, so it re-themes on toggle with no
 *    hardcoded hex anywhere in this file.
 *  - REDUCED MOTION: no animation at all. Falls back to a static gradient
 *    built from surface tokens.
 *  - OFFSCREEN: paused via IntersectionObserver — a background nobody can
 *    see should not hold the main thread.
 *  - Also pauses when the tab is hidden.
 */

/** Tokens the field samples. All must already exist in tokens.css. */
const PALETTE_TOKENS = [
  "--detector-transaction",
  "--detector-behaviour",
  "--detector-voice",
  "--info",
] as const

/**
 * India accent nodes — deliberately SPARSE.
 *
 * docs/PRODUCT_DIRECTIVES.md §A: Indian identity is subtle, premium and
 * purposeful, never a tricolour theme. These three tokens colour only
 * `indiaAccentRatio` of the field (1 node in 9), so they register as an
 * occasional warm note rather than a palette. If a viewer can name "the
 * tricolour" from the background, this ratio is wrong.
 */
const INDIA_ACCENT_TOKENS = [
  "--accent-india-saffron",
  "--accent-india-green",
  "--accent-india-blue",
] as const

const SURFACE_TOKENS = ["--background", "--surface", "--surface-sunken"] as const

type Palette = {
  nodes: string[]
  /** Sparse India-accent colours; see INDIA_ACCENT_TOKENS. */
  accents: string[]
  link: string
  /** Node radius range for the ACTIVE theme, applied at draw time. */
  radius: readonly [number, number]
  surfaces: string[]
}

type Node = {
  x: number
  y: number
  vx: number
  vy: number
  /**
   * Normalised size in [0,1], resolved against the active theme's radius range
   * at draw time. Storing the ratio rather than a pixel radius means a theme
   * toggle rescales nodes smoothly instead of forcing a scene rebuild, which
   * would teleport every node to a new random position mid-view.
   */
  radiusT: number
  colorIndex: number
  /** True → drawn from `palette.accents` rather than `palette.nodes`. */
  accent: boolean
  /** Phase offset so nodes breathe out of sync rather than pulsing as one. */
  phase: number
}

/** Tuning. Deliberately low-energy; see the restraint note above. */
const CONFIG = {
  /** Nodes per million device-independent pixels — density scales with area
   *  instead of being a fixed count that looks sparse on desktop and
   *  cluttered on mobile. */
  densityPerMegapixel: 46,
  maxNodes: 90,
  minNodes: 18,
  /** DIP per second. Slow enough to read as drift, not travel. */
  speed: 5.5,
  /** Links are drawn only between nodes closer than this (DIP). */
  linkDistance: 150,
  linkWidth: 1,
  /**
   * Alpha is THEME-DEPENDENT, and this is the whole light-mode fix.
   *
   * Dark mode paints luminous tokens (cyan-300 etc.) onto near-black: low
   * alpha still reads. Light mode paints mid-dark tokens (cyan-600) onto a
   * near-white ground, where the same alpha washes out to nothing — the
   * field was present but effectively invisible.
   *
   * Light therefore gets meaningfully more opacity and slightly larger
   * nodes, so the field reads as intentional rather than as a rendering
   * accident. Values tuned against the light ground specifically.
   *
   * Note the asymmetry: light raises NODE alpha but LOWERS link alpha below
   * dark's. Reviewing the first light build showed the noise comes almost
   * entirely from the links — long thin strokes crossing letterforms read as
   * scratches on the type, while the round nodes read as depth. So the nodes
   * carry the light-mode presence and the links stay faint.
   */
  linkAlphaMax: { light: 0.34, dark: 0.28 },
  nodeAlpha: { light: 0.82, dark: 0.5 },
  nodeRadius: { light: [1.5, 3.2], dark: [1.1, 2.4] } as const,
  /** Share of nodes carrying an India accent. 1 in 9 — a note, not a theme. */
  indiaAccentRatio: 1 / 9,
  /** Breathing cycle for node radius. */
  pulseSeconds: 7,
  /** Cap DPR — retina at 3x doubles fill cost for no perceptible gain here. */
  maxDpr: 2,
} as const

/** Resolve a CSS custom property to a concrete colour string. */
function readToken(el: HTMLElement, token: string): string {
  return getComputedStyle(el).getPropertyValue(token).trim()
}

/**
 * Convert any CSS colour (including oklch()/lab(), which our tokens use) into
 * rgba with a given alpha.
 *
 * Canvas cannot apply globalAlpha per-path cheaply while batching, and
 * string-concatenating alpha onto an oklch() value is invalid CSS. So the
 * colour is rasterised once through a 1x1 canvas to obtain sRGB bytes, then
 * rebuilt as rgba(). Done once per theme change, not per frame.
 */
function toRgba(probeCtx: CanvasRenderingContext2D, color: string, alpha: number): string {
  probeCtx.fillStyle = "#000"
  probeCtx.fillStyle = color
  probeCtx.fillRect(0, 0, 1, 1)
  const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function AmbientSignalField({
  className,
  "aria-hidden": ariaHidden = true,
}: {
  className?: string
  "aria-hidden"?: boolean
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const [reducedMotion, setReducedMotion] = React.useState(false)
  const [staticGradient, setStaticGradient] = React.useState<string | null>(null)

  /* --- reduced motion ---------------------------------------------------- */
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  /* --- static fallback gradient (reduced motion) ------------------------- */
  React.useEffect(() => {
    if (!reducedMotion) {
      setStaticGradient(null)
      return
    }
    const el = wrapperRef.current
    if (!el) return

    const build = () => {
      const [bg, surface, sunken] = SURFACE_TOKENS.map((t) => readToken(el, t))
      // Uses only existing surface tokens — no invented colour.
      setStaticGradient(
        `radial-gradient(120% 90% at 50% 0%, ${surface} 0%, ${bg} 55%, ${sunken} 100%)`
      )
    }
    build()

    // Re-read when the theme class flips.
    const observer = new MutationObserver(build)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [reducedMotion])

  /* --- animated field ---------------------------------------------------- */
  React.useEffect(() => {
    if (reducedMotion) return

    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    // 1x1 scratch canvas used purely for colour conversion.
    const probe = document.createElement("canvas")
    probe.width = probe.height = 1
    const probeCtx = probe.getContext("2d", { willReadFrequently: true })
    if (!probeCtx) return

    let width = 0
    let height = 0
    let dpr = 1
    let nodes: Node[] = []
    let palette: Palette = {
      nodes: [],
      accents: [],
      link: "",
      radius: CONFIG.nodeRadius.light,
      surfaces: [],
    }
    let frame = 0
    let lastTime = 0
    let visible = true
    let tabVisible = !document.hidden

    /* -- palette ---------------------------------------------------------- */
    /** next-themes writes `.dark` onto <html>; that class is the source of truth. */
    function isDark(): boolean {
      return document.documentElement.classList.contains("dark")
    }

    function readPalette(): Palette {
      const key = isDark() ? "dark" : "light"

      // FUTURE WIRING POINT: when detectors report live, a node's colour /
      // radius can be bound to its ComponentScore instead of being assigned
      // round-robin here.
      const nodeColors = PALETTE_TOKENS.map((t) =>
        toRgba(probeCtx!, readToken(wrapper!, t), CONFIG.nodeAlpha[key])
      )
      // Accents are drawn slightly softer than detector nodes so the warm hues
      // recede; saffron on a light ground is the loudest colour in the system
      // and would otherwise pull focus off the headline.
      const accentColors = INDIA_ACCENT_TOKENS.map((t) =>
        toRgba(probeCtx!, readToken(wrapper!, t), CONFIG.nodeAlpha[key] * 0.72)
      )
      const link = toRgba(
        probeCtx!,
        readToken(wrapper!, "--info"),
        CONFIG.linkAlphaMax[key]
      )
      return {
        nodes: nodeColors,
        accents: accentColors,
        link,
        radius: CONFIG.nodeRadius[key],
        surfaces: [],
      }
    }

    /* -- scene ------------------------------------------------------------ */
    function buildScene() {
      const megapixels = (width * height) / 1_000_000
      const count = Math.round(
        Math.min(
          CONFIG.maxNodes,
          Math.max(CONFIG.minNodes, megapixels * CONFIG.densityPerMegapixel)
        )
      )
      // Accent slots are chosen by a deterministic stride rather than a random
      // roll, so the accents stay evenly distributed instead of occasionally
      // clumping into a visible tricolour cluster.
      const accentStride = Math.max(2, Math.round(1 / CONFIG.indiaAccentRatio))

      nodes = Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2
        const accent = i % accentStride === accentStride - 1
        const bucket = accent ? palette.accents.length : palette.nodes.length
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * CONFIG.speed,
          vy: Math.sin(angle) * CONFIG.speed,
          radiusT: Math.random(),
          colorIndex: i % Math.max(1, bucket),
          accent,
          phase: Math.random() * Math.PI * 2,
        }
      })
    }

    function resize() {
      const rect = wrapper!.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr)
      width = rect.width
      height = rect.height
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildScene()
    }

    /* -- draw ------------------------------------------------------------- */
    function draw(time: number) {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0
      lastTime = time
      ctx!.clearRect(0, 0, width, height)

      // Advance and wrap.
      for (const n of nodes) {
        n.x += n.vx * dt
        n.y += n.vy * dt
        if (n.x < -20) n.x = width + 20
        else if (n.x > width + 20) n.x = -20
        if (n.y < -20) n.y = height + 20
        else if (n.y > height + 20) n.y = -20
      }

      // Links first, so nodes sit on top.
      // O(n²) over ≤90 nodes ≈ 4k comparisons/frame — trivial, and avoids the
      // complexity of spatial hashing for a background.
      ctx!.lineWidth = CONFIG.linkWidth
      ctx!.strokeStyle = palette.link
      const maxDist = CONFIG.linkDistance
      const maxDistSq = maxDist * maxDist

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const distSq = dx * dx + dy * dy
          if (distSq > maxDistSq) continue
          // Fade with distance so links dissolve rather than pop.
          const strength = 1 - Math.sqrt(distSq) / maxDist
          ctx!.globalAlpha = strength
          ctx!.beginPath()
          ctx!.moveTo(nodes[i].x, nodes[i].y)
          ctx!.lineTo(nodes[j].x, nodes[j].y)
          ctx!.stroke()
        }
      }
      ctx!.globalAlpha = 1

      // Nodes, gently breathing.
      const pulse = (time / 1000) * ((Math.PI * 2) / CONFIG.pulseSeconds)
      const [rMin, rMax] = palette.radius
      for (const n of nodes) {
        const scale = 1 + Math.sin(pulse + n.phase) * 0.22
        const bucket = n.accent ? palette.accents : palette.nodes
        ctx!.fillStyle = bucket[n.colorIndex] ?? bucket[0] ?? palette.nodes[0]
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, (rMin + n.radiusT * (rMax - rMin)) * scale, 0, Math.PI * 2)
        ctx!.fill()
      }

      frame = requestAnimationFrame(draw)
    }

    function start() {
      if (frame) return
      lastTime = 0
      frame = requestAnimationFrame(draw)
    }
    function stop() {
      if (!frame) return
      cancelAnimationFrame(frame)
      frame = 0
    }
    function sync() {
      if (visible && tabVisible) start()
      else stop()
    }

    /* -- init ------------------------------------------------------------- */
    palette = readPalette()
    resize()
    sync()

    /* -- observers -------------------------------------------------------- */
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(wrapper)

    // Pause when scrolled out of view.
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        sync()
      },
      { threshold: 0 }
    )
    intersectionObserver.observe(wrapper)

    // Re-read colours when the theme class changes.
    const themeObserver = new MutationObserver(() => {
      palette = readPalette()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    const onVisibility = () => {
      tabVisible = !document.hidden
      sync()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [reducedMotion])

  return (
    <div
      ref={wrapperRef}
      aria-hidden={ariaHidden}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={staticGradient ? { background: staticGradient } : undefined}
    >
      {!reducedMotion && (
        <canvas ref={canvasRef} className="block size-full" />
      )}
    </div>
  )
}
