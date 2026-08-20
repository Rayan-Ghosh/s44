"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

/**
 * Press feedback wrapper.
 *
 * Composes rather than replaces: shadcn's `Button` keeps owning variants,
 * sizing, and focus rings, so it stays updatable via the CLI. This adds only
 * the physical response — a small scale-down on press that makes a tap feel
 * acknowledged before any network round-trip returns.
 *
 * Scale, not translate: translate on a button inside a flex row can nudge
 * neighbours on some engines; scale is composited and never reflows.
 *
 * Under prefers-reduced-motion the scale is dropped entirely — the button
 * still works, it just does not move.
 */
export function Pressable({
  children,
  className,
  scale = 0.97,
  disabled,
}: {
  children: React.ReactNode
  className?: string
  /** How far to compress on press. Subtle by default; this is a security
   *  product, so feedback should read as precise, not springy. */
  scale?: number
  disabled?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={cn("inline-flex", className)}
      whileTap={reduceMotion || disabled ? undefined : { scale }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
    >
      {children}
    </motion.div>
  )
}
