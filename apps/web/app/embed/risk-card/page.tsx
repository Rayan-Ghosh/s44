import type { Metadata } from "next"

import { RiskDecisionCard } from "@/app/design-system/risk-card-preview/risk-card-preview"

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
 */
export const metadata: Metadata = {
  title: "Avaran — risk decision card (embed)",
  robots: { index: false, follow: false },
}

export default async function RiskCardEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>
}) {
  const { y } = await searchParams
  const offset = Number.parseInt(y ?? "0", 10)

  const shift = Number.isFinite(offset) && offset > 0 ? offset : 0

  return (
    // Forced dark, via the `.dark` class rather than the theme provider.
    // This route exists only to be framed inside the cinematic landing, and a
    // phone screen that flips between light and dark with the viewer's OS
    // would break the composition it sits in. The product's own preview at
    // /design-system/risk-card-preview is untouched and stays light-first.
    <div className="dark">
      <div className="bg-background min-h-dvh overflow-hidden">
        <div className="p-4" style={{ marginTop: `-${shift}px` }}>
          <RiskDecisionCard />
        </div>
      </div>
    </div>
  )
}
