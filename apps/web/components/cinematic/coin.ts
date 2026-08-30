import * as THREE from "three"

/**
 * A photorealistic procedural Indian ₹1 circulation coin with PBR Normal Mapping.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE & REALISM:
 *
 * Struck metal is defined by 3 things:
 * 1. Die-struck 3D Relief — Rounded, stamped bevels that catch raking key light.
 * 2. Sobel Normal Mapping — Converts heightfields into tangent-space RGB normal
 *    vectors so Three.js renders razor-sharp specular glints and physical depth.
 * 3. Radial Brushed Lathe Grain — Real mint dies leave microscopic concentric
 *    polishing tracks, giving the coin its signature "cartwheel luster".
 *
 * Physical proportions follow the authentic ₹1 circulation coin:
 * 21.93mm diameter, 1.45mm thickness (~15:1 aspect ratio).
 * ─────────────────────────────────────────────────────────────────────────
 */

const TEXTURE_SIZE = 2048
export const COIN_RADIUS = 1.0
export const COIN_THICKNESS = (1.45 / 21.93) * 2 * COIN_RADIUS

/** Height-field convention: #808080 = flat ground; lighter = raised; darker = recessed */
const FIELD = "#808080"
const RAISED = "#ffffff"
const RAISED_MID = "#d8d8d8"
const RAISED_SOFT = "#b4b4b4"
const RECESSED = "#3a3a3a"

function newCanvas(w = TEXTURE_SIZE, h = TEXTURE_SIZE) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  return c
}

/** Microscopic radial lathe grain and die-polish marks */
function addBrushedSteelGrain(ctx: CanvasRenderingContext2D) {
  const n = TEXTURE_SIZE
  const c = n / 2

  // Concentric lathe grooves (mint polishing)
  ctx.save()
  ctx.globalAlpha = 0.04
  for (let r = n * 0.05; r < n * 0.48; r += 2.5) {
    ctx.strokeStyle = Math.random() > 0.5 ? "#ffffff" : "#000000"
    ctx.lineWidth = 1 + Math.random() * 1.2
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  // Radial die-stress luster lines
  ctx.save()
  ctx.globalAlpha = 0.035
  ctx.strokeStyle = "#ffffff"
  ctx.lineWidth = 1
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2 + (Math.random() - 0.5) * 0.02
    const r0 = n * (0.08 + Math.random() * 0.12)
    const r1 = n * 0.465
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1)
    ctx.stroke()
  }
  ctx.restore()

  // Authentic micro-nicks and contact marks from circulation
  ctx.save()
  ctx.globalAlpha = 0.06
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * n * 0.44
    const x = c + Math.cos(a) * r
    const y = c + Math.sin(a) * r
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000"
    ctx.beginPath()
    ctx.ellipse(
      x,
      y,
      1.5 + Math.random() * 3,
      1 + Math.random() * 2,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }
  ctx.restore()
}

/** The raised protective outer rim & inner bevel step */
function drawRim(ctx: CanvasRenderingContext2D) {
  const n = TEXTURE_SIZE
  const c = n / 2

  ctx.fillStyle = FIELD
  ctx.fillRect(0, 0, n, n)

  // Pure black mask outside coin circumference
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, n * 0.495, 0, Math.PI * 2)
  ctx.closePath()
  ctx.rect(n, 0, -n, n)
  ctx.fillStyle = "#000000"
  ctx.fill("evenodd")
  ctx.restore()

  // Raised outer rim with soft bevel gradient
  ctx.strokeStyle = RAISED_SOFT
  ctx.lineWidth = n * 0.042
  ctx.beginPath()
  ctx.arc(c, c, n * 0.472, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = RAISED
  ctx.lineWidth = n * 0.026
  ctx.beginPath()
  ctx.arc(c, c, n * 0.474, 0, Math.PI * 2)
  ctx.stroke()

  // Shallow inner trough step
  ctx.strokeStyle = RECESSED
  ctx.lineWidth = n * 0.012
  ctx.beginPath()
  ctx.arc(c, c, n * 0.448, 0, Math.PI * 2)
  ctx.stroke()
}

