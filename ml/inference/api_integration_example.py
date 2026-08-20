"""
FastAPI Backend Integration Example Stub for S40.

Demonstrates how apps/api/app/services/risk_service.py imports MLPredictor,
initializes the singleton during FastAPI app lifespan startup, and executes
real-time scoring inside controller endpoints.
"""

from contextlib import asynccontextmanager
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from ml.inference.predict import MLPredictor, get_predictor


# 1. FastAPI Lifespan Context for Singleton Loading
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load all serialized ML model artifacts into memory ONCE
    print("[FASTAPI LIFESPAN] Loading MLPredictor singleton into memory...")
    app.state.predictor = get_predictor()
    yield
    # Shutdown: Clean up resources if necessary
    print("[FASTAPI LIFESPAN] MLPredictor shut down cleanly.")


app = FastAPI(
    title="S40 Risk Engine API Stub",
    description="Mediator service stub connecting FastAPI backend to the ML inference subsystem.",
    version="1.0.0",
    lifespan=lifespan
)


# 2. Input Request Contract
class EvaluateRiskRequest(BaseModel):
    transaction_id: str
    user_id: str
    amount: float = Field(..., gt=0.0)
    recipient_id: str
    timestamp: str
    device_id: str
    location: str = "Bhubaneswar"
    payment_method: str = "UPI"
    voice_transcript: str = ""
    user_profile: Dict[str, Any] = Field(default_factory=dict)


# 3. Endpoint Handler
@app.post("/api/v1/risk/evaluate", status_code=status.HTTP_200_OK)
async def evaluate_risk(request: EvaluateRiskRequest) -> Dict[str, Any]:
    """
    Evaluates real-time fraud risk for an incoming transaction request payload.
    """
    try:
        predictor: MLPredictor = app.state.predictor
        payload = request.model_dump()
        decision_package = predictor.predict(payload)
        return decision_package
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Risk evaluation failure: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
