"use client"

import * as React from "react"

/**
 * Gate for continuous ambient CSS animation.
 *
 * Returns a ref to attach to the animating container and a boolean saying
 * whether the animation should currently run. Two conditions switch it off,
 * and they are the same two the ambient signal field already honours, so every
 * looping background effect on this page starts and stops for the same
 * reasons:
 *
 *  1. prefers-reduced-motion — off entirely. These loops carry no information
 *     the static arrangement does not, so there is nothing to degrade to.
 *  2. Offscreen — paused via IntersectionObserver. A loop nobody can see has
 *     no business holding compositor budget, and here it would be competing
 *     with three lazily-loaded iframes for it.
 *
 * Consumers pause with `animation-play-state: paused` rather than by removing
 * the animation, so a loop freezes where it is and resumes from there instead
 * of snapping back to 0%.
 */
export function useAmbientMotion<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null)
  // Both default to the "no motion" answer so the first client render agrees
  // with the server render, which emits no animation either.
  const [reducedMotion, setReducedMotion] = React.useState(true)
  const [onScreen, setOnScreen] = React.useState(false)

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReducedMotion(query.matches)
    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
  }, [])

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, active: !reducedMotion && onScreen, reducedMotion }
}
