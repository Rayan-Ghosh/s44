# S40 Behaviour Anomaly Model — Model Card

> **Regenerated.** This card was reconstructed after the original was
> accidentally deleted (untracked file, lost to `git clean -f`). Every
> number below is read directly from
> `ml/models/anomaly/v20260815-121311/metadata.json` and
> `feature_manifest.json` — nothing has been re-estimated or guessed.

**Model:** `s40_behaviour_anomaly`
**Version:** `v20260815-121311`
**Trained at:** 2026-08-15T12:13:11.923693+00:00 (UTC)
**Git commit at training time:** `c5d47e4`
**Python:** 3.13.7

> Note: `metadata.json` also records `xgboost_version: 3.4.1`. This is a
> quirk of the shared artifact metadata builder (`ml/registry/artifact.py`
> always stamps the installed XGBoost version regardless of which library
> the model actually uses) — **this model is an Isolation Forest
> (scikit-learn), not XGBoost.** Recorded here so the field isn't
> misread as a modelling claim.

---

## 1. Purpose — CONFIRMED (from `caveats`/`dataset_notes`, verbatim)

> "PROTOTYPE — NOT A PRODUCTION BANKING MODEL. Trained only on S40
> synthetic data, because no public dataset supports S40's per-user
> behavioural features: PaySim has ~0.15% repeat originators (every row
> is a cold start), ULB publishes no cardholder identifier, and IEEE-CIS
> is licence-blocked. Reported separation therefore measures behaviour
> the S40 generator produced, not real-world anomaly-detection
> performance."

This model emits **`anomaly_score` only** (or a refusal) — never a risk
score, risk level, or decision.

## 2. Dataset — CONFIRMED

`datasets: ["s40_synthetic"]`.

## 3. Split — CONFIRMED (`split_report`)

Identical chronological split to the fraud model (same pipeline, same
config seed 40): 70/15/15 by `timestamp`.

| Split | Rows | Positives | Positive rate | Users | Period |
|---|---|---|---|---|---|
| Train | 14,872 | 539 | 3.62% | 629 | 2026-01-05 12:44 → 2026-05-02 17:22 |
| Validation | 3,187 | 114 | 3.58% | 253 | 2026-05-02 17:25 → 2026-05-25 17:52 |
| Test | 3,188 | 147 | 4.61% | 184 | 2026-05-25 18:02 → 2026-07-19 18:03 |

Same `entity_overlap_warnings` as the fraud model (133 train/validation,
24 train/test, 133 validation/test user overlaps — expected for a
per-user chronological split).

## 4. Features — CONFIRMED (`feature_manifest.json`, 9 features)

`amount_zscore`, `amount_vs_average`, `recipient_seen_before`,
`recipient_frequency`, `time_of_day_deviation`,
`seconds_since_last_transaction`, `transactions_last_10m`,
`transactions_last_1h`, `location_deviation`. Manifest version
`anomaly-1.0.0`.

**Deliberately excluded** (recorded in the manifest):
- **Device features** — "device risk is a separate detector (spec §41)".
- **`profile_is_cold` / `user_transaction_count`** — "describe history
  volume, not behaviour; cold start is handled by refusing to score".

## 5. Model configuration — CONFIRMED (`hyperparameters`)

**Isolation Forest**: `n_estimators=300`, `max_samples="auto"`,
`contamination="auto"`, `seed=40`. `trained_on`: "scorable non-fraud rows
of the train split". `scale_pos_weight` and `best_iteration` are both
`null` in the metadata — not applicable to this model type.

**Training rows:** 11,234 (scorable, non-fraud rows of the 14,872-row
train split). `fit_seconds = 0.3784`.

**Hyperparameter search:** none performed — `hyperparameter_search`
records `{"skipped": "unsupervised detector; no search performed"}`.

## 6. Score normalization — CONFIRMED (`metrics.score_normalizer`,
`calibration`)

Raw Isolation Forest output is unbounded and model-specific. It is mapped
onto `[0, 1]` using percentiles of the training distribution:
`low = 0.35144` (5th percentile), `high = 0.68304` (99.5th percentile).

The metadata's own `calibration.rationale`, verbatim:

> "Isolation Forest emits an unbounded, model-specific score. It is
> mapped onto [0,1] using the 5th/99.5th percentiles of the training
> distribution so the value is stable across retrains and usable by
> fusion. **This is scale normalization, NOT probability calibration —
> the output is not a probability and must not be read as one.**"

`raw_ece` and `calibrated_ece` are both `null` in the metadata — ECE is
not applicable to a non-probabilistic score. `selected_threshold` is
recorded as the sentinel value `-1.0`: **this detector defines no
operating threshold** — refer to `AnomalyPrediction.scorable` instead of
a probability cutoff.

