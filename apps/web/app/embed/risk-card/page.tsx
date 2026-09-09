import type { Metadata } from "next"
import { Suspense } from "react"

import { RiskDecisionCard } from "@/app/design-system/risk-card-preview/risk-card-preview"
import { OffsetShift } from "./offset-shift"

/**
 * Embed target for the landing page's phone frames. Renders the real
 * <RiskDecisionCard /> and nothing else.
 *
 * WHY A ROUTE AND NOT A DIRECT MOUNT
 * The first attempt mounted the component directly inside a 390px-wide,
 * CSS-scaled div. It rendered the real component — but at the WRONG layout:
 * Tailwind's responsive prefixes are media queries, and a media query resolves
 * against the browser viewport, not against the box the component happens to
 * sit in. On a 1440px screen the card inside the phone frame was therefore
 * laying out with `sm:` and `md:` rules active, i.e. the desktop composition
 * crushed into a phone-width column. The gauge sat beside its caption instead
 * of above it, and the callout text broke two words to a line.
 *
 * That is worse than a mockup image, because it looks like a live render and
 * quietly misrepresents the product. An iframe gets its own viewport, so the
 * card's own breakpoints resolve at 390px exactly as they do on a handset —
 * still one implementation, still impossible to drift, and now actually the
 * phone layout it claims to be.
 *
 * The `y` search param offsets the embedded screen so the three phone frames
 * show three depths of ONE real screen — the decision, the breakdown, the
 * choice — instead of the same top-of-screen three times.
 *
 * It is a NEGATIVE MARGIN, not a scroll. The first version ran an inline
 * `window.scrollTo` after the markup; measured over six loads (three of them
 * at 6x CPU throttle and 900kbps) it applied correctly every time, so it was
 * not in fact the bug it looked like. It is still the wrong mechanism: a
 * scroll is a runtime side effect that depends on layout having settled before
 * the script parses, silently clamps if the document is shorter than expected,
 * and leaves the offset invisible to anything reading the server render. A
 * margin is a render-time fact — no script, no ordering, nothing to clamp.
 *
 * Not linked from anywhere and noindex: this is scaffolding, not a page.
 *
 * CACHING — this route is identical for every viewer at a given `y`
 * (RiskDecisionCard's numbers are the fixed illustrative FUSION constant,
 * not live/per-user data — see risk-card-preview.tsx), and it only changes
 * when someone edits that copy or those numbers. Originally the page read
 * `searchParams` directly, which forces Next to render it dynamically on
 * every single request (confirmed via `next build`'s route list: this was
 * the only `ƒ Dynamic` route in the app, next to five fully `○ Static`
 * ones) — real cost for a route meant to sit in three iframes on the
 * highest-traffic page in the app. The `y` offset is the one thing that
 * legitimately varies per embed, so it now lives in OffsetShift, a small
 * client component reading useSearchParams() inside a Suspense boundary.
 * That's the only per-request "hole"; the page around it has nothing left
 * that depends on the request, so Next prerenders it once at build time
 * and serves that same cached HTML for every `y` — regenerating only on
 * the next deploy that changes this file or RiskDecisionCard.
 */
export const metadata: Metadata = {
  title: "Avaran — risk decision card (embed)",
  robots: { index: false, follow: false },
}

export default function RiskCardEmbedPage() {
  return (
    // Forced dark, via the `.dark` class rather than the theme provider.
    // This route exists only to be framed inside the cinematic landing, and a
    // phone screen that flips between light and dark with the viewer's OS
    // would break the composition it sits in. The product's own preview at
    // /design-system/risk-card-preview is untouched and stays light-first.
    <div className="dark">
      <div className="bg-background min-h-dvh overflow-hidden">
        <Suspense fallback={<div className="p-4">
          <RiskDecisionCard />
        </div>}>
          <OffsetShift>
            <RiskDecisionCard />
          </OffsetShift>
        </Suspense>
      </div>
    </div>
  )
}
