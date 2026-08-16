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
- No per-scenario breakdown of anomaly scores is stored.
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
