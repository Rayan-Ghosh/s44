import type { Metadata } from "next"

import { DesignSystemView } from "./design-system-view"

export const metadata: Metadata = {
  title: "Avaran — Design System",
  description:
    "Token reference for the Avaran design system. Not a product page.",
}

export default function DesignSystemPage() {
  return <DesignSystemView />
}
