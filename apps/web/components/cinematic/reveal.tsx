"use client"

import * as React from "react"

/**
 * The page's two reveal grammars, kept deliberately distinct so they read as
 * one system with two registers rather than two competing effects.
 *
 * ON LOAD (from reference 1) — a one-shot masked reveal. Content starts
 * clipped inside an `overflow: hidden` wrapper, pushed out of frame and
 * blurred to 20px, then slides into place and resolves. Words rise; the
 * wordmark's letters come in from the left. Used once each, at the top and
 * bottom of the first screen.
 *
 * ON SCROLL (from reference 2) — a reversible per-character blur-up, driven by
 * an `.is-active` class rather than a CSS animation, because a slide can be
 * scrolled back out of range and must be able to play again. 12px blur, 40px
 * rise, 30ms stagger.
 *
 * Both share one easing curve so the page has a single sense of weight.
 */

const EASE = "cubic-bezier(0.05, 0.9, 0.1, 1)"

/* ── one-shot: words rise out of a mask ─────────────────────────────────── */

export function WordReveal({
  text,
  className,
  stagger = 0.1,
  delay = 0,
  as: Tag = "span",
}: {
  text: string
  className?: string
  stagger?: number
  delay?: number
  as?: "span" | "h1" | "h2" | "p"
}) {
  const words = text.split(" ")
  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <React.Fragment key={`${word}-${i}`}>
          <span className="word-mask">
            <span
              className="word-inner"
              style={{ animationDelay: `${delay + i * stagger}s` }}
            >
              {word}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </Tag>
  )
}

/* ── one-shot: letters slide in from the left ───────────────────────────── */

export function LetterReveal({
  text,
  className,
  stagger = 0.09,
  delay = 0,
}: {
  text: string
  className?: string
  stagger?: number
  delay?: number
}) {
  return (
    <span className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <span className="letter-mask" key={`${ch}-${i}`} aria-hidden>
          <span
            className="letter-inner"
            style={{ animationDelay: `${delay + i * stagger}s` }}
          >
            {ch === " " ? " " : ch}
          </span>
        </span>
      ))}
    </span>
  )
}

/* ── reversible: per-character blur-up, class-driven ────────────────────── */

/**
 * `<br>` is expressed as an explicit `\n` in the source string so the split
 * never has to parse HTML. Spaces do not consume a stagger slot — otherwise a
 * long headline's last word arrives noticeably late.
 */
export function BlurChars({
  text,
  className,
  stagger = 0.03,
}: {
  text: string
  className?: string
  stagger?: number
}) {
  let index = 0
  const lines = text.split("\n")

  return (
    <span className={className} aria-label={text.replace(/\n/g, " ")}>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 ? <br aria-hidden /> : null}
          {/* Characters are grouped into WORDS, and each word is a nowrap
              inline-block. Without that grouping the browser treats every
              character span as its own break opportunity and happily splits a
              word across two lines — headlines were rendering as
              "The only signal that hear / s". The stagger still counts across
              the whole line, so the per-character cadence is unchanged. */}
          {line.split(" ").map((word, wi) => (
            <React.Fragment key={wi}>
              {wi > 0 ? <span className="blur-space"> </span> : null}
              <span className="blur-word" aria-hidden>
                {[...word].map((ch, ci) => {
                  const delay = index * stagger
                  index += 1
                  return (
                    <span
                      key={ci}
                      className="blur-char"
                      style={{ transitionDelay: `${delay}s` }}
                    >
                      {ch}
                    </span>
                  )
                })}
              </span>
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </span>
  )
}

export { EASE }
