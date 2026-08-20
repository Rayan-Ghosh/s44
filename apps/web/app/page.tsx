import type { Metadata } from "next"

import "./cinematic.css"
import { Stage } from "@/components/cinematic/stage"

/**
 * AVARAN — the cinematic landing.
 *
 * A single ₹1 coin on a black stage, orbited by a scroll-driven camera across
 * thirteen beats: what Avaran does, the four kinds of evidence it reads, how
 * they fuse into one score, the held payment itself, what happens when it is
 * wrong, the institutional view, and where it ends.
 *
 * The coin is the argument, not decoration. It is the smallest unit of the
 * thing being protected — the page's whole claim is that the money is still
 * yours, and that you still have a few seconds to think.
 *
 * Everything is client-side: the stage is WebGL and the narrative is driven by
 * a smoothed scroll signal. See components/cinematic/stage.tsx.
 */
export const metadata: Metadata = {
  title: "Avaran — holds the payment while you think",
  description:
    "A real-time fraud-risk shield for UPI payments. Four independent signals read every payment, combine into one explainable score, and hold it — while the money is still yours to cancel.",
}

export default function Home() {
  return <Stage />
}
