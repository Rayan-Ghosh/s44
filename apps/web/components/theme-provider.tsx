"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

/**
 * Theme provider for Avaran.
 *
 * Behaviour required by the brief, and how each part is satisfied:
 *
 *  - PERSISTENCE ACROSS RELOADS — next-themes writes the choice to
 *    localStorage under `avaran-theme` and restores it on boot.
 *
 *  - SYSTEM ON FIRST VISIT, EXPLICIT CHOICE WINS AFTER — `defaultTheme="system"`
 *    with `enableSystem` means an untouched visitor follows their OS. The
 *    moment they pick a theme, that value is stored and takes precedence on
 *    every later visit until they choose "System" again.
 *
 *  - NO FLASH OF WRONG THEME — next-themes injects a blocking inline script
 *    into <head> that sets the `class` on <html> before first paint, so the
 *    correct theme is applied during SSR hydration rather than after it.
 *    `suppressHydrationWarning` on <html> (see layout.tsx) is required because
 *    that script mutates the element the server rendered.
 *
 *  - SMOOTH TRANSITION, NOT AN ABRUPT SWAP — next-themes' own
 *    `disableTransitionOnChange` is left OFF, because it exists to kill exactly
 *    the cross-fade we want. Instead `useThemeTransition` adds a short-lived
 *    `.theme-transition` class to <html> around the swap; globals.css scopes a
 *    colour-only transition to that class. Colour-only matters: transitioning
 *    `all` would animate layout and make the swap feel sludgy.
 *    The transition is disabled entirely under prefers-reduced-motion.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="avaran-theme"
      disableTransitionOnChange={false}
      {...props}
    >
      <ThemeTransitionBridge />
      {children}
    </NextThemesProvider>
  )
}

/**
 * Applies `.theme-transition` to <html> for the duration of a theme change.
 *
 * Kept as a mounted bridge rather than living in the toggle so that ANY path
 * that changes the theme — the toggle, the hotkey, a future settings screen,
 * or the OS flipping while on "system" — gets the same cross-fade.
 */
function ThemeTransitionBridge() {
  const { resolvedTheme } = useTheme()
  const previous = React.useRef<string | undefined>(undefined)
  const timeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  React.useEffect(() => {
    // Skip the very first resolve: that is initial paint, not a change.
    if (previous.current === undefined) {
      previous.current = resolvedTheme
      return
    }
    if (previous.current === resolvedTheme) return
    previous.current = resolvedTheme

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return
    }

    const root = document.documentElement
    root.classList.add("theme-transition")

    // Read the duration from the token rather than hardcoding it, so changing
    // --duration-theme in tokens.css stays the single source of truth.
    const raw = getComputedStyle(root)
      .getPropertyValue("--duration-theme")
      .trim()
    const ms = raw.endsWith("ms")
      ? parseFloat(raw)
      : raw.endsWith("s")
        ? parseFloat(raw) * 1000
        : 300

    clearTimeout(timeout.current)
    timeout.current = setTimeout(() => {
      root.classList.remove("theme-transition")
    }, ms)

    return () => clearTimeout(timeout.current)
  }, [resolvedTheme])

  return null
}

export { ThemeProvider }
