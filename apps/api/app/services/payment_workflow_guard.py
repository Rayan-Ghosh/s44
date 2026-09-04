"""
Canonical Payment Workflow Stage Enforcement (Part 4R).

Ensures the FastAPI backend independently validates payment workflow stages and
rejects evaluation-only, risk-level, null, missing, empty, or invalid stages before
authorization, submission, confirmation, or transaction mutation.
"""

from typing import Any, Optional, Tuple
from fastapi import HTTPException, status

from app.models.enums import PaymentWorkflowStage, RiskLevel

BANNED_RISK_LEVEL_STRINGS = {
    RiskLevel.LOW.value,
    RiskLevel.MEDIUM.value,
    RiskLevel.HIGH.value,
    "LOW",
    "MEDIUM",
    "HIGH",
}

VALID_WORKFLOW_STAGES = {
    PaymentWorkflowStage.EVALUATION_COMPLETED.value,
    PaymentWorkflowStage.PAYMENT_AUTHORIZED.value,
    PaymentWorkflowStage.PAYMENT_SUBMITTED.value,
    PaymentWorkflowStage.PAYMENT_COMPLETED.value,
}


def extract_stage_value(stage_or_obj: Any) -> Optional[str]:
    """Extract string value of stage from enum, string, dict, or object with a stage attribute."""
    if stage_or_obj is None:
        return None
    if isinstance(stage_or_obj, PaymentWorkflowStage):
        return stage_or_obj.value
    if isinstance(stage_or_obj, dict):
        if "stage" in stage_or_obj:
            return extract_stage_value(stage_or_obj["stage"])
        return None
    if hasattr(stage_or_obj, "stage"):
        val = getattr(stage_or_obj, "stage")
        return extract_stage_value(val)
    if isinstance(stage_or_obj, str):
        cleaned = stage_or_obj.strip()
        return cleaned if cleaned else ""
    return str(stage_or_obj).strip()


def resolve_candidate_stage(
    body_stage: Any = None,
    query_stage: Optional[str] = None,
    header_stage: Optional[str] = None,
    body_stage_provided: bool = False,
) -> Tuple[Optional[str], bool, Optional[str]]:
    """
    Resolves candidate stage across body, query, and header with strict conflict detection.
    Precedence order: body.stage -> query.stage -> X-Workflow-Stage header.

    If multiple sources provide conflicting values, returns conflict_error.
    Returns (candidate_stage, is_provided, conflict_error).
    """
    sources = []

    if body_stage_provided:
        val = extract_stage_value(body_stage)
        sources.append(("body", val))
    elif body_stage is not None:
        val = extract_stage_value(body_stage)
        sources.append(("body", val))

    if query_stage is not None:
        val = extract_stage_value(query_stage)
        sources.append(("query", val))

    if header_stage is not None:
        val = extract_stage_value(header_stage)
        sources.append(("header", val))

    if not sources:
        return None, False, None

    # Conflict check: all provided sources must agree on value
    first_val = sources[0][1]
    for source_name, val in sources[1:]:
        if val != first_val:
            return (
                None,
                True,
                "Conflicting workflow stage values provided across body, query, or headers.",
            )

    return first_val, True, None


def is_evaluation_stage(stage_or_obj: Any) -> bool:
    """Returns True if stage is strictly EVALUATION_COMPLETED."""
    return extract_stage_value(stage_or_obj) == PaymentWorkflowStage.EVALUATION_COMPLETED.value


def is_payment_authorized_stage(stage_or_obj: Any) -> bool:
    """Returns True if stage is strictly PAYMENT_AUTHORIZED."""
    return extract_stage_value(stage_or_obj) == PaymentWorkflowStage.PAYMENT_AUTHORIZED.value


def is_payment_submitted_stage(stage_or_obj: Any) -> bool:
    """Returns True if stage is strictly PAYMENT_SUBMITTED."""
    return extract_stage_value(stage_or_obj) == PaymentWorkflowStage.PAYMENT_SUBMITTED.value


def is_payment_completed_stage(stage_or_obj: Any) -> bool:
    """Returns True if stage is strictly PAYMENT_COMPLETED."""
    return extract_stage_value(stage_or_obj) == PaymentWorkflowStage.PAYMENT_COMPLETED.value


