"""
Import every model module here so SQLAlchemy's declarative registry (and
therefore Alembic autogenerate / Base.metadata) sees the full schema, and
so relationship() string references between models resolve correctly.
"""

from app.models.alert import Alert
from app.models.audit_log import AuditLog
from app.models.auth_rate_limit import AuthRateLimit
from app.models.device import Device
from app.models.fraud_case import FraudCase
from app.models.guardian_request import GuardianRequest
from app.models.model_prediction import ModelPrediction
from app.models.notification import Notification
from app.models.otp_verification import OtpVerification
from app.models.password_reset_authorization import PasswordResetAuthorization
from app.models.recipient import Recipient
from app.models.risk_factor import RiskFactor
from app.models.risk_score import RiskScore
from app.models.statement_ledger_transaction import StatementLedgerTransaction
from app.models.transaction import Transaction
from app.models.trusted_contact import TrustedContact
from app.models.trusted_device_binding import TrustedDeviceBinding
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.models.user_feedback import UserFeedback
from app.models.user_financial_profile import UserFinancialProfile
from app.models.user_model_artifact import UserModelArtifact
from app.models.user_session import UserSession
from app.models.voice_analysis import VoiceAnalysis

__all__ = [
    "Alert",
    "AuditLog",
    "AuthRateLimit",
    "Device",
    "FraudCase",
    "GuardianRequest",
    "ModelPrediction",
    "Notification",
    "OtpVerification",
    "PasswordResetAuthorization",
    "Recipient",
    "RiskFactor",
    "RiskScore",
    "StatementLedgerTransaction",
    "Transaction",
    "TrustedContact",
    "TrustedDeviceBinding",
    "User",
    "UserContactInfo",
    "UserFeedback",
    "UserFinancialProfile",
    "UserModelArtifact",
    "UserSession",
    "VoiceAnalysis",
]
