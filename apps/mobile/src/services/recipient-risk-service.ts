/**
 * ADVISORY-ONLY, OFFLINE-FALLBACK local inference using the real-data
 * model exported to ONNX (ml/export/to_onnx.py — s40_transaction_fraud_real,
 * see docs/FRAUD_MODEL_CARD_REAL.md).
 *
 * THIS IS NOT AN AUTHORITATIVE RISK SIGNAL. RiskService.evaluateTransaction
 * (POST /api/v1/risk/evaluate) and PaymentService's calls into
 * /api/v1/payments/{id}/analyse remain the ONLY authoritative source of
 * truth — this repo's own doctrine (see risk-service.ts's docstring: "No
 * client-side risk heuristics") and the AVARAN PAY backend spec both
 * require it. This service exists only so the app has SOMETHING to show
 * when there is no network, clearly labeled as a local estimate, and it
 * must never gate, block, or silently substitute for the real risk call.
 *
 * SCALE WARNING: the ONNX export carries the RAW, uncalibrated XGBoost
 * output (isotonic calibration doesn't have a standard ONNX op — see
 * ml/export/to_onnx.py's docstring). Raw and calibrated probabilities are
 * NOT on the same scale (raw ECE 0.124 vs calibrated 0.0044 per the model
 * card). Do not compare this score numerically against anything the
 * backend returns; treat it only as "elevated" vs "not elevated" against
 * its own bundled threshold metadata.
 *
 * FEATURE APPROXIMATION: the model was trained on RECIPIENT-wide history
 * (every sender's prior payments to a merchant/handle — see
 * ml/features/recipient_features.py). This device only has THIS user's own
 * cached transaction history, so `recipient_prior_count` etc. here reflect
 * "how many times I have paid this recipient", not the true cross-user
 * signal the model learned from. A real, stated approximation, not
 * silently glossed over.
 *
 * REQUIRES A NATIVE BUILD: onnxruntime-react-native ships native code and
 * does not run under Expo Go — `expo run:android` / `expo run:ios` (or an
 * EAS dev-client build) is required. Not verified on-device in this
 * change; verify manually before relying on it.
 */

import { Asset } from "expo-asset";
import { InferenceSession, Tensor } from "onnxruntime-react-native";
import { UserTransaction } from "./payment-service";

// Keep in exact sync with ml/features/recipient_features.py's
// RECIPIENT_MODEL_FEATURE_NAMES — order matters, the ONNX graph has no
// column-name binding, only positional input.
const FEATURE_ORDER = [
  "amount",
  "amount_log",
  "recipient_amount_zscore",
  "recipient_amount_vs_average",
  "recipient_prior_count",
  "new_recipient",
  "recipient_transactions_last_10m",
  "recipient_transactions_last_1h",
  "recipient_time_of_day_deviation",
] as const;

const MIN_HISTORY = 5;

export interface LocalRiskEstimate {
  elevated: boolean;
  fraudProbabilityRaw: number;
  scorable: boolean;
  source: "local-onnx-advisory";
}

let sessionPromise: Promise<InferenceSession> | null = null;

async function getSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const asset = Asset.fromModule(require("../../assets/models/fraud_real.onnx"));
      await asset.downloadAsync();
      if (!asset.localUri) {
        throw new Error("fraud_real.onnx asset has no local URI after download.");
      }
      return InferenceSession.create(asset.localUri);
    })();
  }
  return sessionPromise;
}

/** Builds the 9 features from THIS device's cached transaction history
 * only (see module docstring's "FEATURE APPROXIMATION" note). */
function buildLocalFeatures(
  amount: number,
  recipientMerchant: string,
  history: UserTransaction[],
  now: Date
): Record<(typeof FEATURE_ORDER)[number], number | null> {
  const priorToRecipient = history
    .filter((t) => t.merchant === recipientMerchant)
    .map((t) => ({ amount: t.amount, timestamp: new Date(t.timestamp) }))
    .filter((t) => t.timestamp.getTime() < now.getTime());

  const count = priorToRecipient.length;
  const amounts = priorToRecipient.map((t) => t.amount);

  let zscore: number | null = null;
  let vsAverage: number | null = null;
  if (count >= MIN_HISTORY) {
    const mean = amounts.reduce((a, b) => a + b, 0) / count;
    const variance = amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / count;
    const std = Math.sqrt(variance);
    vsAverage = mean > 1e-9 ? amount / mean : null;
    zscore = std > 1e-9 ? (amount - mean) / std : null;
  }

  const last10m = priorToRecipient.filter(
    (t) => (now.getTime() - t.timestamp.getTime()) / 1000 <= 600
  ).length;
  const last1h = priorToRecipient.filter(
    (t) => (now.getTime() - t.timestamp.getTime()) / 1000 <= 3600
  ).length;

  let timeDeviation: number | null = null;
  if (count >= MIN_HISTORY) {
    const hourCounts = new Array(24).fill(0);
    for (const t of priorToRecipient) hourCounts[t.timestamp.getHours()] += 1;
    const total = hourCounts.reduce((a, b) => a + b, 0);
    timeDeviation = total > 0 ? 1 - hourCounts[now.getHours()] / total : null;
  }

  return {
    amount,
    amount_log: Math.log1p(Math.max(amount, 0)),
    recipient_amount_zscore: zscore,
    recipient_amount_vs_average: vsAverage,
    recipient_prior_count: count,
    new_recipient: count === 0 ? 1 : 0,
    recipient_transactions_last_10m: last10m,
    recipient_transactions_last_1h: last1h,
    recipient_time_of_day_deviation: timeDeviation,
  };
}

export class RecipientRiskService {
  /** Best-effort, offline-safe local estimate. Returns null on any
   * failure (missing native module, model not bundled, etc.) rather than
   * throwing — callers must treat this as optional, never required. */
  static async estimateLocally(
    amount: number,
    recipientMerchant: string,
    history: UserTransaction[]
  ): Promise<LocalRiskEstimate | null> {
    try {
      const session = await getSession();
      const now = new Date();
      const features = buildLocalFeatures(amount, recipientMerchant, history, now);

      // XGBoost's native NaN handling has no ONNX-side equivalent here;
      // missing values are passed as 0, a documented approximation (a
      // cold-start recipient's zscore/vs_average/time_deviation become 0
      // instead of "unknown" — acceptable for an advisory-only signal,
      // not for anything authoritative).
      const values = new Float32Array(FEATURE_ORDER.map((name) => features[name] ?? 0));
      const scorable = features.recipient_amount_zscore !== null;

      const tensor = new Tensor("float32", values, [1, FEATURE_ORDER.length]);
      const results = await session.run({ input: tensor });
      const outputName = Object.keys(results)[1] ?? Object.keys(results)[0];
      const probTensor = results[outputName];
      // Binary classifier output is [P(class0), P(class1)] per row.
      const fraudProbabilityRaw = Number(probTensor.data[1] ?? probTensor.data[0]);

      return {
        elevated: fraudProbabilityRaw > 0.5,
        fraudProbabilityRaw,
        scorable,
        source: "local-onnx-advisory",
      };
    } catch {
      // Native module unavailable, asset missing, or any other failure —
      // this signal is optional. Never surface an error for it.
      return null;
    }
  }
}
