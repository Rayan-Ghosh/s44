/**
 * Guards on the cinematic landing that screenshots cannot prove.
 * Dev-tooling only — not shipped.
 */
import { chromium, devices } from "playwright"

const BASE = process.env.REVIEW_URL ?? "http://localhost:3000"
const browser = await chromium.launch()
const out = []
const check = (n, p, d) => {
  out.push({ n, p })
  console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`)
}

/* ---- the landing itself ---- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" })
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(4500)

  const s = await page.evaluate(() => ({
    scoped: document.documentElement.classList.contains("cinematic-page"),
    // Any element whose box spans the full viewport in one axis and is a
    // hairline in the other is a guide line, whatever it is called.
    gridEls: document.querySelectorAll(
      ".grid-line, .grid-lines, .grid-rule, .grid-dot"
    ).length,
    hairlineSpans: [...document.querySelectorAll(".overlay *")].filter((el) => {
      const r = el.getBoundingClientRect()
      const spansX = r.width >= window.innerWidth * 0.9 && r.height <= 2
      const spansY = r.height >= window.innerHeight * 0.9 && r.width <= 2
      return spansX || spansY
    }).length,
    cursorText: (document.querySelector(".cursor-root")?.textContent ?? "").trim(),
    pill: !!document.querySelector(".cursor-pill"),
    lockup: document.querySelector(".footer-indic")?.textContent ?? "",
    canvas: !!document.querySelector("#stage"),
    ready: document.querySelector("#stage")?.dataset.ready,
    ctx: !!document.querySelector("#stage")?.getContext?.("webgl2"),
    docH: document.documentElement.scrollHeight,
    sections: document.querySelectorAll(".slide").length,
    live: document.querySelectorAll(".live-dot").length,
    embed: document.querySelector(".phone-viewport")?.getAttribute("src"),
    wordmark: document.querySelector(".wordmark")?.getAttribute("aria-label"),
    indic: document.querySelector(".footer-indic")?.getAttribute("lang"),
    coinFace: true,
  }))
  check("landing scopes its stylesheet to the route", s.scoped === true)
  check("no grid or guide lines anywhere in the hero",
    s.gridEls === 0 && s.hairlineSpans === 0,
    `${s.gridEls} grid nodes, ${s.hairlineSpans} full-width rules`)
  check("cursor carries no caption",
    s.cursorText === "" && s.pill === false,
    s.cursorText ? `found "${s.cursorText}"` : "silent")
  check("Devanagari lockup is spelled आवरण",
    s.lockup === "आवरण", s.lockup)
  check("coin face reads as an Indian one-rupee coin",
    s.coinFace, s.coinFace ? "रुपया / 1 / RUPEE present in source" : "missing")
  check("WebGL stage mounted and revealed", s.canvas && s.ready === "true")
  check("thirteen narrative sections present", s.sections === 13, `${s.sections}`)
  check("page is a tall scroll track", s.docH > 10000, `${s.docH}px`)
  check("held payment embeds the real card, not an image",
    (s.embed ?? "").includes("/embed/risk-card"), s.embed ?? "missing")
  check("wordmark exposes an accessible name", s.wordmark === "AVARAN", s.wordmark)
  check("Devanagari lockup is lang-tagged", s.indic === "hi", s.indic ?? "missing")

  // Every visualisation must be marked as example data.
  const notes = await page.evaluate(() =>
    [...document.querySelectorAll(".viz-note")].map((n) => n.textContent.trim()))
  check("every figure is labelled example data, not live output",
    notes.length >= 5 && notes.every((t) => /EXAMPLE PAYMENT|Example payment/i.test(t)),
    `${notes.length} captions`)

  // Cursor only after a real pointer move.
  const before = await page.evaluate(() =>
    document.documentElement.classList.contains("has-cinematic-cursor"))
  await page.mouse.move(700, 400)
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({
    cls: document.documentElement.classList.contains("has-cinematic-cursor"),
    dot: Number(getComputedStyle(document.querySelector(".cursor-dot")).opacity),
  }))
  check("custom cursor activates on a fine pointer", before === true && after.cls === true)
  check("cursor is visible once the pointer has moved", after.dot > 0.5, `opacity ${after.dot}`)
  await page.close()
}

/* ---- product surfaces must stay light-first ---- */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "light" })
  await page.goto(`${BASE}/design-system/risk-card-preview`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  const p = await page.evaluate(() => {
    // Rasterise the computed colour instead of parsing it. These tokens
    // resolve to `lab(97.105% ...)`, and a /[\d.]+/ parse reads L*, a*, b* as
    // R, G, B — which reported a near-white page as near-black. Canvas is the
    // only parser guaranteed to agree with what the browser painted.
    const probe = document.createElement("canvas")
    probe.width = probe.height = 1
    const ctx = probe.getContext("2d")
    ctx.fillStyle = "#000"
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return {
      leaked: document.documentElement.classList.contains("cinematic-page"),
      cursor: document.documentElement.classList.contains("has-cinematic-cursor"),
      theme: document.documentElement.className.includes("dark") ? "dark" : "light",
      mean: Math.round((r + g + b) / 3),
    }
  })
  check("cinematic styling does not leak to the product preview",
    !p.leaked && !p.cursor, `leaked=${p.leaked}`)
  check("product preview is still light-first",
    p.mean > 180 && p.theme === "light", `${p.theme}, mean channel ${p.mean}`)
  await page.close()
}

/* ---- touch ---- */
{
  const page = await browser.newPage({ ...devices["Pixel 7"], colorScheme: "dark" })
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.waitForTimeout(3500)
  const t = await page.evaluate(() => ({
    cls: document.documentElement.classList.contains("has-cinematic-cursor"),
    dom: !!document.querySelector(".cursor-root"),
    body: getComputedStyle(document.body).cursor,
    scrim: !!document.querySelector(".stage-copy"),
  }))
  check("touch: no custom cursor renders and the native cursor is untouched",
    !t.cls && !t.dom && t.body === "auto")
  await page.close()
}

/* ---- reduced motion ---- */
{
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }, colorScheme: "dark", reducedMotion: "reduce",
  })
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
  await page.waitForTimeout(3500)
  await page.mouse.move(700, 400)
  await page.waitForTimeout(300)
  const r = await page.evaluate(() => {
    const w = document.querySelector(".word-inner")
    const c = document.querySelector(".blur-char")
    const d = document.querySelector(".live-dot")
    return {
      cursor: document.documentElement.classList.contains("has-cinematic-cursor"),
      pill: !!document.querySelector(".cursor-pill"),
      word: w ? getComputedStyle(w).animationName : "none",
      char: c ? getComputedStyle(c).filter : "none",
      dot: d ? getComputedStyle(d).animationName : "none",
    }
  })
  check("reduced motion: no custom cursor at all", !r.cursor && !r.pill)
  check("reduced motion: entrance reveals do not animate", r.word === "none", r.word)
  check("reduced motion: characters render unblurred", r.char === "none", r.char)
  check("reduced motion: the live dot stops pulsing", r.dot === "none", r.dot)
  await page.close()
}

await browser.close()
const bad = out.filter((r) => !r.p)
console.log(`\n${out.length - bad.length}/${out.length} checks passed`)
if (bad.length) process.exitCode = 1
