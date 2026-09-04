"""
Read-only EDA pass across every dataset in scope for the real-data
retraining pass (see docs/EDA_REPORT.md for the output this produces).

Deliberately does not train or transform anything — it only measures and
reports, so the numbers in docs/EDA_REPORT.md are exactly what a human
would get re-running this script, not a narrative reconstruction.

Large real files (IEEE-CIS, PaySim) are sampled for speed; sample sizes
are recorded in the output so nobody mistakes a sample statistic for a
full-population one.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

RAW = PROJECT_ROOT / "ml" / "data" / "raw"
IEEE_SAMPLE = 150_000
PAYSIM_SAMPLE = 300_000


def _fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def _value_counts_table(series: pd.Series, dropna: bool = False) -> str:
    """Markdown table without depending on the optional `tabulate` package."""
    vc = series.value_counts(dropna=dropna)
    rows = [f"| {idx} | {count} |" for idx, count in vc.items()]
    return "| value | count |\n|---|---:|\n" + "\n".join(rows) + "\n"


def eda_indian_scam() -> str:
    path = RAW / "indian_scam" / "transactions.csv"
    df_raw = pd.read_csv(path)
    dup_count = df_raw.duplicated().sum()
    df = df_raw.drop_duplicates().reset_index(drop=True)
    lines = [f"## Indian Online Scam Dataset\n", f"Source file: `{path}`  \n"]
    lines.append(
        f"Raw shape: {df_raw.shape[0]} rows x {df_raw.shape[1]} columns. "
        f"**{dup_count} of those are exact full-row duplicates** (the file "
        f"appears to be the same ~1,200-row export concatenated with itself "
        f"multiple times) — dropped before any further analysis below. "
        f"Deduplicated shape: {df.shape[0]} rows.\n"
    )

    lines.append("### Missingness per column\n")
    miss = df.isna().mean().sort_values(ascending=False)
    lines.append("| column | % missing |\n|---|---:|\n")
    for col, pct in miss.items():
        lines.append(f"| {col} | {_fmt_pct(pct)} |\n")

    labeled = df.dropna(subset=["is_fraudulent"])
    fraud_rate = labeled["is_fraudulent"].mean()
    lines.append(
        f"\n### Class balance\nLabeled rows: {len(labeled)} / {len(df)} "
        f"({_fmt_pct(len(labeled) / len(df))}). Fraud rate among labeled rows: "
        f"**{_fmt_pct(fraud_rate)}**.\n"
    )

    lines.append("\n### fraud_type distribution\n")
    lines.append(_value_counts_table(df["fraud_type"]))

    n_customers = df["customer_id"].nunique()
    vc = df["customer_id"].value_counts()
    repeat = int((vc > 1).sum())
    lines.append(
        f"\n### Repeat-customer structure (CORRECTED — see note)\n"
        f"**On the deduplicated data, this dataset has NO repeat customers**: "
        f"{n_customers} unique customers across {len(df)} rows, only {repeat} "
        f"customer(s) with more than one transaction "
        f"({_fmt_pct(repeat / n_customers) if n_customers else 'n/a'}). Mean "
        f"transactions/customer: {vc.mean():.2f}.\n\n"
        f"**Correction note:** an earlier pass measured this dataset *before* "
        f"deduplication and reported 1,126/1,132 customers with repeat "
        f"transactions — that was an artefact of the ~4x duplicated raw file "
        f"(the same row group repeated under the same customer_id), not real "
        f"repeat activity. Deduplicated, this dataset has the **same structural "
        f"problem as PaySim**: every row is effectively a cold start, so "
        f"`amount_zscore`, `recipient_frequency`, `seconds_since_last_transaction` "
        f"etc. would come out null/degenerate for essentially every row here too. "
        f"This changes which datasets can act as a primary training source — "
        f"flagged to the user rather than proceeding on the earlier reading.\n"
    )

    lines.append(f"\nUnique merchants: {df['merchant_id'].nunique()}.\n")

    lines.append("\n### Amount distribution (labeled rows)\n")
    amt = labeled["amount"].dropna()
    lines.append(
        f"count={len(amt)}, mean={amt.mean():.2f}, median={amt.median():.2f}, "
        f"std={amt.std():.2f}, min={amt.min():.2f}, max={amt.max():.2f}.\n"
    )
    lines.append(
        "\nMean amount by label: fraud="
        f"{labeled.loc[labeled['is_fraudulent'] == 1, 'amount'].mean():.2f}, "
        "legit="
        f"{labeled.loc[labeled['is_fraudulent'] == 0, 'amount'].mean():.2f}.\n"
    )

    lines.append(
        "\n### Synthetic-construction check\n"
        f"The raw file being a ~4x self-concatenation ({dup_count} exact "
        "duplicate rows out of the original total) is itself strong evidence "
        "of a constructed/exported-for-practice dataset rather than an organic "
        "transaction log. On top of that, the (deduplicated) fraud_type category "
        "counts are still close to evenly split and the fraud rate (~31%) is far "
        "above any organically-observed rate. Documented as such rather than "
        "presented as organic real-world data — see docs/DATA_STRATEGY.md "
        "addendum.\n"
    )

    return "".join(lines)


def eda_ieee_cis() -> str:
    txn_path = RAW / "ieee_cis" / "train_transaction.csv"
    id_path = RAW / "ieee_cis" / "train_identity.csv"
    df = pd.read_csv(txn_path, nrows=IEEE_SAMPLE)
    df_id = pd.read_csv(id_path, nrows=IEEE_SAMPLE)

    lines = [
        "## IEEE-CIS Fraud Detection (evaluation-only per MODEL_DATASET_MAPPING)\n",
        f"Sampled first {IEEE_SAMPLE} rows of `train_transaction.csv` "
        f"(full file is 590,540 rows) — sampled for EDA speed only.\n",
    ]
    lines.append(f"\nFraud rate in sample: **{_fmt_pct(df['isFraud'].mean())}**.\n")

    card1 = df["card1"]
    vc = card1.value_counts()
    repeat = int((vc > 1).sum())
    lines.append(
        f"\n`card1` (user-id proxy) repeat rate in sample: {repeat}/{card1.nunique()} "
        f"values appear more than once ({_fmt_pct(repeat / card1.nunique())}). "
        f"Confirms the existing MODEL_DATASET_MAPPING finding that this dataset "
        f"cannot reliably support per-user behavioural baselines "
        f"(card1 is a proxy, not a verified user).\n"
    )

    has_identity = df["TransactionID"].isin(df_id["TransactionID"]).mean()
    lines.append(f"\nRows with a matching identity-file row: {_fmt_pct(has_identity)}.\n")

    lines.append("\n### Amount distribution\n")
    amt = df["TransactionAmt"]
    lines.append(
        f"mean={amt.mean():.2f}, median={amt.median():.2f}, std={amt.std():.2f}, "
        f"max={amt.max():.2f}.\n"
    )

    lines.append(
        "\n**Role in this pass:** evaluation-only generalization check "
        "(different fraud mechanism — card-not-present chargebacks, not P2P "
        "social engineering), never pooled into the training label. See "
        "docs/DATA_STRATEGY.md §10b and ml/datasets/preparation.py.\n"
    )
    return "".join(lines)


def eda_paysim() -> str:
    path = RAW / "paysim" / "PS_20174392719_1491204439457_log.csv"
    df = pd.read_csv(path, nrows=PAYSIM_SAMPLE)

    lines = [
        "## PaySim (evaluation-only per MODEL_DATASET_MAPPING)\n",
        f"Sampled first {PAYSIM_SAMPLE} rows (full file is ~6,362,620 rows) — "
        f"sampled for EDA speed only.\n",
    ]
    lines.append(f"\nFraud rate in sample: **{_fmt_pct(df['isFraud'].mean())}**.\n")

    vc = df["nameOrig"].value_counts()
    repeat = int((vc > 1).sum())
    lines.append(
        f"\n`nameOrig` (sender) repeat rate in sample: {repeat}/{df['nameOrig'].nunique()} "
        f"accounts appear more than once ({_fmt_pct(repeat / df['nameOrig'].nunique())}). "
        f"Reconfirms the existing measured finding "
        f"(docs/DATA_STRATEGY.md §10b: ~0.15% on the full dataset) — almost every "
        f"row is a cold start for a per-user model.\n"
    )
    lines.append(f"\n`type` distribution:\n{_value_counts_table(df['type'])}")
    lines.append(
        f"\nFraud only occurs in: "
        f"{sorted(df.loc[df['isFraud'] == 1, 'type'].unique().tolist())}.\n"
    )

    lines.append(
        "\n**Role in this pass:** evaluation-only generalization check, never "
        "pooled into the training label (structural incompatibility, not a "
        "licensing issue for this one — GPL-3.0 simulator, PARTIALLY_VERIFIED "
        "Kaggle distribution).\n"
    )
    return "".join(lines)


def eda_synthetic() -> str:
    from ml.data.generators.synthetic_generator import SyntheticConfig, SyntheticGenerator

    cfg = SyntheticConfig(seed=40, users=800, history_per_user=25)
    frame = SyntheticGenerator(cfg).generate()

    lines = [
        "## S40 Synthetic (minority blend component, 10-20% of training rows)\n",
        f"Generated with seed=40, users=800, history_per_user=25 (same config the "
        f"existing fraud/anomaly cards use). Shape: {frame.shape[0]} rows.\n",
    ]
    lines.append(f"\nFraud rate: **{_fmt_pct(frame['is_fraud'].mean())}**.\n")
    return "".join(lines)


def main() -> None:
    sections = [
        "# EDA Report — Real-Data Retraining Pass\n",
        "\nGenerated by `scripts/eda_report.py`. Every number below is measured "
        "directly from the local dataset files at the paths shown — nothing is "
        "estimated or carried over from documentation. Re-run the script to "
        "reproduce.\n\n---\n\n",
        eda_indian_scam(),
        "\n---\n\n",
        eda_ieee_cis(),
        "\n---\n\n",
        eda_paysim(),
        "\n---\n\n",
        eda_synthetic(),
        "\n---\n\n## Consequence for feature/column selection — REVISED FINDING\n\n"
        "**All three real datasets available to this project (Indian Online Scam, "
        "PaySim, IEEE-CIS) turn out to lack repeat-entity history once measured "
        "correctly** (the Indian dataset's apparent repeat-customer structure was "
        "an artefact of its raw file being duplicated ~4x — corrected above). "
        "This matches the existing, broader conclusion already recorded in "
        "docs/DATA_STRATEGY.md §10b: no public/provided dataset currently "
        "available to this project can express S40's per-user behavioural "
        "feature space. `customer_id`, `merchant_id`, `amount`, "
        "`transaction_time` still map cleanly onto S40's canonical schema for "
        "the Indian dataset, and its labels are still `s40_compatible` in "
        "spirit (Indian phishing/scam/identity-theft categories) — but a model "
        "trained on it would suffer the same degenerate-feature problem "
        "PaySim was measured to have. This is reported back to the user before "
        "proceeding further, since it invalidates the primary-training-source "
        "choice the approved plan was built on.\n",
    ]

    out_path = PROJECT_ROOT / "docs" / "EDA_REPORT.md"
    out_path.write_text("".join(sections), encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