/** Stamped Lion Capital of Ashoka with 3D embossed lion manes and abacus */
function drawLionCapital(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  ctx.fillStyle = RAISED
  ctx.strokeStyle = RAISED

  /* ── Inverted Bell/Lotus Base ── */
  ctx.fillStyle = RAISED_SOFT
  ctx.beginPath()
  ctx.moveTo(-s * 0.46, s * 0.52)
  ctx.bezierCurveTo(-s * 0.34, s * 0.74, -s * 0.26, s * 0.86, -s * 0.22, s * 0.94)
  ctx.lineTo(s * 0.22, s * 0.94)
  ctx.bezierCurveTo(s * 0.26, s * 0.86, s * 0.34, s * 0.74, s * 0.46, s * 0.52)
  ctx.closePath()
  ctx.fill()

  // Lotus petal fluting
  ctx.strokeStyle = RECESSED
  ctx.lineWidth = s * 0.018
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(i * s * 0.115, s * 0.56)
    ctx.lineTo(i * s * 0.062, s * 0.92)
    ctx.stroke()
  }

  /* ── Abacus ── */
  ctx.fillStyle = RAISED
  ctx.beginPath()
  ctx.moveTo(-s * 0.58, s * 0.26)
  ctx.lineTo(s * 0.58, s * 0.26)
  ctx.lineTo(s * 0.50, s * 0.52)
  ctx.lineTo(-s * 0.50, s * 0.52)
  ctx.closePath()
  ctx.fill()

  /* ── Dharma Chakra (24 Spokes) ── */
  ctx.save()
  ctx.translate(0, s * 0.39)
  ctx.strokeStyle = RECESSED
  ctx.lineWidth = s * 0.022
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.105, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = s * 0.012
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * s * 0.026, Math.sin(a) * s * 0.026)
    ctx.lineTo(Math.cos(a) * s * 0.096, Math.sin(a) * s * 0.096)
    ctx.stroke()
  }
  ctx.fillStyle = RECESSED
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.025, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  /* ── Profile Lions (Left & Right) ── */
  const drawProfile = (dir: number) => {
    ctx.save()
    ctx.scale(dir, 1)
    ctx.fillStyle = RAISED

    // Body & Musculature
    ctx.beginPath()
    ctx.moveTo(s * 0.15, s * 0.26)
    ctx.lineTo(s * 0.15, -s * 0.10)
    ctx.quadraticCurveTo(s * 0.20, -s * 0.30, s * 0.36, -s * 0.34)
    ctx.quadraticCurveTo(s * 0.54, -s * 0.36, s * 0.58, -s * 0.16)
    ctx.quadraticCurveTo(s * 0.61, s * 0.06, s * 0.55, s * 0.26)
    ctx.closePath()
    ctx.fill()

    // Foreleg
    ctx.lineWidth = s * 0.075
    ctx.beginPath()
    ctx.moveTo(s * 0.50, -s * 0.06)
    ctx.lineTo(s * 0.52, s * 0.24)
    ctx.stroke()

    // Mane (die-struck notched curls)
    ctx.beginPath()
    ctx.ellipse(s * 0.44, -s * 0.30, s * 0.19, s * 0.17, 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = s * 0.028
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.15 + (i / 8) * Math.PI * 1.25
      ctx.beginPath()
      ctx.moveTo(s * 0.44 + Math.cos(a) * s * 0.15, -s * 0.30 + Math.sin(a) * s * 0.14)
      ctx.lineTo(s * 0.44 + Math.cos(a) * s * 0.235, -s * 0.30 + Math.sin(a) * s * 0.215)
      ctx.stroke()
    }

    // Muzzle & Facial Contour
    ctx.beginPath()
    ctx.moveTo(s * 0.52, -s * 0.36)
    ctx.quadraticCurveTo(s * 0.68, -s * 0.34, s * 0.66, -s * 0.21)
    ctx.quadraticCurveTo(s * 0.58, -s * 0.17, s * 0.51, -s * 0.22)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = RECESSED
    ctx.beginPath()
    ctx.ellipse(s * 0.61, -s * 0.30, s * 0.02, s * 0.015, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  drawProfile(1)
  drawProfile(-1)

  /* ── Facing Centre Lion ── */
  ctx.fillStyle = RAISED
  ctx.beginPath()
  ctx.moveTo(-s * 0.21, s * 0.26)
  ctx.quadraticCurveTo(-s * 0.25, -s * 0.02, -s * 0.17, -s * 0.16)
  ctx.lineTo(s * 0.17, -s * 0.16)
  ctx.quadraticCurveTo(s * 0.25, -s * 0.02, s * 0.21, s * 0.26)
  ctx.closePath()
  ctx.fill()

  ctx.lineWidth = s * 0.064
  ctx.beginPath()
  ctx.moveTo(-s * 0.11, s * 0.02)
  ctx.lineTo(-s * 0.13, s * 0.24)
  ctx.moveTo(s * 0.11, s * 0.02)
  ctx.lineTo(s * 0.13, s * 0.24)
  ctx.stroke()

  // Full Center Mane
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.30, s * 0.235, s * 0.205, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = s * 0.032
  for (let i = 0; i < 20; i++) {
    const a = (i / 19) * Math.PI * 2
    const r0x = s * 0.20, r0y = s * 0.175
    const r1x = s * 0.295, r1y = s * 0.265
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r0x, -s * 0.30 + Math.sin(a) * r0y)
    ctx.lineTo(Math.cos(a) * r1x, -s * 0.30 + Math.sin(a) * r1y)
    ctx.stroke()
  }

  // Facial Features
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.26, s * 0.115, s * 0.098, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = RECESSED
  ctx.beginPath()
  ctx.ellipse(-s * 0.062, -s * 0.345, s * 0.022, s * 0.016, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(s * 0.062, -s * 0.345, s * 0.022, s * 0.016, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-s * 0.030, -s * 0.275)
  ctx.lineTo(s * 0.030, -s * 0.275)
  ctx.lineTo(0, -s * 0.232)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = RECESSED
  ctx.lineWidth = s * 0.015
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.232)
  ctx.lineTo(0, -s * 0.205)
  ctx.moveTo(-s * 0.048, -s * 0.196)
  ctx.quadraticCurveTo(0, -s * 0.172, s * 0.048, -s * 0.196)
  ctx.stroke()

  ctx.restore()
}

