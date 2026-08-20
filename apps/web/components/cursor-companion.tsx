"use client"

import * as React from "react"

/**
 * Cursor companion — a ring/dot that trails the pointer and expands into a
 * labelled affordance over interactive elements.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISABLE RULES (both are hard disables, not CSS hiding)
 *
 *  1. TOUCH / COARSE POINTER — none of this logic runs. There is no pointer
 *     to follow on a touchscreen, and a lagging ring chasing tap positions is
 *     actively worse than nothing. `(pointer: fine)` gates the entire effect
 *     before a single listener is attached, so touch users pay zero JS,
 *     zero rAF, and zero layout cost. Hiding it in CSS would still leave the
 *     rAF loop and pointermove listeners running.
 *
 *  2. prefers-reduced-motion — also a full disable. The whole point of this
 *     element is continuous easing motion tied to pointer position; there is
 *     no meaningful "static" version of a trailing cursor.
 *
 * In both cases the NATIVE cursor is untouched and remains the interaction
 * affordance. `cursor: none` is applied only after this component has
 * successfully activated, and is removed on cleanup — so a JS failure, a
 * hydration bail, or either disable rule leaves a normal working cursor.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Opting in: put `data-cursor-label="..."` on any element. The label is
 * decoration only — it must duplicate information already available from the
 * element's own visible text or accessible name, never add new meaning, since
 * it is invisible to touch, keyboard and screen-reader users. The wrapper is
 * aria-hidden for that reason.
 */

/** Class placed on <html> only while the companion is live. */
const ACTIVE_CLASS = "has-cursor-companion"

const TUNING = {
  /** Position smoothing per frame (0–1). Lower = more trail. */
  ringEase: 0.18,
  /** The dot tracks almost 1:1 so precision never suffers. */
  dotEase: 0.55,
  /** Max magnetic displacement toward a hovered target, in px. */
  magnetStrength: 24,
  /** Only pull when the pointer is within this distance of the target's edge. */
  magnetRadius: 90,
  /** Idle ring diameter / hovered ring diameter, in px. */
  ringSize: 34,
  ringSizeActive: 58,
} as const

type Target = {
  el: HTMLElement
  label: string
  rect: DOMRect
}

