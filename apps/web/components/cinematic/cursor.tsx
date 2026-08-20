"use client"

import * as React from "react"

/**
 * The cursor, merging both references into one object rather than two.
 *
 * Reference 1 contributed a lagging glassmorphism pill; reference 2 contributed
 * a two-layer ring that snaps and trails. Running both as separate systems
 * would put three things on screen chasing one pointer, so they are combined:
 *
 *   dot    — snaps to the pointer with no easing. This is the actual cursor;
 *            precision is non-negotiable, so it never lags.
 *   ring   — trails at 0.2. Gives the cursor weight without costing accuracy,
 *            and opens up over anything clickable.
 *
 * There was a third element: a lagging glass pill carrying a caption. The
 * caption is gone, and rather than keep an empty pill drifting around the
 * screen the whole element went with it — a blank card chasing the pointer is
 * decoration with nothing to say. Two elements, both silent.
 *
 * HARD DISABLES — neither is a CSS hide:
 *   • coarse pointer / no hover — nothing runs, no listeners, no rAF, and the
 *     native cursor is never suppressed.
 *   • prefers-reduced-motion — same. There is no meaningful static version of
 *     a trailing cursor, and suppressing the system cursor to replace it with
 *     something that cannot move is strictly worse than leaving it alone.
 */

const RING_LERP = 0.2
const SCALE_LERP = 0.15

export function CinematicCursor() {
  const dotRef = React.useRef<HTMLDivElement | null>(null)
  const ringRef = React.useRef<HTMLDivElement | null>(null)
  const [enabled, setEnabled] = React.useState(false)

  React.useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)")
    const hover = window.matchMedia("(hover: hover)")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const evaluate = () =>
      setEnabled(fine.matches && hover.matches && !reduced.matches)
    evaluate()
    fine.addEventListener("change", evaluate)
    hover.addEventListener("change", evaluate)
    reduced.addEventListener("change", evaluate)
    return () => {
      fine.removeEventListener("change", evaluate)
      hover.removeEventListener("change", evaluate)
      reduced.removeEventListener("change", evaluate)
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    const dot = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    // The native cursor is suppressed only now, after every gate has passed.
    document.documentElement.classList.add("has-cinematic-cursor")

    let mx = window.innerWidth / 2
    let my = window.innerHeight / 2
    let ringX = mx
    let ringY = my
    let scale = 0
    let targetScale = 0
    let ringScale = 1
    let targetRingScale = 1
    let first = true
    let overInteractive = false
    let raf = 0

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      mx = e.clientX
      my = e.clientY
      if (first) {
        ringX = mx
        ringY = my
        first = false
      }

      const el = e.target instanceof Element ? e.target : null
      const hit = el?.closest<HTMLElement>("a, button, [data-cursor]")
      overInteractive = !!hit

      // Over something clickable the ring opens up to acknowledge the target.
      targetScale = 1
      targetRingScale = hit ? 1.7 : 1
      ring.dataset.state = hit ? "open" : "idle"
    }

    const onLeave = () => {
      targetScale = 0
      targetRingScale = 1
    }
    const onEnter = () => {
      if (!overInteractive) targetScale = 1
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    document.addEventListener("pointerenter", onEnter)
    window.addEventListener("blur", onLeave)

    const tick = () => {
      raf = requestAnimationFrame(tick)

      ringX += (mx - ringX) * RING_LERP
      ringY += (my - ringY) * RING_LERP
      scale += (targetScale - scale) * SCALE_LERP
      ringScale += (targetRingScale - ringScale) * SCALE_LERP

      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%) scale(${ringScale})`
      // Nothing is visible until the pointer has actually moved. Without this
      // the ring and dot paint at the viewport centre on load and sit there —
      // a stray circle in the middle of the hero for anyone using a keyboard.
      const present = first ? 0 : Math.max(0, scale)
      dot.style.opacity = `${present}`
      ring.style.opacity = `${present}`
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("pointerenter", onEnter)
      window.removeEventListener("blur", onLeave)
      document.documentElement.classList.remove("has-cinematic-cursor")
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div aria-hidden className="cursor-root">
      <div ref={ringRef} className="cursor-ring" data-state="idle" />
      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
