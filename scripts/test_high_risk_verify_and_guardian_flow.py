"""
Live Verification Script for:
High-Risk Payment -> Security Verification (Verify & Continue) -> Guardian Request Creation -> Live Countdown -> Guardian Notification -> Approval/Rejection & Refresh Persistence
"""

import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

def test_high_risk_verify_and_guardian_flow():
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)

    print("=" * 75)
    print("TESTING HIGH-RISK FLOW: SECURITY VERIFICATION -> GUARDIAN HOLD -> APPROVAL")
    print("=" * 75)

    # 1. Setup Sender & Guardian
    ts = int(time.time())
    sender_phone = f"+91-99{ts % 100000000:08d}"
    guardian_phone = f"+91-96{ts % 100000000:08d}"

    u_sender = client.post("/api/v1/users", json={"name": f"Sender {ts}", "phone_number": sender_phone}).json()
    u_guardian = client.post("/api/v1/users", json={"name": f"Guardian {ts}", "phone_number": guardian_phone}).json()
    sender_id = u_sender["id"]
    guardian_id = u_guardian["id"]
    print(f"[1] Users created: Sender={sender_id}, Guardian={guardian_id}")

    # Enroll Guardian
    contact = client.post(f"/api/v1/users/{sender_id}/trusted-contacts", json={
        "name": f"Guardian {ts}",
        "phone_number": guardian_phone,
        "relationship": "Family",
        "guardian_user_id": guardian_id,
    }).json()
    print(f"[2] Enrolled Trusted Contact ID={contact['id']} (guardian_user_id={guardian_id})")

    # 2. Create High-Risk Payment
    txn = client.post("/api/v1/transactions", json={
        "user_id": sender_id,
        "recipient_identifier": "urgent_scam_wire@upi",
        "recipient_display_name": "Suspicious Energy Utility Provider",
        "device_identifier": "device_unrecognized_888",
        "device_name": "Unknown Rooted Device",
        "amount": 95000.0,
        "location": "Moscow, Russia",
        "payment_method": "UPI",
    }).json()
    txn_id = txn["id"]
    print(f"[3] Created High-Risk Transaction: ID={txn_id}, Status={txn['status']}, Amount=Rs.{txn['amount']}")

    # 3. Simulate "Security Verification Required" -> "Verify & Continue"
    print("\n[4] User performs Security Verification (Verify & Continue)...")
    auth_resp = client.post(f"/api/v1/transactions/{txn_id}/authorize", json={"method": "BIOMETRIC"})
    assert auth_resp.status_code == 200, f"Authorization failed: {auth_resp.text}"
    auth_data = auth_resp.json()
    print(f"    Authorization succeeded: status={auth_data.get('status')}, authorization_status={auth_data.get('authorization_status')}")

    # 4. Trigger Guardian Request immediately following Biometric Verification
    print("\n[5] Triggering Guardian Request for High-Risk Payment with Guardian enabled...")
    req_resp = client.post("/api/v1/guardian/requests", json={
        "transaction_id": txn_id,
        "trusted_contact_id": contact["id"],
    })
    assert req_resp.status_code == 201, f"Failed to trigger guardian request: {req_resp.text}"
    req_data = req_resp.json()
    req_id = req_data["id"]
    print(f"    GuardianRequest Created: ID={req_id}, remaining_seconds={req_data['remaining_seconds']}s, outcome={req_data['outcome']}")
    assert req_data["remaining_seconds"] > 0
    assert req_data["outcome"] == "PENDING"

    # Verify transaction status changed to PENDING_GUARDIAN_APPROVAL
    txn_held = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn_held["status"] == "PENDING_GUARDIAN_APPROVAL"
    print(f"    Transaction status transitioned to: {txn_held['status']}")

    # 5. Verify Sender's live countdown query
    by_txn = client.get(f"/api/v1/guardian/requests/by-transaction/{txn_id}").json()
    assert by_txn is not None
    assert by_txn["id"] == req_id
    assert by_txn["remaining_seconds"] > 0
    print(f"[6] Sender live countdown query verified: remaining_seconds={by_txn['remaining_seconds']}s")

    # 6. Verify Guardian receives notification
    guardian_requests = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian_id}").json()
    assert len(guardian_requests) == 1
    assert guardian_requests[0]["id"] == req_id
    print(f"[7] Guardian received notification: Req ID={req_id}, Amount=Rs.{guardian_requests[0]['transaction_amount']}, Sender={guardian_requests[0]['sender_name']}")

    # 7. Refresh persistence check
    ov = client.get(f"/api/v1/users/{sender_id}/overview").json()
    print(f"[8] Sender Dashboard Refresh Check: Level={ov['current_risk_level']} ({ov['current_risk_score']}/100) | Needs Review={ov['needs_review_count']} | Status={ov['protection_status']}")
    assert ov["current_risk_level"] == "HIGH"
    assert ov["needs_review_count"] == 1
    assert ov["protection_status"] == "ATTENTION REQUIRED"

    # 8. Guardian Approves
    appr = client.post(f"/api/v1/guardian/requests/{req_id}/approve", json={"notes": "Legitimate verified payment"}).json()
    print(f"\n[9] Guardian Approved Request {req_id}: {appr.get('message')}")

    # Verify transaction is GUARDIAN_APPROVED
    txn_approved = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn_approved["status"] == "GUARDIAN_APPROVED"
    print(f"    Transaction status is now: {txn_approved['status']}")

    # Post-approval Dashboard check
    ov_post = client.get(f"/api/v1/users/{sender_id}/overview").json()
    assert ov_post["needs_review_count"] == 0
    assert ov_post["protection_status"] == "PROTECTED"
    print(f"[10] Post-Approval Dashboard: Level={ov_post['current_risk_level']} | Needs Review={ov_post['needs_review_count']} | Status={ov_post['protection_status']}")

    print("\n" + "=" * 75)
    print("HIGH-RISK VERIFY & GUARDIAN FLOW TEST PASSED 100%!")
    print("=" * 75)

if __name__ == "__main__":
    test_high_risk_verify_and_guardian_flow()
