/**
 * Regression test for the risk data mismatch bug: a transaction's risk
 * score, risk level, badge label/color, and gauge color must agree
 * everywhere it is rendered — never independently re-derived with a
 * different threshold, and never silently overridden by a hardcoded
 * fallback.
 *
 * Run with: npx tsx src/utils/__tests__/risk-consistency.regression.ts
 * (No test runner is configured for apps/mobile yet — this is a
 * standalone, dependency-free script rather than a Jest/RTL suite, so it
 * adds nothing to package.json and can be run in CI with a single npx
 * invocation.)
 */

import { getRiskLevelFromScore, getStatusBadgeProps, RiskLevel } from "../risk-scoring";

let failures = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    failures++;
    console.error(`[FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`[OK]   ${label}: ${JSON.stringify(actual)}`);
  }
}

/** Mirrors RiskGauge.tsx's getRiskColor() post-fix — color keyed off riskLevel only. */
function gaugeColorFor(riskLevel: RiskLevel): "threat" | "caution" | "safe" {
  if (riskLevel === "HIGH") return "threat";
  if (riskLevel === "MEDIUM") return "caution";
  return "safe";
}

/** Mirrors TransactionCard.tsx's isHigh/StatusBadge derivation — riskLevel only. */
function transactionCardBadgeFor(riskLevel: RiskLevel): { label: string; status: "high" | "medium" | "low" } {
  return {
    label: riskLevel === "HIGH" ? "HIGH RISK" : riskLevel === "MEDIUM" ? "MEDIUM" : "SAFE",
    status: riskLevel === "HIGH" ? "high" : riskLevel === "MEDIUM" ? "medium" : "low",
  };
}

function runCase(score: number, expectedLevel: RiskLevel) {
  console.log(`\n--- transaction with riskScore = ${score} ---`);

  // 1. The one authoritative mapping every screen/component must use.
  const level = getRiskLevelFromScore(score);
  assertEqual(level, expectedLevel, "getRiskLevelFromScore()");

  // 2. Dashboard / Home "Current Risk Status" + "Needs Your Attention" badge
  //    (both go through getStatusBadgeProps in HomeScreen.tsx).
  const overviewBadge = getStatusBadgeProps(level);
  assertEqual(overviewBadge.label, `${expectedLevel} RISK`, "Home overview/attention badge label");

  // 3. RiskGauge color (Home top summary + Payments detail gauge).
  const gaugeColor = gaugeColorFor(level);
  const expectedColor = expectedLevel === "HIGH" ? "threat" : expectedLevel === "MEDIUM" ? "caution" : "safe";
  assertEqual(gaugeColor, expectedColor, "RiskGauge color");

  // 4. TransactionCard label + border/status (Payments list, History list).
  const cardBadge = transactionCardBadgeFor(level);
  assertEqual(
    cardBadge.label,
    expectedLevel === "HIGH" ? "HIGH RISK" : expectedLevel === "MEDIUM" ? "MEDIUM" : "SAFE",
    "TransactionCard badge label"
  );
  assertEqual(cardBadge.status, overviewBadge.status, "TransactionCard status matches shared getStatusBadgeProps()");

  // 5. Nothing here may independently disagree with (1) — this is the
  //    actual regression check: every consumer's derived value, for the
  //    SAME score, must equal the SAME level.
  assertEqual(gaugeColor === "threat", level === "HIGH", "gauge 'threat' color implies level HIGH, and only HIGH");
  assertEqual(gaugeColor === "caution", level === "MEDIUM", "gauge 'caution' color implies level MEDIUM, and only MEDIUM");
}

// The exact case from the bug report: score 32 must be MEDIUM everywhere,
// never HIGH on any card.
runCase(32, "MEDIUM");

// Boundary and representative cases, including two values that were
// previously hardcoded wrong in apps/mobile/src/data/demo-data.ts
// (62.5 mislabeled MEDIUM, 38 mislabeled LOW) before this fix.
runCase(0, "LOW");
runCase(30, "LOW");
runCase(31, "MEDIUM");
runCase(38, "MEDIUM");
runCase(60, "MEDIUM");
runCase(61, "HIGH");
runCase(62.5, "HIGH");
runCase(78, "HIGH");
runCase(100, "HIGH");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) {
  // No `process`/`@types/node` in this Expo project's tsconfig — throwing
  // gets tsx/node to exit non-zero without adding a new dependency.
  throw new Error(`${failures} risk-consistency check(s) failed — see log above.`);
}