def validate_authorization_stage(stage_or_obj: Any) -> Tuple[bool, Optional[str]]:
    """
    Validates stage for payment authorization.
    Accepts ONLY PAYMENT_AUTHORIZED.
    Rejects EVALUATION_COMPLETED, risk levels (LOW/MEDIUM/HIGH), null, empty, or unknown stages.
    """
    val = extract_stage_value(stage_or_obj)
    if val is None or val == "":
        return False, "Payment authorization requires stage 'PAYMENT_AUTHORIZED'. Stage cannot be null or empty."

    if val in BANNED_RISK_LEVEL_STRINGS:
        return False, f"Risk level '{val}' is an evaluation metric and cannot authorize payment."

    if val == PaymentWorkflowStage.EVALUATION_COMPLETED.value:
        return False, (
            "EVALUATION_COMPLETED is a pre-payment risk evaluation result and "
            "cannot be used for payment authorization."
        )

    if val != PaymentWorkflowStage.PAYMENT_AUTHORIZED.value:
        return False, f"Invalid stage '{val}' for payment authorization. Expected 'PAYMENT_AUTHORIZED'."

    return True, None


def enforce_authorization_stage(stage_or_obj: Any) -> None:
    """Raises HTTPException 400 if stage is not PAYMENT_AUTHORIZED."""
    valid, err = validate_authorization_stage(stage_or_obj)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "Invalid stage for payment authorization.",
        )


def validate_submission_stage(stage_or_obj: Any) -> Tuple[bool, Optional[str]]:
    """
    Validates stage for payment submission (UPI / payment provider dispatch).
    Accepts ONLY PAYMENT_SUBMITTED.
    Rejects EVALUATION_COMPLETED, risk levels, null, empty, or unknown stages.
    """
    val = extract_stage_value(stage_or_obj)
    if val is None or val == "":
        return False, "Payment submission requires stage 'PAYMENT_SUBMITTED'. Stage cannot be null or empty."

    if val in BANNED_RISK_LEVEL_STRINGS:
        return False, f"Risk level '{val}' is an evaluation metric and cannot submit payment."

    if val == PaymentWorkflowStage.EVALUATION_COMPLETED.value:
        return False, (
            "EVALUATION_COMPLETED is a pre-payment risk evaluation result and "
            "cannot be used for payment submission."
        )

    if val != PaymentWorkflowStage.PAYMENT_SUBMITTED.value:
        return False, f"Invalid stage '{val}' for payment submission. Expected 'PAYMENT_SUBMITTED'."

    return True, None


def enforce_submission_stage(stage_or_obj: Any) -> None:
    """Raises HTTPException 400 if stage is not PAYMENT_SUBMITTED."""
    valid, err = validate_submission_stage(stage_or_obj)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "Invalid stage for payment submission.",
        )


def validate_completion_stage(stage_or_obj: Any) -> Tuple[bool, Optional[str]]:
    """
    Validates stage for payment completion / confirmation.
    Accepts ONLY PAYMENT_COMPLETED.
    Rejects EVALUATION_COMPLETED, risk levels, null, empty, or unknown stages.
    """
    val = extract_stage_value(stage_or_obj)
    if val is None or val == "":
        return False, "Payment completion requires stage 'PAYMENT_COMPLETED'. Stage cannot be null or empty."

    if val in BANNED_RISK_LEVEL_STRINGS:
        return False, f"Risk level '{val}' is an evaluation metric and cannot complete payment."

    if val == PaymentWorkflowStage.EVALUATION_COMPLETED.value:
        return False, (
            "EVALUATION_COMPLETED is a pre-payment risk evaluation result and "
            "cannot be used for payment completion."
        )

    if val != PaymentWorkflowStage.PAYMENT_COMPLETED.value:
        return False, f"Invalid stage '{val}' for payment completion. Expected 'PAYMENT_COMPLETED'."

    return True, None


def enforce_completion_stage(stage_or_obj: Any) -> None:
    """Raises HTTPException 400 if stage is not PAYMENT_COMPLETED."""
    valid, err = validate_completion_stage(stage_or_obj)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "Invalid stage for payment completion.",
        )