export function CursorCompanion() {
  const ringRef = React.useRef<HTMLDivElement | null>(null)
  const dotRef = React.useRef<HTMLDivElement | null>(null)
  const labelRef = React.useRef<HTMLSpanElement | null>(null)
  const [enabled, setEnabled] = React.useState(false)

  /* --- capability gate ---------------------------------------------------
     Evaluated in an effect, so the server render and the first client render
     agree (nothing is rendered until we know). Re-evaluated on change because
     both queries are live: a user can plug in a mouse, or flip the OS motion
     setting, without reloading. */
  React.useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)")
    const hoverCapable = window.matchMedia("(hover: hover)")
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    const evaluate = () =>
      setEnabled(
        finePointer.matches && hoverCapable.matches && !reducedMotion.matches
      )

    evaluate()
    finePointer.addEventListener("change", evaluate)
    hoverCapable.addEventListener("change", evaluate)
    reducedMotion.addEventListener("change", evaluate)
    return () => {
      finePointer.removeEventListener("change", evaluate)
      hoverCapable.removeEventListener("change", evaluate)
      reducedMotion.removeEventListener("change", evaluate)
    }
  }, [])

  /* --- pointer loop ------------------------------------------------------ */
  React.useEffect(() => {
    if (!enabled) return

    const ring = ringRef.current
    const dot = dotRef.current
    const label = labelRef.current
    if (!ring || !dot || !label) return

    // Native cursor is suppressed only now — after every gate has passed and
    // the elements actually exist.
    document.documentElement.classList.add(ACTIVE_CLASS)

    let pointerX = window.innerWidth / 2
    let pointerY = window.innerHeight / 2
    let ringX = pointerX
    let ringY = pointerY
    let dotX = pointerX
    let dotY = pointerY
    let target: Target | null = null
    let onScreen = false
    let frame = 0

    function resolveTarget(el: EventTarget | null): Target | null {
      if (!(el instanceof Element)) return null
      const host = el.closest<HTMLElement>("[data-cursor-label]")
      if (!host) return null
      return {
        el: host,
        label: host.dataset.cursorLabel ?? "",
        rect: host.getBoundingClientRect(),
      }
    }

    function applyTargetState(next: Target | null) {
      const changed = next?.el !== target?.el
      target = next
      if (!changed) return

      if (next) {
        label!.textContent = next.label
        ring!.dataset.state = "active"
      } else {
        ring!.dataset.state = "idle"
      }
    }

    const onMove = (event: PointerEvent) => {
      // Ignore synthetic pointer events from touch even if the gate somehow
      // passed on a hybrid device mid-session.
      if (event.pointerType !== "mouse") return
      pointerX = event.clientX
      pointerY = event.clientY
      if (!onScreen) {
        onScreen = true
        ring!.dataset.visible = "true"
        dot!.dataset.visible = "true"
        // Jump rather than glide in from the last known position.
        ringX = dotX = pointerX
        ringY = dotY = pointerY
      }
      applyTargetState(resolveTarget(event.target))
    }

    const onLeave = () => {
      onScreen = false
      ring!.dataset.visible = "false"
      dot!.dataset.visible = "false"
      applyTargetState(null)
    }

    // Targets move when the page scrolls; the cached rect must not go stale or
    // the magnet will pull toward where the button used to be. Scrolling can
    // also move a DIFFERENT element under a stationary pointer, so the target
    // itself is re-resolved from the point rather than only its rect being
    // refreshed — otherwise the ring stays expanded and labelled over whatever
    // it was last on, which was visible after a click-then-scroll.
    const refreshRect = () => {
      if (!onScreen) return
      applyTargetState(
        resolveTarget(document.elementFromPoint(pointerX, pointerY))
      )
      if (target) target.rect = target.el.getBoundingClientRect()
    }

    function tick() {
      let magnetX = 0
      let magnetY = 0

      if (target) {
        const { rect } = target
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dx = cx - pointerX
        const dy = cy - pointerY
        const distance = Math.hypot(dx, dy)
        if (distance > 0.5) {
          // Falls off with distance, so the pull is strongest at the edge of
          // the target and vanishes as the pointer reaches its centre —
          // an assist, never a hijack of where the user pointed.
          const falloff = Math.max(0, 1 - distance / TUNING.magnetRadius)
          const pull = Math.min(TUNING.magnetStrength, distance) * falloff
          magnetX = (dx / distance) * pull
          magnetY = (dy / distance) * pull
        }
      }

      const goalX = pointerX + magnetX
      const goalY = pointerY + magnetY

      ringX += (goalX - ringX) * TUNING.ringEase
      ringY += (goalY - ringY) * TUNING.ringEase
      dotX += (pointerX - dotX) * TUNING.dotEase
      dotY += (pointerY - dotY) * TUNING.dotEase

      ring!.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`
      dot!.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`

      frame = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    window.addEventListener("blur", onLeave)
    window.addEventListener("scroll", refreshRect, { passive: true })
    window.addEventListener("resize", refreshRect)
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
      window.removeEventListener("blur", onLeave)
      window.removeEventListener("scroll", refreshRect)
      window.removeEventListener("resize", refreshRect)
      document.documentElement.classList.remove(ACTIVE_CLASS)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div aria-hidden className="cursor-companion-root">
      <div
        ref={ringRef}
        className="cursor-companion-ring"
        data-state="idle"
        data-visible="false"
      >
        <span ref={labelRef} className="cursor-companion-label" />
      </div>
      <div ref={dotRef} className="cursor-companion-dot" data-visible="false" />
    </div>
  )
}

export const CURSOR_TUNING = TUNING
