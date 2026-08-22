"""
Explainability package for S40.
Integrates SHAP and rule-based plain-language explanation generators.
"""

from ml.explainability.explanations import (
    EXPLANATION_MAP,
    FeatureExplanation,
    RiskDirection,
    explain_feature,
    validate_explanation_map,
)
from ml.explainability.shap_explainer import (
    ExplainabilityEngine,
    ShapExplainer,
    ShapFactor,
    direction_of,
)

__all__ = [
    "EXPLANATION_MAP",
    "FeatureExplanation",
    "RiskDirection",
    "explain_feature",
    "validate_explanation_map",
    "ExplainabilityEngine",
    "ShapExplainer",
    "ShapFactor",
    "direction_of",
]