/** Render State Emblem on Obverse Face */
function drawEmblem(ctx: CanvasRenderingContext2D) {
  const n = TEXTURE_SIZE
  const c = n / 2
  drawRim(ctx)

  drawLionCapital(ctx, c, c - n * 0.055, n * 0.30)

  ctx.save()
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = RAISED

  // सत्यमेव जयते
  ctx.font = `700 ${Math.round(n * 0.062)}px "Noto Sans Devanagari", serif`
  ctx.fillText("सत्यमेव जयते", c, c + n * 0.205)

  // भारत left, INDIA right
  ctx.font = `700 ${Math.round(n * 0.058)}px "Noto Sans Devanagari", serif`
  ctx.fillText("भारत", c - n * 0.245, c + n * 0.325)
  ctx.font = `700 ${Math.round(n * 0.054)}px "Outfit", sans-serif`
  ctx.letterSpacing = `${n * 0.008}px`
  ctx.fillText("INDIA", c + n * 0.245, c + n * 0.325)
  ctx.letterSpacing = "0px"
  ctx.restore()

  addBrushedSteelGrain(ctx)
}

/** Curve text along circumference normal */
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  centerAngle: number,
  spacing = 1
) {
  const chars =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? [...new Intl.Segmenter("hi", { granularity: "grapheme" }).segment(text)].map(
          (g) => g.segment
        )
      : [...text]
  const widths = chars.map((ch) => ctx.measureText(ch).width * spacing)
  const total = widths.reduce((t, w) => t + w, 0)
  let angle = centerAngle - total / radius / 2

  ctx.save()
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  chars.forEach((ch, i) => {
    const step = widths[i] / radius
    const a = angle + step / 2
    ctx.save()
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    ctx.rotate(a + Math.PI / 2)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
    angle += step
  })
  ctx.restore()
}

/** Die-struck Stamped Numeral 1 */
function drawNumeralOne(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  h: number
) {
  const w = h * 0.076
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = RAISED
  ctx.beginPath()
  ctx.moveTo(-h * 0.30, h * 0.5)
  ctx.lineTo(-h * 0.30, h * 0.5 - h * 0.055)
  ctx.lineTo(-w, h * 0.5 - h * 0.055)
  ctx.lineTo(-w, -h * 0.30)
  ctx.lineTo(-h * 0.235, -h * 0.175)
  ctx.lineTo(-h * 0.285, -h * 0.275)
  ctx.lineTo(-w * 0.2, -h * 0.5)
  ctx.lineTo(w, -h * 0.5)
  ctx.lineTo(w, h * 0.5 - h * 0.055)
  ctx.lineTo(h * 0.30, h * 0.5 - h * 0.055)
  ctx.lineTo(h * 0.30, h * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Stamped Wheat Ear Motifs */
function drawWheat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  dir: number
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(dir, 1)
  ctx.fillStyle = RAISED
  ctx.strokeStyle = RAISED
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  const blade = (
    x0: number, y0: number, x1: number, y1: number,
    bow: number, width: number
  ) => {
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(x0 + bow + width, (y0 + y1) / 2, x1, y1)
    ctx.quadraticCurveTo(x0 + bow - width, (y0 + y1) / 2, x0, y0)
    ctx.closePath()
    ctx.fill()
  }
  blade(s * 0.06, s * 0.56, s * 0.52, -s * 0.40, s * 0.44, s * 0.10)
  blade(s * 0.02, s * 0.58, s * 0.30, -s * 0.06, s * 0.40, s * 0.075)

  ctx.lineWidth = s * 0.038
  ctx.beginPath()
  ctx.moveTo(-s * 0.02, s * 0.56)
  ctx.quadraticCurveTo(s * 0.06, s * 0.12, s * 0.10, -s * 0.44)
  ctx.stroke()

  const rows = 6
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1)
    const x = -s * 0.02 + s * 0.12 * t
    const y = s * 0.44 - t * s * 0.80
    const k = 0.55 + 0.45 * Math.sin(Math.PI * (0.18 + t * 0.72))
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(x + side * s * 0.075 * k, y)
      ctx.rotate(side * -0.62)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.115 * k, s * 0.056 * k, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  ctx.save()
  ctx.translate(s * 0.10, -s * 0.44)
  ctx.rotate(-0.16)
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.048, s * 0.098, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.restore()
}

