"""
End-to-End Integration Test Suite for Mobile Application Frontend & FastAPI Backend.

Validates all API contracts called by mobile services (Auth, Transactions, Risk Evaluation, Alerts, Actions).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_auth_signup_and_login():
    """Test mobile signup and login endpoints."""
    # 1. Test Signup
    signup_payload = {
        "fullName": "Test Mobile User",
        "mobileNumber": "+91-99999-88888",
        "email": "mobile.test@example.com",
        "password": "securepassword123",
    }
    signup_res = client.post("/api/v1/auth/signup", json=signup_payload)
    assert signup_res.status_code in (200, 201)
    signup_data = signup_res.json()
    assert signup_data["success"] is True
    assert "token" in signup_data
    assert signup_data["user"]["name"] == "Test Mobile User"

    # 2. Test Login
    login_payload = {
        "identifier": "+91-99999-88888",
        "password": "securepassword123",
    }
    login_res = client.post("/api/v1/auth/login", json=login_payload)
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["success"] is True
    assert login_data["user"]["id"] == signup_data["user"]["id"]


def test_user_transactions_list():
    """Test user transaction history endpoint expected by PaymentService.getTransactions()."""
    res = client.get("/api/v1/users/1/transactions?limit=10&offset=0")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


def test_risk_evaluation_and_transaction_actions():
    """Test creating transaction, running ML risk evaluation, and performing confirm/cancel/report actions."""
    # 1. Create User
    u_res = client.post("/api/v1/users", json={"name": "Action User", "phone_number": "+91-98765-99999"})
    assert u_res.status_code in (200, 201, 409)
    user_id = u_res.json()["id"] if u_res.status_code != 409 else 1

    # 2. Create Transaction
    tx_payload = {
        "user_id": user_id,
        "recipient_identifier": "merchant.fastpay@upi",
        "device_identifier": "device_pixel_8_pro",
        "amount": "49000.00",
        "location": "Mumbai",
        "payment_method": "UPI FastPay",
    }
    tx_res = client.post("/api/v1/transactions", json=tx_payload)
    assert tx_res.status_code in (200, 201)
    tx_id = tx_res.json()["id"]

    # 3. Evaluate ML Risk
    risk_res = client.post("/api/v1/risk/evaluate", json={"transaction_id": tx_id})
    assert risk_res.status_code == 200
    risk_data = risk_res.json()
    assert "risk_score" in risk_data
    assert "risk_level" in risk_data
    assert "decision" in risk_data

    # 4. Confirm Transaction Action
    confirm_res = client.post(f"/api/v1/transactions/{tx_id}/confirm")
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "CONFIRMED"

    # 5. Cancel Transaction Action
    cancel_res = client.post(f"/api/v1/transactions/{tx_id}/cancel")
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # 6. Report Transaction Action
    report_res = client.post(f"/api/v1/transactions/{tx_id}/report", params={"reason": "Scam victim"})
    assert report_res.status_code == 200
    assert report_res.json()["status"] == "REPORTED"


def test_alerts_endpoint():
    """Test mobile alerts service backend endpoint."""
    res = client.get("/api/v1/alerts")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
