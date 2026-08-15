# ML Architecture — S40

Derived from spec §9–§12, §23, §35–§55. Same labeling convention as
`ARCHITECTURE.md`: **CONFIRMED** / **PROPOSED** / **UNDECIDED**.

No fusion weights, thresholds beyond the spec's stated prototype values, or
performance numbers are invented in this document.

------------------------------------------------------------------------

## 1. Training philosophy

**CONFIRMED** (spec §35.1, §49): do not train one giant "S40 model." Train
independent models per detection problem and combine outputs only at the
Risk Fusion layer:
1. Transaction fraud model
2. Behaviour/anomaly model
3. Device-risk features/rules
4. Voice/social-engineering model
5. Deterministic rule engine
6. Risk-fusion layer

## 2. Transaction fraud model

**CONFIRMED** (spec §9, §39):
- Model: XGBoost (recommended first), LightGBM as alternative.
- Input: transaction + device + behaviour features (amount,
  transaction_type, amount_deviation, transaction_velocity,
  recipient_novelty, time_of_day, historical_average, historical_maximum,
  device_novelty, location_anomaly).
- Output: `fraud_probability`.
- Training data: PaySim first, then IEEE-CIS for device/identity features
  and generalization testing (spec §36.1, §36.2, §54, §55 Step 1–2).
- Evaluation: Precision, Recall, F1, ROC-AUC, PR-AUC, Confusion Matrix
  (spec §9, §47). Priority order for S40: Recall, Precision, PR-AUC, False
  Positive Rate (spec §47) — missing fraud is costly, but excessive false
  positives erode user trust.

**UNDECIDED**: exact hyperparameters, class-weighting strategy specifics
— spec says "tune class weighting" (§51) without prescribing values.

## 3. Behaviour / anomaly model

**CONFIRMED** (spec §10, §40):
- Model: Isolation Forest initially; Autoencoder as an optional later
  extension.
- Purpose: detect behaviour unusual *for this specific user*, independent
  of whether it resembles fraud in a global/labeled sense.
- Features: amount_deviation, transaction_velocity, recipient_novelty,
  time_deviation, location_deviation, device_novelty.
- Output: `anomaly_score`.
- Must be tested explicitly against the "legitimate high-value user" case
  (spec §38 Scenario F) to confirm it doesn't just flag large amounts.
- Used as an additional signal, never the sole decision-maker.

## 4. Device risk

**CONFIRMED** (spec §41):
- No dedicated model initially — engineered features + deterministic rules.
- Features: new_device, device_age, device_account_count, ip_novelty,
  location_change, impossible_travel, os_change, browser_change.