## 7. Metrics — CONFIRMED, measured (never estimated)

These are **separation** measurements, not classification claims — the
model was fitted with no access to labels; labels are used only (a) to
exclude fraud rows before fitting and (b) afterwards, to check whether
"unusual for this user" correlates with "labelled fraudulent".

### 7.1 Validation
Rows 3,187 · scorable 2,587 · **unscorable (cold-start) 600** ·
positives among scorable 114. Mean score **0.2320**.
**ROC-AUC 0.9517**, **PR-AUC 0.6703**. Mean score, fraud rows: **0.8736**.
Mean score, normal rows: **0.2025**.

### 7.2 Test
Rows 3,188 · scorable 2,887 · **unscorable (cold-start) 301** ·
positives among scorable 147. Mean score **0.2219**.
**ROC-AUC 0.9583**, **PR-AUC 0.6662**. Mean score, fraud rows: **0.8764**.
Mean score, normal rows: **0.1868**.

Both metrics were computed once each on validation and test; the metadata
does not indicate the test split was used for any tuning decision (no
search or threshold selection is recorded for this model at all — see §5
and §6).

## 8. Cold start — CONFIRMED (behaviour, from `ml/training/anomaly_model.py`
docstring, not a metadata field but directly observable in the code this
task was permitted to read)

A user without a full behavioural baseline is **refused a score**, not
assigned an imputed or default one. The unscorable counts above (600 of
3,187 validation rows; 301 of 3,188 test rows) quantify how often this
refusal occurs on the synthetic evaluation data.

## 9. What is NOT recorded in this artifact

- No hyperparameter search was performed, so there is no alternative
  configuration to compare against (recorded as skipped, §5).
- No per-scenario breakdown of anomaly scores is stored **in the
  artifact**. One has since been measured and is recorded in §12 (spec
  §38 Scenario F); those numbers live in this document only.
- No inference latency benchmark is stored.
- No claim of real-world separation performance — see §1.

## 10. Reproducibility — PROPOSED (command, not itself a stored metric)

```bash
python -m ml.training.train_anomaly
```

Fixed seed 40 (`metadata.seed`). Re-running will generate a **new**
timestamped version, not necessarily identical to `v20260815-121311`
unless the same synthetic generator config and library versions are used.

## 11. Limitations — CONFIRMED (from `dataset_notes`/`caveats`)

Trained only on S40 synthetic data. No public dataset supports S40's
per-user behavioural features under the project's current data holdings:
PaySim has ~0.15% repeat originators (near-total cold start), ULB
publishes no cardholder identifier, and IEEE-CIS remains licence-blocked.
Reported separation measures behaviour the synthetic generator produced,
not real-world anomaly-detection performance.

## 12. Spec §38 Scenario F — CONFIRMED, measured 2026-08-16

**Question:** does a *legitimate* high-value transaction get flagged as
anomalous merely because it is large?

**Status:** measured, not stored in the artifact. Scored the shipped
`v20260815-121311` model over the synthetic data through the real
inference path (`BehaviourAnomalyDetector.predict_batch`), honouring the
cold-start refusal — unscorable rows are counted, never forced to a score.
Generator config matches the artifact's `training_config.synthetic`
(seed 40, users 800, history_per_user 25).

Population: **scenario rows only** (`is_history == False`) — the rows where
a scenario actually manifests. Primary figures are **held-out
(validation + test)**; the train split is reported separately as in-sample.

### 12.1 Group comparison — held-out (validation + test), 419 scenario rows

| Group | n | scored | refused | mean | median | ≥0.3 | ≥0.5 | ≥0.7 | ≥0.9 | mean amount | mean `amount_zscore` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **LEGITIMATE_HIGH_VALUE** | 31 | 31 | 0 | **0.494** | 0.469 | 1.00 | 0.39 | 0.03 | **0.00** | ₹10,431 | **2.06** |
| Other legitimate¹ | 127 | 127 | 0 | 0.555 | 0.647 | 0.74 | 0.52 | 0.36 | 0.31 | ₹3,481 | 5.24 |
| **Amount-heavy fraud²** | 55 | 55 | 0 | **0.950** | 1.000 | 1.00 | 1.00 | 1.00 | **0.71** | ₹16,180 | **42.48** |
| Other fraud³ | 206 | 206 | 0 | 0.855 | 1.000 | 0.90 | 0.90 | 0.84 | 0.65 | ₹3,624 | 6.77 |

¹ `LEGITIMATE_ROUTINE`, `NEW_RECIPIENT`, `UNUSUAL_TIME`, `FALSE_POSITIVE`
² `UNUSUAL_AMOUNT`, `SOCIAL_ENGINEERING`
³ `NEW_DEVICE`, `VELOCITY_SPIKE`, `WEAK_SIGNAL_COMBINATION`

