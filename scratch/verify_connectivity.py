"""
End-to-End Connectivity Check: Mobile Frontend <-> FastAPI Backend
"""

import sys
from fastapi.testclient import TestClient
from app.main import app

def check_connectivity():
    client = TestClient(app)
    results = []

    # 1. Health check
    res = client.get("/health")
    results.append(("Health Check (/health)", res.status_code == 200, res.json()))

    # 2. Auth Login
    res = client.post("/api/v1/auth/login", json={"identifier": "rahul@example.com", "password": "password123"})
    results.append(("Auth Login (/api/v1/auth/login)", res.status_code == 200, res.json() if res.status_code == 200 else res.text))

    # 3. Auth Signup
    res = client.post("/api/v1/auth/signup", json={"fullName": "Priya Patel", "mobileNumber": "+919876500001", "email": "priya@example.com"})
    results.append(("Auth Signup (/api/v1/auth/signup)", res.status_code == 201, res.json() if res.status_code == 201 else res.text))

    # 4. User Overview
    res = client.get("/api/v1/users/1/overview")
    results.append(("User Overview (/api/v1/users/1/overview)", res.status_code == 200, res.json() if res.status_code == 200 else res.text))

    # 5. User Transactions
    res = client.get("/api/v1/users/1/transactions?limit=5&offset=0")
    results.append(("User Transactions (/api/v1/users/1/transactions)", res.status_code == 200, res.json() if res.status_code == 200 else res.text))

    # 6. Risk Evaluate
    risk_payload = {
        "user_id": 1,
        "amount": 49000.0,
        "recipient_id": "RECIPIENT_TEST",
        "timestamp": "2026-08-15T14:30:00Z",
        "device_id": "DEVICE_TEST",
        "location": "Bhubaneswar",
        "voice_transcript": "Your account will be blocked immediately.",
        "user_profile": {"normal_avg_amount": 1000.0, "normal_std_amount": 300.0}
    }
    res = client.post("/api/v1/risk/evaluate", json=risk_payload)
    results.append(("Risk Evaluation (/api/v1/risk/evaluate)", res.status_code == 200, res.json() if res.status_code == 200 else res.text))

    # 7. Security Alerts
    res = client.get("/api/v1/alerts")
    results.append(("Security Alerts (/api/v1/alerts)", res.status_code == 200, res.json() if res.status_code == 200 else res.text))

    # 8. Trusted Contacts
    res = client.get("/api/v1/users/1/trusted-contacts")
    results.append(("Trusted Contacts GET (/api/v1/users/1/trusted-contacts)", res.status_code == 200, res.json() if res.status_code == 200 else res.text))

    # 9. Add Trusted Contact
    res = client.post("/api/v1/users/1/trusted-contacts", json={"name": "Aarav Sharma", "phone_number": "+919876543211", "relationship": "Brother"})
    results.append(("Add Trusted Contact POST (/api/v1/users/1/trusted-contacts)", res.status_code in (200, 201), res.json() if res.status_code in (200, 201) else res.text))

    # Print summary
    print("\n--- FRONTEND <-> BACKEND CONNECTIVITY REPORT ---")
    all_passed = True
    for name, passed, body in results:
        status_str = "SUCCESS" if passed else "FAILED"
        if not passed:
            all_passed = False
            print(f"[{status_str}] {name} -> {body}")
        else:
            print(f"[{status_str}] {name}")

    if all_passed:
        print("\nALL API ENDPOINTS CONNECTED & WORKING PROPERLY!")
    else:
        print("\nSOME ENDPOINTS FAILED CONNECTIVITY TEST!")

if __name__ == "__main__":
    check_connectivity()
