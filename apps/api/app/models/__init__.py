"""
Import every model module here so SQLAlchemy's declarative registry (and
therefore Alembic autogenerate / Base.metadata) sees the full schema, and
so relationship() string references between models resolve correctly.
"""

from app.models.alert import Alert
from app.models.audit_log import AuditLog
from app.models.device import Device
from app.models.fraud_case import FraudCase
from app.models.model_prediction import ModelPrediction
from app.models.recipient import Recipient
from app.models.risk_factor import RiskFactor
from app.models.risk_score import RiskScore
from app.models.transaction import Transaction
from app.models.user import User
from app.models.user_feedback import UserFeedback
from app.models.voice_analysis import VoiceAnalysis

__all__ = [
    "Alert",
    "AuditLog",
    "Device",
    "FraudCase",
    "ModelPrediction",
    "Recipient",
    "RiskFactor",
    "RiskScore",
    "Transaction",
    "User",
    "UserFeedback",
    "VoiceAnalysis",
]
