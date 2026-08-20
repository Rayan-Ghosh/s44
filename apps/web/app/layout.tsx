import type { Metadata } from "next"
import {
  Inter,
  Instrument_Serif,
  Italiana,
  Noto_Sans_Devanagari,
  Outfit,
} from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

/* Body: Inter — the workhorse. Optical sizing on, so small metadata stays
   legible without going bold. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

/* Display: Outfit — geometric, gives headlines a distinct voice from body
   copy so hierarchy comes from typeface contrast, not just size and weight. */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
})

/* Devanagari is loaded from day one. Hindi/Hinglish is a stated product
   requirement (docs/PRODUCT_DIRECTIVES.md §A) and retrofitting a type stack
   after layouts are built is expensive. */
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  display: "swap",
})

/* Signature: Instrument Serif. Loaded italic-only because its single
   sanctioned use is one emphasised word in a headline — shipping the roman
   too would invite it into body copy. */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-instrument-serif",
  display: "swap",
})

/* Display: Italiana — the cinematic landing's editorial headline face. High
   contrast, wide, and unmistakably a display face; it does one job on one
   route and never appears in the product UI. */
const italiana = Italiana({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-italiana",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Avaran — Design System",
  description:
    "Design system foundation for Avaran, an explainable real-time fraud shield for UPI payments.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        inter.variable,
        outfit.variable,
        notoDevanagari.variable,
        instrumentSerif.variable,
        italiana.variable
      )}
    >
      <body className="min-h-dvh">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