/** Denomination Hero Face */
function drawDenomination(ctx: CanvasRenderingContext2D) {
  const n = TEXTURE_SIZE
  const c = n / 2
  drawRim(ctx)

  const SERIF = 'Georgia, "Times New Roman", serif'

  ctx.save()
  ctx.fillStyle = RAISED
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  // रुपया
  ctx.font = `700 ${Math.round(n * 0.098)}px "Noto Sans Devanagari", serif`
  arcText(ctx, "रुपया", c, c, n * 0.335, -Math.PI / 2, 1.04)

  // RUPEE and 2000 year
  ctx.font = `700 ${Math.round(n * 0.092)}px ${SERIF}`
  ctx.letterSpacing = `${n * 0.014}px`
  ctx.fillText("RUPEE", c, c + n * 0.205)
  ctx.font = `700 ${Math.round(n * 0.082)}px ${SERIF}`
  ctx.letterSpacing = `${n * 0.006}px`
  ctx.fillText("2000", c, c + n * 0.315)
  ctx.letterSpacing = "0px"
  ctx.restore()

  drawNumeralOne(ctx, c, c - n * 0.045, n * 0.38)
  drawWheat(ctx, c - n * 0.145, c - n * 0.02, n * 0.30, -1)
  drawWheat(ctx, c + n * 0.145, c - n * 0.02, n * 0.30, 1)

  // Noida Mint Mark
  ctx.save()
  ctx.strokeStyle = RAISED
  ctx.fillStyle = RAISED
  ctx.lineWidth = n * 0.006
  ctx.beginPath()
  ctx.arc(c, c + n * 0.395, n * 0.017, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c, c + n * 0.395, n * 0.006, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  addBrushedSteelGrain(ctx)
}

/** 132-reed Milled Edge Cylinder Fluting */
function drawEdge(ctx: CanvasRenderingContext2D) {
  const w = TEXTURE_SIZE
  const h = 256
  ctx.canvas.width = w
  ctx.canvas.height = h
  ctx.fillStyle = FIELD
  ctx.fillRect(0, 0, w, h)

  const reeds = 132
  for (let i = 0; i < reeds; i++) {
    const x = (i / reeds) * w
    const grad = ctx.createLinearGradient(x, 0, x + w / reeds, 0)
    grad.addColorStop(0, RECESSED)
    grad.addColorStop(0.5, RAISED)
    grad.addColorStop(1, RECESSED)
    ctx.fillStyle = grad
    ctx.fillRect(x, 0, w / reeds, h)
  }

  // Edge bevel lips
  const bevel = ctx.createLinearGradient(0, 0, 0, h)
  bevel.addColorStop(0, "rgba(0,0,0,0.6)")
  bevel.addColorStop(0.15, "rgba(0,0,0,0)")
  bevel.addColorStop(0.85, "rgba(0,0,0,0)")
  bevel.addColorStop(1, "rgba(0,0,0,0.6)")
  ctx.fillStyle = bevel
  ctx.fillRect(0, 0, w, h)
}

/**
 * High-performance Sobel Normal Map Generator.
 * Converts 2D stamped heightfields into tangent-space RGB normal maps.
 */
function generateNormalMap(canvas: HTMLCanvasElement, strength = 4.2): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext("2d")!
  const src = ctx.getImageData(0, 0, w, h)
  const srcData = src.data

  const outCanvas = document.createElement("canvas")
  outCanvas.width = w
  outCanvas.height = h
  const outCtx = outCanvas.getContext("2d")!
  const out = outCtx.createImageData(w, h)
  const outData = out.data

  const getIntensity = (x: number, y: number) => {
    const px = Math.min(Math.max(x, 0), w - 1)
    const py = Math.min(Math.max(y, 0), h - 1)
    const idx = (py * w + px) * 4
    return (srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114) / 255
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = getIntensity(x - 1, y - 1)
      const t = getIntensity(x, y - 1)
      const tr = getIntensity(x + 1, y - 1)
      const l = getIntensity(x - 1, y)
      const r = getIntensity(x + 1, y)
      const bl = getIntensity(x - 1, y + 1)
      const b = getIntensity(x, y + 1)
      const br = getIntensity(x + 1, y + 1)

      const dx = tr + 2 * r + br - (tl + 2 * l + bl)
      const dy = bl + 2 * b + br - (tl + 2 * t + tr)
      const dz = 1.0 / strength

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const nx = (dx / len) * 0.5 + 0.5
      const ny = (-dy / len) * 0.5 + 0.5
      const nz = (dz / len) * 0.5 + 0.5

      const i = (y * w + x) * 4
      outData[i] = Math.round(nx * 255)
      outData[i + 1] = Math.round(ny * 255)
      outData[i + 2] = Math.round(nz * 255)
      outData[i + 3] = 255
    }
  }

  outCtx.putImageData(out, 0, 0)
  return outCanvas
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1) {
  const t = new THREE.CanvasTexture(canvas)
  t.anisotropy = 16
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.repeat.set(repeatX, 1)
  t.needsUpdate = true
  return t
}

