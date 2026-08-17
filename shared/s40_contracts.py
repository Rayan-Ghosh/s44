"""
s40_contracts.py  --  SHARED INTERFACE CONTRACT for SOAIDEATHON S40.

This file is the single source of truth for how the ML layer and the backend
talk to each other. Import it from both. Do not fork it.

    from s40_contracts import (
        ComponentScore, RiskFactor, FusionResult,
        fuse, DEFAULT_WEIGHTS, BAND_THRESHOLDS,
    )

Every detector returns a ComponentScore. The fusion engine consumes whatever
components are present and renormalises weights over the ones that actually
reported. That matters: most transactions have no voice signal, and a missing
component must not be treated as "score 0" (which would silently drag risk
down and make the system look safe when it is simply blind).

Design rules:
  * every score is 0.0-1.0, higher = more suspicious
  * every component explains itself via RiskFactor list
  * fusion is a documented weighted rule, NOT a learned model
    (learning fusion weights needs jointly-labelled multimodal data,
     which does not exist for this project -- say so if asked)
  * thresholds are tuned on validation/synthetic data and frozen before demo
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

SCHEMA_VERSION = "1.0.0"


# ============================================================
# ENUMS
# ============================================================
class Component(str, Enum):
    TRANSACTION = "transaction_ml"
    BEHAVIOUR = "behaviour_anomaly"
    DEVICE = "device_risk"
    VOICE = "voice_social_engineering"


class Status(str, Enum):
    OK = "ok"                    # ran normally, score is trustworthy
    DEGRADED = "degraded"        # ran with missing inputs, down-weighted
    UNAVAILABLE = "unavailable"  # did not run; excluded from fusion


class Band(str, Enum):
    LOW = "LOW"        # allow silently
    MEDIUM = "MEDIUM"  # warn, user chooses
    HIGH = "HIGH"      # strong confirmation or cancel


class Direction(str, Enum):
    INCREASES = "increases"
    DECREASES = "decreases"


# ============================================================
# CORE MODELS
# ============================================================
class RiskFactor(BaseModel):
    """One human-readable reason. This is what the UI renders."""

    name: str = Field(..., description="short slug, e.g. 'amount_vs_user_median'")
    label: str = Field(..., description="UI text, e.g. 'Amount 12x your usual transfer'")
    contribution: float = Field(..., ge=-1.0, le=1.0,
                                description="signed impact on this component's score")
    direction: Direction
    detail: Optional[str] = Field(None, description="optional longer explanation")

    @field_validator("contribution")
    @classmethod
    def _finite(cls, v: float) -> float:
        if v != v:  # NaN
            raise ValueError("contribution must be a real number")
        return v


class ComponentScore(BaseModel):
    """What every detector must return. Same shape for all four."""

    component: Component
    version: str = Field(..., description="model version, e.g. 'xgb-1.2.0'")
    score: float = Field(..., ge=0.0, le=1.0,
                         description="0 = benign, 1 = maximally suspicious")
    confidence: float = Field(1.0, ge=0.0, le=1.0,
                              description="how much to trust this score")
    status: Status = Status.OK
    factors: List[RiskFactor] = Field(default_factory=list)
    latency_ms: Optional[int] = None
    error: Optional[str] = None

    @classmethod
    def unavailable(cls, component: Component, reason: str) -> "ComponentScore":
        """Use this instead of returning score=0.0 when a detector cannot run."""
        return cls(component=component, version="n/a", score=0.0, confidence=0.0,
                   status=Status.UNAVAILABLE, error=reason)


class FusionResult(BaseModel):
    """Final object the API returns to the frontend."""

    schema_version: str = SCHEMA_VERSION
    risk_score: float = Field(..., ge=0.0, le=100.0)
    band: Band
    components: Dict[str, ComponentScore]
    effective_weights: Dict[str, float]
    top_factors: List[RiskFactor]
    explanation: str
    components_missing: List[str] = Field(default_factory=list)


# ============================================================
# FUSION CONFIGURATION  (tune on validation data, then FREEZE)
# ============================================================
DEFAULT_WEIGHTS: Dict[Component, float] = {
    Component.TRANSACTION: 0.40,
    Component.BEHAVIOUR: 0.20,
    Component.DEVICE: 0.15,
    Component.VOICE: 0.25,
}

BAND_THRESHOLDS = {"medium": 40.0, "high": 70.0}

# A single component this extreme forces at least MEDIUM regardless of the
# weighted average. Prevents one screaming signal from being averaged away --
# e.g. a live vishing call during a first-time transfer to a new payee.
OVERRIDE_FLOOR = 0.90
MAX_TOP_FACTORS = 5


# ============================================================
# FUSION ENGINE
# ============================================================
def fuse(
    scores: List[ComponentScore],
    weights: Optional[Dict[Component, float]] = None,
    thresholds: Optional[Dict[str, float]] = None,
) -> FusionResult:
    """Combine component scores into a single 0-100 risk score.

    Weights are renormalised over components that actually reported, so a
    transaction with no voice signal is scored fairly on the remaining three
    rather than being credited with a fake 0 for voice.

    DEGRADED components are additionally scaled by their own confidence.
    """
    weights = dict(weights or DEFAULT_WEIGHTS)
    thresholds = dict(thresholds or BAND_THRESHOLDS)

    usable = [s for s in scores if s.status is not Status.UNAVAILABLE]
    missing = [s.component.value for s in scores if s.status is Status.UNAVAILABLE]
    for comp in weights:
        if comp.value not in {s.component.value for s in scores}:
            missing.append(comp.value)

    if not usable:
        return FusionResult(
            risk_score=0.0, band=Band.LOW, components={},
            effective_weights={}, top_factors=[],
            explanation="No detector was able to score this transaction. "
                        "Risk is unknown, not low - route to manual review.",
            components_missing=sorted(set(missing)),
        )

    # effective weight = configured weight x confidence
    raw = {}
    for s in usable:
        w = weights.get(s.component, 0.0)
        if s.status is Status.DEGRADED:
            w *= s.confidence
        raw[s.component] = w
    total = sum(raw.values())
    if total <= 0:
        raw = {s.component: 1.0 for s in usable}
        total = float(len(usable))
    effective = {c: w / total for c, w in raw.items()}

    weighted = sum(s.score * effective[s.component] for s in usable)
    risk = round(weighted * 100.0, 2)

    band = Band.LOW
    if risk >= thresholds["high"]:
        band = Band.HIGH
    elif risk >= thresholds["medium"]:
        band = Band.MEDIUM

    # single-signal override
    screaming = [s for s in usable if s.score >= OVERRIDE_FLOOR]
    if screaming and band is Band.LOW:
        band = Band.MEDIUM

    # rank explanations by factor impact x that component's effective weight
    ranked: List[RiskFactor] = []
    for s in usable:
        w = effective[s.component]
        for f in s.factors:
            ranked.append((abs(f.contribution) * w, f))
    ranked.sort(key=lambda t: -t[0])
    top = [f for _, f in ranked[:MAX_TOP_FACTORS]]

    if top:
        reasons = "; ".join(f.label for f in top[:3])
        explanation = f"Risk {risk:.0f}/100 ({band.value}). Main drivers: {reasons}."
    else:
        explanation = f"Risk {risk:.0f}/100 ({band.value}). No dominant risk factor."
    if screaming:
        names = ", ".join(s.component.value for s in screaming)
        explanation += f" Escalated because {names} reported a near-certain signal."
    if missing:
        explanation += f" Not scored: {', '.join(sorted(set(missing)))}."

    return FusionResult(
        risk_score=risk, band=band,
        components={s.component.value: s for s in scores},
        effective_weights={c.value: round(w, 4) for c, w in effective.items()},
        top_factors=top, explanation=explanation,
        components_missing=sorted(set(missing)),
    )


# ============================================================
# STUBS -- let the backend build before any model exists
# ============================================================
def stub_score(component: Component, score: float = 0.15) -> ComponentScore:
    """Deterministic placeholder so the API can be wired up on day 1."""
    return ComponentScore(
        component=component, version="stub-0.0.1", score=score, confidence=1.0,
        status=Status.OK, latency_ms=1,
        factors=[RiskFactor(name="stub", label=f"{component.value} stub output",
                            contribution=score, direction=Direction.INCREASES)],
    )


if __name__ == "__main__":
    demo = [
        ComponentScore(
            component=Component.TRANSACTION, version="xgb-1.0.0", score=0.82,
            factors=[RiskFactor(name="amount_vs_median", contribution=0.44,
                                direction=Direction.INCREASES,
                                label="Amount is 12x this user's usual transfer"),
                     RiskFactor(name="new_payee", contribution=0.27,
                                direction=Direction.INCREASES,
                                label="First ever transfer to this recipient")]),
        ComponentScore(
            component=Component.BEHAVIOUR, version="iforest-1.0.0", score=0.61,
            factors=[RiskFactor(name="hour_of_day", contribution=0.31,
                                direction=Direction.INCREASES,
                                label="Transfer at 02:14, outside normal hours")]),
        ComponentScore(
            component=Component.DEVICE, version="rules-1.0.0", score=0.55,
            factors=[RiskFactor(name="new_device", contribution=0.4,
                                direction=Direction.INCREASES,
                                label="Device first seen 6 minutes ago")]),
        ComponentScore.unavailable(Component.VOICE, "no call audio for this session"),
    ]
    result = fuse(demo)
    print(result.model_dump_json(indent=2))