import type { Metadata } from "next"

import { AmbientSignalField } from "@/components/ambient-signal-field"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "Avaran — Ambient field preview",
}

/**
 * Isolated harness for reviewing the ambient background in both themes.
 *
 * This is a review surface for the design system, NOT the hero and NOT
 * product content — building the hero was explicitly out of scope for the
 * task that added this component.
 */
export default function AmbientPreviewPage() {
  return (
    <main className="relative min-h-dvh">
      <AmbientSignalField />
      <div className="relative flex min-h-dvh flex-col items-start justify-center gap-6 px-8">
        <ThemeToggle />
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold">Ambient signal field</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Placeholder ambience only — not live detector data. Toggle the
            theme to confirm it re-themes, and enable reduced motion to
            confirm it falls back to a static gradient.
          </p>
        </div>
      </div>
    </main>
  )
}