function faceTexture(canvas: HTMLCanvasElement, face: "obverse" | "reverse") {
  const t = toTexture(canvas)
  t.center.set(0.5, 0.5)
  t.rotation = face === "obverse" ? -Math.PI / 2 : Math.PI / 2
  t.repeat.set(face === "obverse" ? -1 : 1, face === "obverse" ? -1 : 1)
  t.needsUpdate = true
  return t
}

export type CoinBundle = {
  mesh: THREE.Mesh
  dispose: () => void
}

/**
 * Creates the complete Photorealistic PBR Indian Rupee Coin.
 */
export function createCoin(): CoinBundle {
  const frontCanvas = newCanvas()
  drawDenomination(frontCanvas.getContext("2d")!)
  const backCanvas = newCanvas()
  drawEmblem(backCanvas.getContext("2d")!)
  const edgeCanvas = newCanvas(TEXTURE_SIZE, 256)
  drawEdge(edgeCanvas.getContext("2d")!)

  // Generate Tangent-Space Sobel Normal Maps
  const frontNormalCanvas = generateNormalMap(frontCanvas, 4.0)
  const backNormalCanvas = generateNormalMap(backCanvas, 4.0)
  const edgeNormalCanvas = generateNormalMap(edgeCanvas, 3.2)

  const frontBump = faceTexture(frontCanvas, "obverse")
  const backBump = faceTexture(backCanvas, "reverse")
  const edgeBump = toTexture(edgeCanvas, 1)

  const frontNormal = faceTexture(frontNormalCanvas, "obverse")
  const backNormal = faceTexture(backNormalCanvas, "reverse")
  const edgeNormal = toTexture(edgeNormalCanvas, 1)

  /** Authentic Ferritic Stainless Steel PBR material */
  const base = {
    color: new THREE.Color("#ebe6dc"),
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: 3.2,
  }

  const faceMaterial = (bump: THREE.Texture, normal: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      ...base,
      bumpMap: bump,
      bumpScale: 0.012,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.8, 1.8),
      roughnessMap: bump,
      roughness: 0.22,
    })

  const materials = [
    new THREE.MeshStandardMaterial({
      ...base,
      bumpMap: edgeBump,
      bumpScale: 0.015,
      normalMap: edgeNormal,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughness: 0.28,
    }),
    faceMaterial(frontBump, frontNormal),
    faceMaterial(backBump, backNormal),
  ]

  const geometry = new THREE.CylinderGeometry(
    COIN_RADIUS,
    COIN_RADIUS,
    COIN_THICKNESS,
    180,
    1
  )

  geometry.rotateX(Math.PI / 2)

  const mesh = new THREE.Mesh(geometry, materials)
  mesh.castShadow = true
  mesh.receiveShadow = true

  return {
    mesh,
    dispose: () => {
      geometry.dispose()
      materials.forEach((m) => m.dispose())
      frontBump.dispose()
      backBump.dispose()
      edgeBump.dispose()
      frontNormal.dispose()
      backNormal.dispose()
      edgeNormal.dispose()
    },
  }
}