`LEGITIMATE_HIGH_VALUE` distribution detail: p25 **0.445**, p75 **0.530**,
**max 0.747**. No row in this group reached 0.9.

**Cold start:** 0 refusals in every group. Scenario rows always follow a
full history by construction, so the refusal path (§8) is not exercised
by this test — its behaviour is covered separately.

### 12.2 Per-scenario — held-out

| Scenario | Label | n | mean | median | mean amount | mean `amount_zscore` |
|---|---|---|---|---|---|---|
| `FALSE_POSITIVE` | legit | 39 | 1.000 | 1.000 | ₹8,280 | 16.81 |
| `SOCIAL_ENGINEERING` | fraud | 28 | 1.000 | 1.000 | ₹13,540 | 38.29 |
| `WEAK_SIGNAL_COMBINATION` | fraud | 35 | 1.000 | 1.000 | ₹8,172 | 20.56 |
| `UNUSUAL_AMOUNT` | fraud | 27 | 0.898 | 0.881 | ₹18,917 | 46.81 |
| `VELOCITY_SPIKE` | fraud | 138 | 0.848 | 1.000 | ₹1,970 | 1.73 |
| `NEW_DEVICE` | fraud | 33 | 0.732 | 0.722 | ₹5,715 | 13.23 |
| `NEW_RECIPIENT` | legit | 27 | 0.701 | 0.677 | ₹1,248 | 0.21 |
| **`LEGITIMATE_HIGH_VALUE`** | **legit** | **31** | **0.494** | **0.469** | **₹10,431** | **2.06** |
| `UNUSUAL_TIME` | legit | 27 | 0.350 | 0.347 | ₹1,175 | 0.02 |
| `LEGITIMATE_ROUTINE` | legit | 34 | 0.092 | 0.040 | ₹1,580 | 0.10 |

### 12.3 In-sample check (train split, 781 scenario rows)

`LEGITIMATE_HIGH_VALUE` n=49: mean **0.494**, median 0.463, bands
1.00 / 0.27 / 0.08 / **0.00**. Amount-heavy fraud n=105: mean **0.942**,
≥0.9 in 0.65. Held-out and in-sample agree closely (LHV mean 0.494 in
both), so the held-out result is not an artefact of the small held-out
sample.

### 12.4 Verdict — plainly stated

**The model separates "large but normal for context" from "large and
anomalous." It does not conflate them.**

The decisive evidence is that absolute size is held roughly constant while
the scores diverge sharply:

| | `LEGITIMATE_HIGH_VALUE` | Amount-heavy fraud |
|---|---|---|
| Mean amount | ₹10,431 | ₹16,180 (same order of magnitude) |
| Mean `amount_zscore` | **2.06** | **42.48** (≈20×) |
| Mean anomaly score | **0.494** | **0.950** |
| Fraction ≥ 0.9 | **0.00** | **0.71** |

Both groups are large in rupee terms, yet none of the 31 legitimate
high-value rows reached the top band while 71% of amount-heavy fraud did.
The model is keying on **deviation from the user's own history**
(`amount_zscore`), not on absolute size — which is exactly what spec §38
Scenario F requires, and it works because the generator gives these users
a history that already contains comparable large payments.

**Two honest qualifications:**

1. **It is not treated as fully routine.** At mean 0.494 it sits well
   above `LEGITIMATE_ROUTINE` (0.092) — roughly 5× elevated, and every
   row exceeds 0.3. Some elevation is defensible (a ₹10k payment genuinely
   is less typical than a ₹1.6k one, and `amount_zscore` ≈ 2 confirms a
   mild real deviation), but the score is **not** near-zero and a
   downstream consumer must not read "legitimate" from a low value alone.

2. **The "other legitimate" group mean (0.555) exceeds
   `LEGITIMATE_HIGH_VALUE` (0.494)**, so the headline group comparison
   understates the result. That is driven by `FALSE_POSITIVE` (1.000) and
   `NEW_RECIPIENT` (0.701) — `FALSE_POSITIVE` is *designed* to look
   suspicious while being legitimate, so its top score is intended
   behaviour, not a defect. The per-scenario table (§12.2) is the more
   informative view.

**No pass/fail threshold is asserted.** The bands above are illustrative
cut-points for reading the distribution only; per §6 this detector defines
no operating threshold (`selected_threshold = -1.0`), and choosing one is
the Phase 6 fusion layer's responsibility.

**Sample-size caveat:** 31 held-out `LEGITIMATE_HIGH_VALUE` rows (49
in-sample). Directional, not precise. **Synthetic-data caveat:** per §1
and §11, this characterises the S40 generator, not real-world behaviour.
