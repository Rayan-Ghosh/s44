import type { Metadata } from "next"

import { InstitutionDashboard } from "@/components/institution/institution-dashboard"

/**
 * The institution-facing security dashboard: overview counts, a live risk
 * feed, per-alert detail, and the false-positive review queue.
 *
 * Data is mocked in lib/institution/mock-dashboard.ts — no institution API
 * exists yet (apps/api/app/api/routers/alerts.py is read-only today, with
 * no review-workflow endpoints). Every component here takes its data as
 * props; nothing below this page reaches into the mock module directly
 * except institution-dashboard.tsx.
 */
export const metadata: Metadata = {
  title: "Avaran — institution dashboard",
  description:
    "Live risk feed, alert detail, and false-positive review for institutions running Avaran's fraud-risk shield.",
}

export default function InstitutionPage() {
  return <InstitutionDashboard />
}
