import { chromium } from "playwright"
const b = await chromium.launch()
const p = await b.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
})
const errors = []
p.on("pageerror", (e) => errors.push(String(e)))
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(5500)
// Crop tight to the coin so the relief is judgeable.
await p.screenshot({
  path: "../../.impeccable/review/cinematic/_face.png",
  clip: { x: 980, y: 330, width: 560, height: 560 },
})
await p.screenshot({ path: "../../.impeccable/review/cinematic/01-hero.png" })
console.log("captured; errors:", errors.length ? errors.slice(0, 3) : "none")
await b.close()
