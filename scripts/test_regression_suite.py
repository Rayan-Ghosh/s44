"""
Comprehensive Regression Test Suite:
1. Dashboard Risk Priority (Active High-Risk vs Historical/Stale)
2. Dynamic Multi-Level Risk (LOW -> MEDIUM -> HIGH)
3. Live Guardian Countdown & Flow (Create -> Countdown -> Notify -> Approve / Reject)
4. Refresh / Session Independence (Consistent State across Endpoints)
"""

import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

def run_regression_suite():
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)

    print("=" * 70)
    print("RUNNING COMPREHENSIVE RISK & GUARDIAN REGRESSION SUITE")
    print("=" * 70)

    # 1. Health check
    h = client.get("/health")
    assert h.status_code == 200, f"Health check failed: {h.text}"
    print("[1/5] Backend health verified.")

    # 2. Dynamic User Setup
    ts = int(time.time())
    sender_phone = f"+91-98{ts % 100000000:08d}"
    guardian_phone = f"+91-97{ts % 100000000:08d}"

    u_sender = client.post("/api/v1/users", json={"name": f"Sender {ts}", "phone_number": sender_phone}).json()
    u_guardian = client.post("/api/v1/users", json={"name": f"Guardian {ts}", "phone_number": guardian_phone}).json()
    sender_id = u_sender["id"]
    guardian_id = u_guardian["id"]
    print(f"[2/5] Created dynamic test users: Sender ID={sender_id}, Guardian ID={guardian_id}")

    # Add guardian as trusted contact
    contact = client.post(f"/api/v1/users/{sender_id}/trusted-contacts", json={
        "name": f"Guardian {ts}",
        "phone_number": guardian_phone,
        "relationship": "Family",
        "guardian_user_id": guardian_id,
    }).json()
    print(f"      Enrolled trusted contact ID={contact['id']} (guardian_user_id={contact['guardian_user_id']})")

    # Initial overview for new user
    ov0 = client.get(f"/api/v1/users/{sender_id}/overview").json()
    assert ov0["transaction_count"] == 0
    assert ov0["current_risk_level"] == "LOW"
    assert ov0["current_risk_score"] == 0.0
    assert ov0["protection_status"] == "PROTECTED"
    print("      New user overview verified: 0 transactions, LOW (0.0), PROTECTED.")

    # 3. Test Low-Risk Payment Creation & Dashboard Update
    print("\n[3/5] Testing Low-Risk Payment...")
    t_low = client.post("/api/v1/transactions", json={
        "user_id": sender_id,
        "recipient_identifier": "local_kirana@upi",
        "recipient_display_name": "Local Kirana Grocery",
        "device_identifier": "device_home_phone_123",
        "device_name": "Home Phone",
        "amount": 250.0,
        "location": "Mumbai, India",
        "payment_method": "UPI",
    }).json()
    client.post(f"/api/v1/transactions/{t_low['id']}/confirm")

    ov_low = client.get(f"/api/v1/users/{sender_id}/overview").json()
    print(f"      Low-risk confirmed payment: TXN-{t_low['id']} | Dashboard: {ov_low['current_risk_level']} ({ov_low['current_risk_score']}/100) | Status: {ov_low['protection_status']}")
    assert ov_low["current_risk_level"] == "LOW"

    # 4. Test Active High-Risk Payment Priority Over Historical
    print("\n[4/5] Testing Active High-Risk Payment Priority over Settled...")
    t_high = client.post("/api/v1/transactions", json={
        "user_id": sender_id,
        "recipient_identifier": "scam_crypto_desk@upi",
        "recipient_display_name": "Suspicious Energy Bill Utility",
        "device_identifier": "device_foreign_unknown_999",
        "device_name": "Unknown Rooted Device",
        "amount": 88000.0,
        "location": "Lagos, Nigeria",
        "payment_method": "UPI",
    }).json()
    high_id = t_high["id"]

    # Dashboard MUST immediately reflect active high-risk transaction (78 HIGH)
    ov_high = client.get(f"/api/v1/users/{sender_id}/overview").json()
    print(f"      Active High-Risk Created: TXN-{high_id}")
    print(f"      Dashboard Overview: {ov_high['current_risk_level']} ({ov_high['current_risk_score']}/100) | Needs Review: {ov_high['needs_review_count']} | Protection: {ov_high['protection_status']}")
    assert ov_high["current_risk_level"] == "HIGH", f"Expected HIGH but got {ov_high['current_risk_level']}"
    assert ov_high["current_risk_score"] >= 70, f"Expected score >= 70 but got {ov_high['current_risk_score']}"
    assert ov_high["protection_status"] == "ATTENTION REQUIRED"
    print("      [OK] Dashboard correctly prioritizes active high-risk transaction!")

    # Verify transaction list consistency
    tx_list = client.get(f"/api/v1/users/{sender_id}/transactions").json()
    found_high = next((t for t in tx_list["items"] if t["id"] == high_id), None)
    assert found_high is not None
    assert found_high["risk_level"] == "HIGH"
    assert found_high["risk_score"] == ov_high["current_risk_score"]
    print(f"      [OK] Transaction list & Dashboard have 100% identical risk score ({found_high['risk_score']}) and level ({found_high['risk_level']}).")

    # 5. Test Live Guardian Approval Flow & Timer Propagation
    print("\n[5/5] Testing Guardian Request Trigger, Countdown Propagation, and Decision...")
    req_res = client.post("/api/v1/guardian/requests", json={
        "transaction_id": high_id,
        "trusted_contact_id": contact["id"],
    })
    assert req_res.status_code == 201, f"Failed to trigger guardian request: {req_res.text}"
    req_data = req_res.json()
    req_id = req_data["id"]
    print(f"      GuardianRequest created: ID={req_id}, Remaining Seconds={req_data['remaining_seconds']}s, Status={req_data['outcome']}")
    assert req_data["remaining_seconds"] > 0, "remaining_seconds must be positive"
    assert req_data["outcome"] == "PENDING"

    # Verify sender can look up request by transaction ID (for timer re-attachment on reload)
    by_txn = client.get(f"/api/v1/guardian/requests/by-transaction/{high_id}").json()
    assert by_txn is not None
    assert by_txn["id"] == req_id
    assert by_txn["remaining_seconds"] > 0
    print(f"      [OK] Verified sender by-transaction lookup: remaining_seconds={by_txn['remaining_seconds']}s")

    # Verify sender receives 0 incoming notifications
    sender_notifs = client.get(f"/api/v1/guardian/requests/by-guardian-user/{sender_id}").json()
    assert len(sender_notifs) == 0, f"Sender should have 0 notifications, got {len(sender_notifs)}"

    # Verify guardian receives exactly 1 incoming notification
    guardian_notifs = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian_id}").json()
    assert len(guardian_notifs) == 1, f"Guardian should have 1 notification, got {len(guardian_notifs)}"
    assert guardian_notifs[0]["id"] == req_id
    print(f"      [OK] Verified Guardian received notification: Sender='{guardian_notifs[0]['sender_name']}', Amount=Rs.{guardian_notifs[0]['transaction_amount']}")

    # Guardian approves
    appr_res = client.post(f"/api/v1/guardian/requests/{req_id}/approve", json={"notes": "Legitimate transaction confirmed"})
    assert appr_res.status_code == 200
    print(f"      Guardian approved request {req_id}.")

    # Verify transaction status updated to GUARDIAN_APPROVED
    txn_after = client.get(f"/api/v1/transactions/{high_id}").json()
    assert txn_after["status"] == "GUARDIAN_APPROVED", f"Expected GUARDIAN_APPROVED, got {txn_after['status']}"
    print(f"      [OK] Transaction status updated to {txn_after['status']}.")

    # After approval, dashboard should update since no active review transactions remain
    ov_after = client.get(f"/api/v1/users/{sender_id}/overview").json()
    print(f"      Dashboard after resolution: Level={ov_after['current_risk_level']} ({ov_after['current_risk_score']}/100) | Needs Review: {ov_after['needs_review_count']} | Status: {ov_after['protection_status']}")
    assert ov_after["needs_review_count"] == 0
    assert ov_after["protection_status"] == "PROTECTED"
    print("      [OK] Dashboard correctly returned to PROTECTED after guardian resolution.")

    # 6. Test Rejection flow on second high risk payment
    t_high2 = client.post("/api/v1/transactions", json={
        "user_id": sender_id,
        "recipient_identifier": "fraud_desk_99@upi",
        "recipient_display_name": "Phishing Crypto Hub",
        "device_identifier": "device_unknown_1234",
        "device_name": "New Untrusted Device",
        "amount": 120000.0,
        "location": "Moscow, Russia",
        "payment_method": "UPI",
    }).json()
    high2_id = t_high2["id"]

    req2 = client.post("/api/v1/guardian/requests", json={
        "transaction_id": high2_id,
        "trusted_contact_id": contact["id"],
    }).json()
    rej_res = client.post(f"/api/v1/guardian/requests/{req2['id']}/reject", json={"notes": "Fraudulent payment blocked"})
    assert rej_res.status_code == 200

    txn2_after = client.get(f"/api/v1/transactions/{high2_id}").json()
    assert txn2_after["status"] == "GUARDIAN_REJECTED"
    print(f"      [OK] Rejection flow verified: Transaction {high2_id} -> GUARDIAN_REJECTED.")

    print("\n" + "=" * 70)
    print("ALL REGRESSION TESTS PASSED 100%!")
    print("=" * 70)

if __name__ == "__main__":
    run_regression_suite()
