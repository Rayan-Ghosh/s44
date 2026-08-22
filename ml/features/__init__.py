"""
Feature extraction modules for S40 Fraud Shield.
Includes transaction, behaviour, device, and voice feature extractors,
as well as the canonical feature computation engine and specifications.
"""

from ml.features.base import (
    FeatureGroup,
    FeatureSpec,
    LeakageRisk,
    UnavailableFeature,
)
from ml.features.behaviour_features import BehaviourFeatureExtractor
from ml.features.device_features import DeviceFeatureExtractor
from ml.features.engine import (
    FEATURE_SPECS,
    UNAVAILABLE_SPEC_FEATURES,
    compute_features,
    supported_feature_names,
)
from ml.features.transaction_features import TransactionFeatureExtractor
from ml.features.voice_features import VoiceFeatureExtractor

__all__ = [
    "FEATURE_SPECS",
    "UNAVAILABLE_SPEC_FEATURES",
    "compute_features",
    "supported_feature_names",
    "FeatureGroup",
    "FeatureSpec",
    "LeakageRisk",
    "UnavailableFeature",
    "TransactionFeatureExtractor",
    "BehaviourFeatureExtractor",
    "DeviceFeatureExtractor",
    "VoiceFeatureExtractor",
]

