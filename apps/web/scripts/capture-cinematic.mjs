/**
 * Capture the cinematic landing at each narrative beat.
 *
 * The page is 1500vh of empty scroll driving a fixed WebGL stage, so there is
 * nothing to full-page screenshot — every frame has to be taken at a specific
 * scroll fraction. The fractions below are the midpoints of the section ranges
 * in components/cinematic/narrative.tsx.
 *
 * Dev-tooling only — not shipped.
 */
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import path from "node:path"

const URL = process.env.REVIEW_URL ?? "http://localhost:3000/"
const OUT = path.resolve(process.cwd(), "../../.impeccable/review/cinematic")
mkdirSync(OUT, { recursive: true })

const BEATS = [
  ["01-hero", 0.012],
  ["02-signals", 0.1],
  ["03-transaction", 0.177],
  ["04-behaviour", 0.254],
  ["05-device", 0.331],
  ["06-voice", 0.408],
  ["07-fusion", 0.485],
  ["08-held", 0.565],
  ["09-how", 0.645],
  ["10-review", 0.722],
  ["11-console", 0.799],
  ["12-limits", 0.876],
  ["13-final", 0.97],
]

const browser = await chromium.launch()

async function open({ width, height, reducedMotion = "no-preference" }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion,
  })
  await page.goto(URL, { waitUntil: "networkidle" })
  // Fonts must resolve before the coin's emblem is rasterised.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(3500)
  return page
}

async function at(page, fraction, file, settle = 5200) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: max * f, behavior: "instant" })
  }, fraction)
  // The camera lerps at 0.03/frame and the scroll signal at 0.045, so a jump
  // across the page takes several seconds of frames to converge. Capturing at
  // 2.6s photographed the camera mid-flight and the wrong section's copy.
  await page.waitForTimeout(settle)
  // Deliberately never move the mouse: a pointermove would summon the custom
  // cursor into the corner of every frame.
  await page.screenshot({ path: path.join(OUT, file) })
  console.log(`captured ${file}`)
}

/* Desktop — every beat. */
{
  const page = await open({ width: 1440, height: 900 })
  for (const [name, f] of BEATS) {
    await at(page, f, `${name}.png`)
  }
  await page.close()
}

/* Mobile — the beats most likely to collide with the coin. */
{
  const page = await open({ width: 390, height: 844 })
  for (const [name, f] of [BEATS[0], BEATS[2], BEATS[7], BEATS[12]]) {
    await at(page, f, `m-${name}.png`)
  }
  await page.close()
}

/* Reduced motion — everything must be legible with no animation at all. */
{
  const page = await open({
    width: 1440,
    height: 900,
    reducedMotion: "reduce",
  })
  await at(page, 0.012, "rm-01-hero.png", 2500)
  await at(page, 0.485, "rm-07-fusion.png", 2500)
  const state = await page.evaluate(() => ({
    cursor: document.documentElement.classList.contains("has-cinematic-cursor"),
    pill: !!document.querySelector(".cursor-pill"),
  }))
  console.log(
    `reduced-motion: cursor=${state.cursor} pill=${state.pill} (both expect false)`
  )
  await page.close()
}

await browser.close()
