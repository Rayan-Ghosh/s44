"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

/**
 * The one genuinely per-request thing on this route: which of the three
 * phone-frame depths this embed shows, via `?y=`. Reading it client-side
 * (instead of the page reading the `searchParams` prop) means the page
 * itself has nothing left that depends on the request, so Next prerenders
 * it once at build time and serves that same static HTML to every embed —
 * see page.tsx's comment for why this route was fully dynamic before.
 *
 * Needs a <Suspense> boundary from the caller: useSearchParams() opts a
 * client component out of static rendering unless it's wrapped in one, and
 * without that boundary Next would bail the whole page back to dynamic —
 * exactly the thing this component exists to avoid.
 */
export function OffsetShift({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const offset = Number.parseInt(searchParams.get("y") ?? "0", 10)
  const shift = Number.isFinite(offset) && offset > 0 ? offset : 0

  return (
    <div className="p-4" style={{ marginTop: `-${shift}px` }}>
      {children}
    </div>
  )
}
