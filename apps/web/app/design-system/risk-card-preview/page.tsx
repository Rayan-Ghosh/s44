import type { Metadata } from "next"

import { RiskCardPreview } from "./risk-card-preview"

export const metadata: Metadata = {
  title: "Avaran — Risk decision card preview",
  description:
    "Design-critique surface for the payment risk-decision card. Not the product page.",
}

export default function RiskCardPreviewPage() {
  return <RiskCardPreview />
}