def validate_guardian_stage(stage_or_obj: Any, is_authorized_hold: bool = False) -> Tuple[bool, Optional[str]]:
    """
    Validates stage for Guardian hold creation or progression.
    Rejects EVALUATION_COMPLETED, risk levels, null, empty, or unknown stages.
    If advancing an authorized payment, requires PAYMENT_AUTHORIZED.
    """
    val = extract_stage_value(stage_or_obj)
    if val is None or val == "":
        return False, "Guardian workflow requires a valid workflow stage. Stage cannot be null or empty."

    if val in BANNED_RISK_LEVEL_STRINGS:
        return False, f"Risk level '{val}' is an evaluation metric and cannot create or advance a guardian hold."

    if val == PaymentWorkflowStage.EVALUATION_COMPLETED.value:
        return False, (
            "EVALUATION_COMPLETED is a pre-payment risk evaluation result and "
            "cannot create or advance a guardian payment hold."
        )

    if is_authorized_hold and val != PaymentWorkflowStage.PAYMENT_AUTHORIZED.value:
        return False, (
            f"Advancing guardian hold for an authorized payment requires stage 'PAYMENT_AUTHORIZED', got '{val}'."
        )

    if val not in VALID_WORKFLOW_STAGES:
        return False, f"Unknown workflow stage '{val}' for guardian operation."

    return True, None


def enforce_guardian_stage(stage_or_obj: Any, is_authorized_hold: bool = False) -> None:
    """Raises HTTPException 400 if stage is invalid for Guardian hold operation."""
    valid, err = validate_guardian_stage(stage_or_obj, is_authorized_hold=is_authorized_hold)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "Invalid stage for guardian operation.",
        )


def assert_not_evaluation_stage(stage_or_obj: Any) -> Tuple[bool, Optional[str]]:
    """
    General assertion guard rejecting pre-payment evaluation results and risk levels.
    Accepts ONLY valid executable lifecycle stages (PAYMENT_AUTHORIZED, PAYMENT_SUBMITTED, PAYMENT_COMPLETED).
    """
    val = extract_stage_value(stage_or_obj)
    if val is None or val == "":
        return False, "Workflow stage cannot be null, missing, or empty."

    if val in BANNED_RISK_LEVEL_STRINGS:
        return False, f"Risk level '{val}' is an evaluation metric and cannot enter payment workflows."

    if val == PaymentWorkflowStage.EVALUATION_COMPLETED.value:
        return False, (
            "EVALUATION_COMPLETED is a pre-payment risk evaluation result and "
            "cannot be used for payment authorization, submission, or completion."
        )

    if val not in (
        PaymentWorkflowStage.PAYMENT_AUTHORIZED.value,
        PaymentWorkflowStage.PAYMENT_SUBMITTED.value,
        PaymentWorkflowStage.PAYMENT_COMPLETED.value,
    ):
        return False, f"Unknown workflow stage '{val}'."

    return True, None


def enforce_not_evaluation_stage(stage_or_obj: Any) -> None:
    """Raises HTTPException 400 if stage is EVALUATION_COMPLETED, risk level, or invalid."""
    valid, err = assert_not_evaluation_stage(stage_or_obj)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "Workflow stage cannot be an evaluation result.",
        )


def validate_workflow_stage(operation: str, stage_or_obj: Any) -> Tuple[bool, Optional[str]]:
    """Dispatches stage validation for a named operation."""
    op = operation.lower()
    if op == "authorize":
        return validate_authorization_stage(stage_or_obj)
    elif op == "submit":
        return validate_submission_stage(stage_or_obj)
    elif op in ("complete", "confirm"):
        return validate_completion_stage(stage_or_obj)
    elif op == "guardian":
        return validate_guardian_stage(stage_or_obj)
    return False, f"Unknown payment operation '{operation}'."


def enforce_workflow_stage(operation: str, stage_or_obj: Any) -> None:
    """Raises HTTPException 400 if stage is invalid for the specified operation."""
    valid, err = validate_workflow_stage(operation, stage_or_obj)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or f"Invalid stage for payment operation '{operation}'.",
        )
