"use client"

import * as React from "react"
import { ShieldCheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Pressable } from "@/components/ui/pressable"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  BLURS,
  BREAKPOINTS,
  DURATIONS,
  EASINGS,
  GLOWS,
  RADII,
  SEMANTIC_GROUPS,
  SHADOWS,
  SPACE_SCALE,
  TYPE_SCALE,
  Z_LAYERS,
} from "@/lib/design-tokens"

/**
 * Token reference route.
 *
 * This exists to prove the token system works and to review it in both
 * themes. It is NOT a product page and carries no product claims, metrics,
 * or marketing copy.
 *
 * Every value shown is read live from a CSS custom property via var(), so
 * this page cannot show a number the token layer does not actually define.
 */
export function DesignSystemView() {
  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-24 pt-10 md:gap-20 md:px-8">
        <Colors />
        <Typography />
        <Spacing />
        <Radii />
        <Depth />
        <Motion />
        <Layers />
        <Primitives />
      </main>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Header() {
  return (
    <header className="border-border bg-background/80 sticky top-0 z-header border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 md:px-8">
        <div className="flex items-center gap-3">
          {/* The single India accent on this page: a hairline mark, not a theme. */}
          <span
            className="flex size-9 items-center justify-center rounded-xl border"
            style={{
              borderColor: "var(--accent-india-saffron)",
              color: "var(--info)",
            }}
          >
            <ShieldCheckIcon className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="font-display text-base leading-tight font-semibold tracking-tight">
              Avaran
            </span>
            <span className="text-muted-foreground text-2xs leading-tight">
              Design system reference
            </span>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
      {children}
    </section>
  )
}

/* --- colours -------------------------------------------------------------- */

function Colors() {
  return (
    <Section
      title="Colour"
      description="Components reference semantic tokens only — never a raw hue. The risk-band, status, and detector tokens mirror shared/s40_contracts.py directly, so the palette cannot drift away from what the API actually returns."
    >
      <div className="flex flex-col gap-10">
        {SEMANTIC_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-medium">{group.title}</h3>
              <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed">
                {group.description}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {group.swatches.map((swatch) => (
                <div
                  key={swatch.token}
                  className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border"
                >
                  <div
                    className="h-14 w-full border-b"
                    style={{
                      backgroundColor: `var(--${swatch.token})`,
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                  <div className="flex flex-col gap-0.5 p-3">
                    <code className="text-2xs text-foreground font-mono">
                      --{swatch.token}
                    </code>
                    <span className="text-muted-foreground text-2xs">
                      {swatch.meaning}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* --- typography ----------------------------------------------------------- */

function Typography() {
  return (
    <Section
      title="Typography"
      description="Outfit for display, Inter for body — hierarchy comes from typeface contrast, not just size. Noto Sans Devanagari ships from day one because Hindi support is a product requirement, not a later retrofit."
    >
      <div className="border-border bg-surface flex flex-col divide-y divide-[var(--border-subtle)] rounded-xl border">
        {TYPE_SCALE.map((entry) => (
          <div
            key={entry.token}
            className="flex flex-col gap-2 p-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          >
            <span
              className="truncate"
              style={{
                fontSize: `var(--${entry.token})`,
                fontFamily:
                  entry.label === "Display" ||
                  entry.label.startsWith("H")
                    ? "var(--font-display)"
                    : "var(--font-body)",
                letterSpacing:
                  entry.label === "Display" || entry.label.startsWith("H")
                    ? "var(--tracking-tight)"
                    : "var(--tracking-normal)",
              }}
            >
              {entry.sample}
            </span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-muted-foreground text-2xs">
                {entry.label}
              </span>
              <code className="text-muted-foreground text-2xs font-mono">
                --{entry.token}
              </code>
            </div>
          </div>
        ))}
      </div>

      <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5">
        <span className="text-muted-foreground text-2xs font-mono">
          --font-indic · Devanagari
        </span>
        <p className="font-indic text-lg" lang="hi">
          यह भुगतान आपके सामान्य लेन-देन से अलग है।
        </p>
        <p className="text-muted-foreground text-xs">
          Latin and Devanagari coexist without the Latin metrics changing —
          the Indic stack opts in via <code>:lang(hi)</code> or{" "}
          <code>.font-indic</code>.
        </p>
      </div>
    </Section>
  )
}

/* --- spacing -------------------------------------------------------------- */

function Spacing() {
  return (
    <Section
      title="Spacing"
      description="A 4px base scale, named so intent survives refactors."
    >
      <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5">
        {SPACE_SCALE.map((token) => (
          <div key={token} className="flex items-center gap-4">
            <code className="text-muted-foreground w-24 shrink-0 font-mono text-2xs">
              --{token}
            </code>
            <div
              className="h-3 rounded-sm"
              style={{
                width: `var(--${token})`,
                backgroundColor: "var(--info)",
              }}
            />
          </div>
        ))}
      </div>
    </Section>
  )
}

/* --- radii ---------------------------------------------------------------- */

function Radii() {
  return (
    <Section
      title="Radii"
      description="Corner softness carries as much brand signal as colour. Larger radii on containers, tighter on controls."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {RADII.map((token) => (
          <div key={token} className="flex flex-col items-center gap-2">
            <div
              className="border-border bg-surface size-16 border"
              style={{ borderRadius: `var(--${token})` }}
            />
            <code className="text-muted-foreground text-center font-mono text-2xs">
              {token.replace("radius-", "")}
            </code>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* --- depth ---------------------------------------------------------------- */

function Depth() {
  return (
    <Section
      title="Depth"
      description="Light-mode shadows are tinted with the ground hue rather than pure black — black on a cool ground reads as dirt. Glow is selective emphasis, never ambient decoration."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-medium">Shadow</h3>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {SHADOWS.map((token) => (
              <div key={token} className="flex flex-col items-center gap-3">
                <div
                  className="bg-surface size-20 rounded-xl"
                  style={{ boxShadow: `var(--${token})` }}
                />
                <code className="text-muted-foreground font-mono text-2xs">
                  {token.replace("shadow-", "")}
                </code>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-medium">Blur</h3>
          <div className="relative overflow-hidden rounded-xl">
            {/* A gradient beneath so blur is actually visible. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(120deg, var(--info) 0%, var(--ai) 50%, var(--safe) 100%)",
                opacity: 0.5,
              }}
            />
            <div className="relative grid grid-cols-3 gap-4 p-5 sm:grid-cols-6">
              {BLURS.map((token) => (
                <div key={token} className="flex flex-col items-center gap-2">
                  <div
                    className="size-14 rounded-lg border"
                    style={{
                      backdropFilter: `blur(var(--${token}))`,
                      WebkitBackdropFilter: `blur(var(--${token}))`,
                      borderColor: "var(--glass-border)",
                      backgroundColor: "var(--glass-bg)",
                    }}
                  />
                  <code className="text-foreground font-mono text-2xs">
                    {token.replace("blur-", "")}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-medium">Glow</h3>
          <div className="bg-surface-sunken grid grid-cols-2 gap-5 rounded-xl p-6 sm:grid-cols-4 lg:grid-cols-7">
            {GLOWS.map((entry) => (
              <div
                key={entry.token}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div
                  className="bg-surface size-14 rounded-full"
                  style={{ boxShadow: `var(--${entry.token})` }}
                />
                <div className="flex flex-col gap-0.5">
                  <code className="text-foreground font-mono text-2xs">
                    {entry.token.replace("glow-", "")}
                  </code>
                  <span className="text-muted-foreground text-2xs">
                    {entry.meaning}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

/* --- motion --------------------------------------------------------------- */

function Motion() {
  return (
    <Section
      title="Motion"
      description="Durations short enough to feel instant; curves that decelerate rather than bounce. This is a security product, so motion should read as precise. Everything here is disabled under prefers-reduced-motion."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5">
          <h3 className="text-sm font-medium">Duration</h3>
          <div className="flex flex-col gap-2">
            {DURATIONS.map((entry) => (
              <div key={entry.token} className="flex items-center gap-3">
                <code className="text-muted-foreground w-40 shrink-0 font-mono text-2xs">
                  --{entry.token}
                </code>
                <span className="text-muted-foreground text-2xs">
                  {entry.meaning}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-5">
          <h3 className="text-sm font-medium">Easing</h3>
          <div className="flex flex-col gap-2">
            {EASINGS.map((entry) => (
              <div key={entry.token} className="flex items-center gap-3">
                <code className="text-muted-foreground w-36 shrink-0 font-mono text-2xs">
                  --{entry.token}
                </code>
                <span className="text-muted-foreground text-2xs">
                  {entry.meaning}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

/* --- layers --------------------------------------------------------------- */

function Layers() {
  return (
    <Section
      title="Layers & breakpoints"
      description="Every z-index in the product comes from a token, so stacking order is a design decision rather than an arms race of arbitrary numbers."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-5">
          <h3 className="mb-1 text-sm font-medium">Z-index</h3>
          {Z_LAYERS.map((token) => (
            <div key={token} className="flex items-center justify-between">
              <code className="text-muted-foreground font-mono text-2xs">
                --{token}
              </code>
              <span
                className="text-foreground font-mono text-2xs"
                style={{ opacity: 0.8 }}
              >
                {`var(--${token})`}
              </span>
            </div>
          ))}
        </div>

        <div className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-5">
          <h3 className="mb-1 text-sm font-medium">Breakpoints</h3>
          {BREAKPOINTS.map((entry) => (
            <div key={entry.token} className="flex items-center justify-between">
              <code className="text-muted-foreground font-mono text-2xs">
                {entry.token}
              </code>
              <span className="text-foreground font-mono text-2xs">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* --- primitives ----------------------------------------------------------- */

function Primitives() {
  return (
    <Section
      title="Primitives"
      description="A small proof that the tokens compose. Glass is used once here, deliberately — if every surface were glass, nothing would read as elevated."
    >
      <div className="flex flex-col gap-8">
        <div className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-6">
          <h3 className="text-sm font-medium">Button — with press feedback</h3>
          <div className="flex flex-wrap items-center gap-3">
            {(
              [
                "default",
                "secondary",
                "outline",
                "ghost",
                "destructive",
              ] as const
            ).map((variant) => (
              <Pressable key={variant}>
                <Button variant={variant}>
                  {variant[0].toUpperCase() + variant.slice(1)}
                </Button>
              </Pressable>
            ))}
          </div>
          <p className="text-muted-foreground text-2xs">
            Press and hold — the scale-down is composited, so it never reflows
            neighbours. Dropped entirely under reduced motion.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Card</h3>
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Standard surface</CardTitle>
                <CardDescription>
                  The default home for content. Opaque, lightly shadowed, and
                  the correct choice almost everywhere.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </CardContent>
              <CardFooter>
                <span className="text-muted-foreground text-2xs">
                  bg-surface · shadow-xs
                </span>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Loading state</CardTitle>
                <CardDescription>
                  Skeletons inherit radii and muted fill from tokens.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Separator />
                <Skeleton className="h-9 w-28" />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Glass panel</h3>
          <div className="relative overflow-hidden rounded-2xl p-6 sm:p-10">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--info) 0%, var(--ai) 55%, var(--safe) 100%)",
                opacity: 0.45,
              }}
            />
            <div className="relative grid gap-5 md:grid-cols-3">
              <GlassPanel elevation="flat">
                <p className="text-sm font-medium">Flat</p>
                <p className="text-muted-foreground mt-1 text-2xs">
                  Opaque. No blur cost.
                </p>
              </GlassPanel>
              <GlassPanel elevation="raised">
                <p className="text-sm font-medium">Raised</p>
                <p className="text-muted-foreground mt-1 text-2xs">
                  The standard glass treatment.
                </p>
              </GlassPanel>
              <GlassPanel elevation="floating" tint="threat">
                <p className="text-sm font-medium">Floating · threat tint</p>
                <p className="text-muted-foreground mt-1 text-2xs">
                  For overlays that carry meaning.
                </p>
              </GlassPanel>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}