- Output: `device_risk` (0–1 scale, per spec's `0.82` example).
- A dedicated device-risk model may be introduced later "if sufficient
  labelled data exists" — **UNDECIDED**, not required for this build.

## 5. Voice / social-engineering model

**CONFIRMED** (spec §6.4, §11, §42, §43):
- Pipeline: Audio → Speech-to-Text → text preprocessing → classifier/rules
  → risk attributes → `voice_risk_score`.
- Output attributes: urgency, threat, authority_impersonation,
  financial_request, coercion, (phishing/credential_request in some
  sections) → `overall_voice_risk` / `voice_fraud_score`.
- Training data: TeleAntiFraud-28k, plus S40-specific scripted scenarios
  (bank impersonation, KYC scam, account-block threat, refund scam,
  investment scam, police/authority impersonation, urgent payment
  instruction, credential/OTP request). Synthetic examples must be clearly
  labeled as synthetic, never presented as real recordings (spec §43).
- Spec explicitly recommends against training a large audio model from
  scratch — use a pretrained STT plus a lightweight classifier/rules layer.

**CONFIRMED** (product directive §G): STT and the classifier should
preferentially use local/open-weight components rather than proprietary
inference APIs, chosen on license/accuracy/Indian-language-support/
latency/hardware/deployment feasibility grounds.

**UNDECIDED**: specific STT engine and classifier architecture — neither
the spec nor the directive names one. This must be chosen during the Voice
phase, with the choice and rationale documented here once made.

## 6. Feature engineering & User Risk Profile

**CONFIRMED** (spec §7): unified feature vector
`X = [transaction_features, device_features, behaviour_features, voice_features]`.
Feature computation must be deterministic and testable.

**CONFIRMED** (spec §7): a compact per-user **User Risk Profile** —
normal amount/range, frequent recipients, known devices, typical
locations/times, transaction velocity, historical risk/outcomes — used as
the comparison baseline for deviation-based features. Must be
privacy-minimized (spec §7, §21): not a permanent store of unnecessary
sensitive information.

## 7. Rule engine

**CONFIRMED** (spec §8.1): deterministic rules run alongside ML models,
each with a rule_id, description, severity, score contribution, and
explanation string, e.g.:
```json
{"rule_id": "NEW_DEVICE_HIGH_VALUE", "severity": "high", "score": 25,
 "explanation": "High-value payment initiated from a new device."}
```
Example threshold shown in spec (`amount > historical_average * 5`) is
illustrative, not a fixed production rule — exact rule set and thresholds
are **UNDECIDED** pending calibration.

## 8. Calibration and fusion

**CONFIRMED** (spec §12, §48):
- Individual detectors never directly block a transaction — they produce
  normalized risk signals.
- Fusion inputs: transaction fraud probability, behaviour anomaly score,
  device risk, voice/social-engineering risk, rule risk, contextual/
  user-profile adjustment.
- Must avoid double-counting a feature that influences multiple models
  (e.g. `new_device` affecting both device risk and the fraud model).
- Start with **configurable weighted fusion**, calibrate weights against
  validation scenarios, document methodology, keep configuration outside
  model code (externalized, versioned).
- Output is a structured decision package: `risk_score` (0–100),
  `risk_level`, `risk_factors[]`, `decision` — not a bare number.

**UNDECIDED, explicitly** (spec §12: "not scientifically optimal by
default"): the actual weight values. These must come from calibration
against validation data, not be invented now. Any placeholder weights used
during early integration testing must be clearly labeled as placeholders,
not presented as calibrated.

## 9. Decision thresholds

**CONFIRMED** (spec §13), explicitly labeled prototype thresholds, not
banking-grade:
```
0–30    LOW    → Allow
31–60   MEDIUM → Warn + user choice (Proceed/Cancel)
61–100  HIGH   → Strong confirmation (Confirm it's me / Cancel / Report)
```

## 10. Explainability

**CONFIRMED** (spec §14): SHAP for tabular ML, rule-based explanations,
feature-contribution display, historical comparisons. The explanation
package is generated immediately after fusion and **before** the decision
is shown to the user — the API returns risk score, decision, and
explanation together so the frontend never reconstructs the "why."

## 11. Data science rigor requirements

**CONFIRMED** (spec §45, §46, §52):
- **No label leakage**: never feed `isFraud`/`fraud_label`/post-transaction
  outcome fields into pre-prediction features.
- **Chronological splitting**: sort by timestamp where available; train on
  older data, validate/test on newer data rather than a naive random split.
  Target 70/15/15 train/validation/test. Respect published splits for
  datasets that provide one (e.g. IEEE-CIS official split) rather than
  remixing.
- **No preprocessing fit on test data**: fit only on train, transform
  validation/test.
- **No oversampling before splitting**: oversample the training partition
  only, after the split.
- **Untouched final test set**: used only after model selection and
  threshold tuning are complete.
- **Class imbalance handling**: class weights, oversampling,
  undersampling, threshold tuning, calibration — approach **UNDECIDED**
  until the actual class distribution in the assembled dataset is known.

## 12. Evaluation reporting

**CONFIRMED** (spec §47): report Precision, Recall, F1, PR-AUC, ROC-AUC,
False Positive Rate, False Negative Rate, Confusion Matrix per model and
for the fused system. **Hard rule** (also in `CLAUDE.md`): numbers must
come from actual measured test results — the spec explicitly says "Do not
invent the numbers."

## 13. Model monitoring

**CONFIRMED** (spec §17 "Model Health & Monitoring"): institution dashboard
surfaces model version, precision, recall, F1, false-positive rate,
average inference latency, voice model status, last evaluation timestamp
— sourced from real evaluation/inference metadata, clearly labeled as
prototype/demo metrics, not production guarantees.

## 14. Repository layout for ML

**CONFIRMED** (spec §50):
```
ml/
├── data/{raw/{paysim,ieee_cis,teleantifraud},processed,synthetic}
├── features/{transaction,behaviour,device,voice}_features.py
├── training/{train_fraud,train_anomaly,train_voice,evaluate}.py
├── models/{fraud_xgb.json, anomaly.pkl, voice_classifier/}
├── explainability/shap_explainer.py
└── inference/predict.py
```
Raw data is stored outside Git (spec §51 checklist item).

## 15. Dataset licensing

**CONFIRMED** (spec §36.3, §51): license/usage-terms verification for
PaySim, IEEE-CIS, and TeleAntiFraud-28k is required before use, and must
happen before any dataset or derived model appears in a public submission.
**Status: not yet performed** — flagged as an open item, not yet actioned
in this foundation phase.

------------------------------------------------------------------------

## Summary of open ML items requiring a decision

- Fusion weights and calibration methodology (needs validation data).
- Rule-engine thresholds beyond the spec's illustrative examples.
- STT engine and voice classifier architecture (local/open-weight,
  specific choice pending).
- Class-imbalance handling technique (pending actual data distribution).
- Dataset license verification (PaySim, IEEE-CIS, TeleAntiFraud-28k).
