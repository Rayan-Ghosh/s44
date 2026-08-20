"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTheme } from "next-themes"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const

/**
 * Segmented theme control.
 *
 * Three explicit options rather than a two-state switch, because "System" has
 * to be reachable — otherwise a user who once tapped Dark can never hand
 * control back to their OS.
 *
 * The selection indicator is a shared `layoutId`, so it slides between
 * segments instead of cross-fading in place. Under prefers-reduced-motion the
 * slide is dropped and the indicator simply appears.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const reduceMotion = useReducedMotion()

  // Theme is unknowable during SSR. Render the frame at final size so the
  // control never causes layout shift when it resolves.
  React.useEffect(() => setMounted(true), [])

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken p-1",
        className
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const selected = mounted && theme === option.value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-full",
              "transition-colors duration-fast ease-standard",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1",
              "focus-visible:ring-offset-surface-sunken focus-visible:outline-none",
              selected
                ? "text-info-emphasis"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <AnimatePresence initial={false}>
              {selected && (
                <motion.span
                  layoutId="theme-toggle-indicator"
                  className="bg-surface shadow-sm absolute inset-0 rounded-full"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              )}
            </AnimatePresence>
            <Icon className="relative size-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
