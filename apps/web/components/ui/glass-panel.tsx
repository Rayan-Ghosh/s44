import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Glass panel.
 *
 * GLASS IS A HIERARCHY TOOL, NOT A DEFAULT SURFACE. If every surface is
 * glass, nothing reads as elevated and the effect becomes noise. Reserve it
 * for overlays and, at most, one focal panel per view — a risk warning, a
 * confirmation sheet. Ordinary content belongs on `Card` / `bg-surface`.
 *
 * `elevation` controls how far the panel sits off the page; `tint` lets a
 * panel carry a semantic meaning (a HIGH-band warning reads threat-tinted)
 * without any component reaching for a raw hue.
 */
const glassPanelVariants = cva(
  "relative rounded-2xl border transition-shadow duration-normal ease-standard",
  {
    variants: {
      elevation: {
        // Flat: no blur, for when a panel needs the look but not the cost.
        flat: "bg-surface border-border shadow-xs",
        // Raised: the standard glass treatment.
        raised: "glass",
        // Floating: glass plus a wider shadow, for true overlays.
        floating: "glass shadow-xl",
      },
      tint: {
        none: "",
        safe: "border-safe/25",
        caution: "border-caution/30",
        threat: "border-threat/30",
        info: "border-info/25",
        ai: "border-ai/25",
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      elevation: "raised",
      tint: "none",
      padding: "md",
    },
  }
)

export interface GlassPanelProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof glassPanelVariants> {}

function GlassPanel({
  className,
  elevation,
  tint,
  padding,
  ...props
}: GlassPanelProps) {
  return (
    <div
      data-slot="glass-panel"
      className={cn(glassPanelVariants({ elevation, tint, padding }), className)}
      {...props}
    />
  )
}

export { GlassPanel, glassPanelVariants }
