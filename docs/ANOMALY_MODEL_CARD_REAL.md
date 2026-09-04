# S40 Behaviour Anomaly Model (Real-Data) — Model Card

**Model:** `s40_behaviour_anomaly_real`
**Version:** `v20260904-054147`
**Trained at:** 2026-09-04 (real-data retraining pass, feature set revised
same day — see §5)
**Artifact:** `ml/models/anomaly_real/v20260904-054147/`

> Distinct from `s40_behaviour_anomaly` (untouched, synthetic-only,
> per-user). Same recipient-centric reasoning as
> `FRAUD_MODEL_CARD_REAL.md` §1 — read that first.

---

## 1. Purpose

Isolation Forest, unsupervised, trained on non-fraud rows only. Answers
"is this unusual for what THIS RECIPIENT normally receives" — not a
classification claim; labels are used only to exclude fraud rows before
fitting and to check separation afterward. PROTOTYPE, not evidence of
real-world accuracy.

## 2. Dataset — same blend as the fraud model

Indian Online Scam (real, primary) + PaySim (real, capped 150,000 rows) +
S40 synthetic (minority, ~15%). See `FRAUD_MODEL_CARD_REAL.md` §3 for the
full caveats on both real sources (PaySim is simulator output; the Indian
dataset is likely a constructed/practice dataset, not organic logs).

## 3. Features — REVISED 2026-09-04 (3 features, not 6)

`amount_log`, `recipient_amount_zscore`, `recipient_amount_vs_average`.

**This is a correction made during this same session, kept visible rather
than silently fixed.** The first version of this model additionally
included `recipient_transactions_last_10m`, `recipient_transactions_last_1h`,
and `recipient_time_of_day_deviation` — all three unconditionally null for
every PaySim row (PaySim has no wall-clock timestamp). Isolation Forest
cannot accept NaN, so the "all features present" scorability requirement
excluded PaySim from training AND evaluation entirely:

| | First version (6 features) | This version (3 features) |
|---|---:|---:|
| PaySim scorable test rows | **0 / 4,042** | 286 / 4,042 |
| Indian scorable test rows | 77 / 165 | 140 / 165 |
| Synthetic share of all scorable test rows | 96.7% | 83.9% |
| Aggregate test ROC-AUC | 0.957 | **0.736** |

The first version's headline 0.957 ROC-AUC was almost entirely a synthetic-
data number dressed as a "real-data" model. This version's honestly lower
0.736 actually reflects real data — reported here in place of the better-
looking but misleading first number, not alongside it as if both were
equally valid.

Excludes `new_recipient`/`recipient_prior_count`, matching the reasoning
`ml/training/anomaly_model.py` already applies to `profile_is_cold`/
`user_transaction_count` on the original model: those describe HOW MUCH
history exists, not how the transaction itself behaves — cold start is
handled by refusing to score, not by feeding the model a history-volume
flag.

## 4. Configuration — CONFIRMED

Isolation Forest: `n_estimators=300`, `max_samples="auto"`,
`contamination="auto"`, seed=40. No hyperparameter search (unsupervised
detector, matching the original model's own precedent). Training rows:
scorable, non-fraud rows of the blended train split.

## 5. Score normalization — CONFIRMED

Same percentile-based [0,1] mapping as the original model
(`ml/training/anomaly_model.py`'s `ScoreNormalizer`): 5th/99.5th
percentile of the training distribution. Scale normalization, not
probability calibration.

## 6. Metrics — CONFIRMED, measured (never estimated)

### 6.1 Validation
Rows 41,402 · scorable 2,888 (up from 1,854 in the first, 6-feature
version) · positives among scorable 154. **ROC-AUC 0.788**, **PR-AUC
0.198**.

### 6.2 Test
Rows 8,207 · scorable 2,644 · positives among scorable 181. **ROC-AUC
0.736**, **PR-AUC 0.231**. Mean score, fraud rows: 0.454. Mean score,
normal rows: 0.291.

### 6.3 Per-source breakdown on test — the honest picture

| Source | Rows | Scorable | Positives (scorable) | ROC-AUC | PR-AUC |
|---|---:|---:|---:|---:|---:|
| Indian Online Scam | 165 | 140 | 35 | **0.466** | 0.250 |
| PaySim | 4,042 | 286 | **0** | n/a — no fraud in this slice | n/a |
| S40 synthetic | 4,000 | 2,218 | 146 | 0.753 | 0.267 |

**Read this plainly:** the aggregate 0.736 ROC-AUC is still
synthetic-majority (2,218 of 2,644 scorable rows, 83.9%). The Indian
dataset's own separation is **at chance** (0.466 — below the 0.5 no-skill
line), on a small sample (140 scorable rows, 35 positive) — directional at
best, not a demonstrated real-data separation result. PaySim's extreme
rarity (0.086% fraud rate) meant zero fraud rows landed in its 286
scorable test rows in this particular split, so no PaySim-only separation
number exists to report.

## 7. What this does and does not establish

**Establishes:** the feature-set fix materially improved real-data
coverage (PaySim scorability 0%→7.1%, Indian 47%→85%) and stopped the
model's headline number from being an almost-pure synthetic-data artifact.

**Does NOT establish:** that this anomaly detector meaningfully separates
fraud from normal behaviour on either real source individually. The
Indian result is chance-level and the PaySim result is unmeasured (no
positives in the scorable slice). The synthetic-data separation (ROC-AUC
0.753) remains the only well-supported number here, same caveat the
original synthetic-only anomaly card already carries.

## 8. Cold start / scorability

Unscorable rows (missing `recipient_amount_zscore`/`recipient_amount_vs_average`
because the recipient has <5 prior transactions) are refused a score, not
assigned a default — same policy as the original model. Test: 5,563 of
8,207 rows (67.8%) unscorable, dominated by PaySim (3,756 of 4,042 PaySim
test rows).

## 9. What is NOT recorded

- No Scenario-F-style (legitimate-high-value vs. amount-heavy-fraud)
  separation check was re-run for this model — the original card's §12
  used S40 synthetic-only data for that check; re-running it against this
  blend was not done given the more pressing per-source coverage issue
  fixed in §3.
- No inference-latency benchmark.

## 10. Reproducibility

```bash
python -m ml.training.train_anomaly_real
```

Fixed seed 40. Same data dependencies as the fraud-real model.

## 11. Limitations — CONFIRMED

PROTOTYPE. Same dataset caveats as `FRAUD_MODEL_CARD_REAL.md` §3.
Real-data separation is honestly weak-to-unmeasured per source (§6.3) —
this model's aggregate metrics should not be read as validated on real
data; they are majority-synthetic. Recommended as a starting point for
further real-data collection (more Indian-dataset rows, or a PaySim slice
with more fraud-positive coverage) rather than as a finished result.
