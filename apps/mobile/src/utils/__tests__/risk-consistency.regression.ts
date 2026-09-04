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

// =========================================================================
// PART 1: EXACT RISK THRESHOLD BOUNDARY TESTS
// Rules:
//   0–30   = LOW
//   31–60  = MEDIUM
//   61–100 = HIGH
// The HIGH threshold must be 61, not 60.
// =========================================================================
console.log("\n================ PART 1 BOUNDARY CHECKS ================");
runCase(0, "LOW");      // Boundary: minimum LOW
runCase(30, "LOW");     // Boundary: maximum LOW (score 30 -> LOW)
runCase(31, "MEDIUM");  // Boundary: minimum MEDIUM (score 31 -> MEDIUM)
runCase(38, "MEDIUM");  // Representative MEDIUM
runCase(60, "MEDIUM");  // Boundary: maximum MEDIUM (score 60 -> MEDIUM)
runCase(61, "HIGH");    // Boundary: minimum HIGH (score 61 -> HIGH, not 60)
runCase(62.5, "HIGH");  // Representative HIGH
runCase(78, "HIGH");    // Representative HIGH
runCase(100, "HIGH");   // Boundary: maximum HIGH (score 100 -> HIGH)

// =========================================================================
// PART 4A: HISTORY DETAIL RISK CLASSIFICATION CHECKS
// Rules:
//   Score 30 → LOW
//   Score 31 → MEDIUM
//   Score 60 → MEDIUM
//   Score 61 → HIGH
//   Score 75 → HIGH (previously hardcoded >= 75 cutoff now uses getRiskLevelFromScore)
// =========================================================================
console.log("\n================ PART 4A HISTORY DETAIL CHECKS ================");
function historyRiskEngineDecision(score: number): "Confirm / Cancel Flag" | "Standard Allow" {
  return getRiskLevelFromScore(score) === "HIGH" ? "Confirm / Cancel Flag" : "Standard Allow";
}

assertEqual(getRiskLevelFromScore(30), "LOW", "History Score 30 -> LOW");
assertEqual(historyRiskEngineDecision(30), "Standard Allow", "History Score 30 Decision -> Standard Allow");

assertEqual(getRiskLevelFromScore(31), "MEDIUM", "History Score 31 -> MEDIUM");
assertEqual(historyRiskEngineDecision(31), "Standard Allow", "History Score 31 Decision -> Standard Allow");

assertEqual(getRiskLevelFromScore(60), "MEDIUM", "History Score 60 -> MEDIUM");
assertEqual(historyRiskEngineDecision(60), "Standard Allow", "History Score 60 Decision -> Standard Allow");

assertEqual(getRiskLevelFromScore(61), "HIGH", "History Score 61 -> HIGH");
assertEqual(historyRiskEngineDecision(61), "Confirm / Cancel Flag", "History Score 61 Decision -> Confirm / Cancel Flag");

assertEqual(getRiskLevelFromScore(75), "HIGH", "History Score 75 -> HIGH");
assertEqual(historyRiskEngineDecision(75), "Confirm / Cancel Flag", "History Score 75 Decision -> Confirm / Cancel Flag");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) {
  // No `process`/`@types/node` in this Expo project's tsconfig — throwing
  // gets tsx/node to exit non-zero without adding a new dependency.
  throw new Error(`${failures} risk-consistency check(s) failed — see log above.`);
}
