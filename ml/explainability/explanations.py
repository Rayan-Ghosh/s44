"""
Controlled explanation mapping.

Raw feature names are not an explanation. "amount_zscore = 3.4" is
meaningless to the people S40 is built for — ordinary smartphone users,
elderly users, non-technical users (docs/PRODUCT_DIRECTIVES.md §C). This
module is the single controlled vocabulary that turns a model feature into
language a person can act on.

TWO AUDIENCES, DELIBERATELY SEPARATED
    `user_template`    plain language, no jargon, no numbers the user
                       cannot interpret
    `analyst_template` precise, for the institution dashboard, where a
                       fraud analyst legitimately wants the number

CAUSAL LANGUAGE IS BANNED
    SHAP attributes a model's output to its inputs. It does not establish
    that anything *caused* fraud. Templates therefore say a factor
    "contributed to" the assessment — never that it caused it, and never
    that the transaction *is* fraud. This is not pedantry: S40 shows these
    strings to users about their own money.

NO EXPLANATION IS INVENTED
    Only features present in the model manifest and marked explainable get
    a user-facing template. A feature with no entry cannot leak its raw
    name into the UI, because `explain_feature` refuses to fabricate one.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from ml.training.feature_manifest import BASELINE_FEATURES


class RiskDirection(str, Enum):
    """Which way a higher feature value pushes the assessment."""

    #: Higher value -> more suspicious.
    HIGHER_IS_RISKIER = "HIGHER_IS_RISKIER"
    #: Higher value -> less suspicious (e.g. a familiar recipient).
    HIGHER_IS_SAFER = "HIGHER_IS_SAFER"


@dataclass(frozen=True)
class FeatureExplanation:
    feature: str
    #: Short label for a UI chip/badge.
    label: str
    user_template: str
    analyst_template: str
    direction: RiskDirection
    #: How to render the raw value, e.g. "{:.1f}x".
    value_format: str = "{:.2f}"

    def format_value(self, value) -> str:
        if value is None:
            return "not available"
        try:
            return self.value_format.format(float(value))
        except (TypeError, ValueError):
            return str(value)


#: The controlled vocabulary. One entry per user-facing model feature.
EXPLANATION_MAP: dict[str, FeatureExplanation] = {
    "amount_vs_average": FeatureExplanation(
        feature="amount_vs_average",
        label="Unusually large amount",
        user_template=(
            "This payment is about {value} times your usual payment amount."
        ),
        analyst_template="Amount is {value}x the user's historical mean.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.1f}",
    ),
    "amount_zscore": FeatureExplanation(
        feature="amount_zscore",
        label="Amount far outside normal range",
        user_template=(
            "This payment is much larger than the amounts you normally send."
        ),
        analyst_template="Amount is {value} standard deviations from the user's mean.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.1f}",
    ),
    "recipient_seen_before": FeatureExplanation(
        feature="recipient_seen_before",
        label="New recipient",
        user_template="You have not sent money to this recipient before.",
        analyst_template="Recipient previously seen for this user: {value}.",
        direction=RiskDirection.HIGHER_IS_SAFER,
        value_format="{:.0f}",
    ),
    "recipient_frequency": FeatureExplanation(
        feature="recipient_frequency",
        label="Rarely used recipient",
        user_template="You rarely send money to this recipient.",
        analyst_template="Share of the user's prior payments to this recipient: {value}.",
        direction=RiskDirection.HIGHER_IS_SAFER,
        value_format="{:.3f}",
    ),
    "new_device": FeatureExplanation(
        feature="new_device",
        label="New device",
        user_template="This payment is being made from a device you have not used before.",
        analyst_template="Device unseen for this user: {value}.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.0f}",
    ),
    "device_account_count": FeatureExplanation(
        feature="device_account_count",
        label="Device shared across accounts",
        user_template="This device has been used with more than one account.",
        analyst_template="Distinct accounts previously seen on this device: {value}.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.0f}",
    ),
    "transactions_last_10m": FeatureExplanation(
        feature="transactions_last_10m",
        label="Rapid payments",
        user_template="Several payments have been made from your account in the last few minutes.",
        analyst_template="Prior transactions in the trailing 10 minutes: {value}.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.0f}",
    ),
    "transactions_last_1h": FeatureExplanation(
        feature="transactions_last_1h",
        label="High recent activity",
        user_template="There has been more payment activity than usual in the last hour.",
        analyst_template="Prior transactions in the trailing hour: {value}.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.0f}",
    ),
    "time_of_day_deviation": FeatureExplanation(
        feature="time_of_day_deviation",
        label="Unusual time",
        user_template="This payment is being made at a time you do not usually send money.",
        analyst_template="Share of prior activity outside this hour: {value}.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
    ),
    "seconds_since_last_transaction": FeatureExplanation(
        feature="seconds_since_last_transaction",
        label="Payment timing",
        user_template="The timing of this payment relative to your last one is unusual.",
        analyst_template="Seconds since the user's previous transaction: {value}.",
        direction=RiskDirection.HIGHER_IS_SAFER,
        value_format="{:.0f}",
    ),
    "location_deviation": FeatureExplanation(
        feature="location_deviation",
        label="New location",
        user_template="This payment is being made from a location you have not used before.",
        analyst_template="Location unseen for this user: {value}.",
        direction=RiskDirection.HIGHER_IS_RISKIER,
        value_format="{:.0f}",
    ),
}


def explain_feature(feature: str) -> FeatureExplanation | None:
    """Look up a controlled explanation. Returns None rather than inventing one."""
    return EXPLANATION_MAP.get(feature)


def validate_explanation_map() -> None:
    """Every explainable model feature must have a controlled explanation.

    Run in tests so that adding a user-facing feature without writing its
    explanation is a build failure, not a raw feature name reaching a
    frightened user's screen.
    """
    explainable = {f.name for f in BASELINE_FEATURES if f.explainable}
    missing = explainable - set(EXPLANATION_MAP)
    if missing:
        raise ValueError(
            f"Explainable model features without a controlled explanation: "
            f"{sorted(missing)}"
        )

    unknown = set(EXPLANATION_MAP) - {f.name for f in BASELINE_FEATURES}
    if unknown:
        raise ValueError(
            f"Explanation map references features not in the model manifest: "
            f"{sorted(unknown)}"
        )

    banned = ("caused", "causes", "proves", "definitely", "is fraud", "fraudster")
    for name, explanation in EXPLANATION_MAP.items():
        text = f"{explanation.user_template} {explanation.analyst_template}".lower()
        for word in banned:
            if word in text:
                raise ValueError(
                    f"Explanation for '{name}' uses causal//absolute language "
                    f"('{word}'). SHAP attributes model output; it does not "
                    f"establish causation."
                )
