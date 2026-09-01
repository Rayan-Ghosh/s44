import urllib.request
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "apps" / "api"))

from app.core.database import SessionLocal
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.models.trusted_contact import TrustedContact
from app.core.contact_encryption import decrypt_field

API_BASE = "http://127.0.0.1:8000"

def post(url, data):
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "Origin": "http://localhost:8081"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get(url):
    req = urllib.request.Request(url, headers={"Origin": "http://localhost:8081"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_live_diagnostics():
    print("=" * 70)
    print("LIVE END-TO-END GUARDIAN NOTIFICATION FLOW DIAGNOSTICS")
    print("=" * 70)

    db = SessionLocal()

    # Step 1: Query both accounts
    print("\n[Step 1 & 2] Querying Account A (8918768254) and Account B (7903688225)...")
    user_a = None
    user_b = None
    for u in db.query(User).all():
        c = db.query(UserContactInfo).filter(UserContactInfo.user_id == u.id).first()
        phone = decrypt_field(c.phone_encrypted) if c and c.phone_encrypted else ""
        if "8918768254" in phone:
            user_a = u
        if "7903688225" in phone:
            user_b = u

    assert user_a is not None, "Account A (8918768254) not found in database"
    assert user_b is not None, "Account B (7903688225) not found in database"

    print(f"  Account A -> User ID: {user_a.id}, Name: '{user_a.name}', Verified: {user_a.is_verified}")
    print(f"  Account B -> User ID: {user_b.id}, Name: '{user_b.name}', Verified: {user_b.is_verified}")

    # Step 3 & 4: Check TrustedContact row
    print("\n[Step 3 & 4] Checking TrustedContact relationship between Account A and Account B...")
    tc = db.query(TrustedContact).filter(
        TrustedContact.user_id == user_a.id,
        TrustedContact.guardian_user_id == user_b.id
    ).first()

    assert tc is not None, f"TrustedContact linking sender {user_a.id} to guardian {user_b.id} not found"
    print(f"  TrustedContact ID: {tc.id}")
    print(f"  Owner/Sender User ID: {tc.user_id} ({user_a.name})")
    print(f"  Contact Name: '{tc.contact_name}'")
    print(f"  Stored Phone Masked: {tc.phone_masked}")
    print(f"  guardian_user_id: {tc.guardian_user_id} (Matches Account B User ID {user_b.id})")

    db.close()

    # Step 6: Create fresh high-risk transaction from User A (Sender)
    print("\n[Step 6] Creating fresh high-risk payment transaction for Sender (User 20)...")
    txn = post(f"{API_BASE}/api/v1/transactions", {
        "user_id": user_a.id,
        "amount": 92500.0,
        "payment_method": "UPI",
        "recipient_identifier": "apex-crypto@upi",
        "recipient_display_name": "Apex Global Crypto Desk",
        "device_identifier": "dev-rayan-phone",
        "device_name": "Rayan Android Device",
        "device_type": "Mobile App"
    })
    txn_id = txn["id"]
    print(f"  Created Transaction ID: {txn_id} (Amount: Rs. 92,500.0, Status: {txn['status']})")

    # Step 7: Trigger GuardianRequest via API
    print("\n[Step 7 & 8] Triggering GuardianRequest for Transaction...")
    g_req = post(f"{API_BASE}/api/v1/guardian/requests", {
        "transaction_id": txn_id,
        "trusted_contact_id": tc.id
    })
    req_id = g_req["id"]
    print(f"  GuardianRequest ID: {req_id}")
    print(f"  Transaction ID: {g_req['transaction_id']}")
    print(f"  Trusted Contact ID: {g_req['trusted_contact_id']}")
    print(f"  Outcome: {g_req['outcome']}")
    print(f"  Sender Name: '{g_req['sender_name']}'")
    print(f"  Sender Phone Masked: '{g_req['sender_phone_masked']}'")
    print(f"  Recipient Name: '{g_req['recipient_name']}'")
    print(f"  Amount: Rs. {g_req['transaction_amount']}")
    print(f"  Risk Score: {g_req['risk_score']}/100")
    print(f"  Risk Reasons: {g_req['risk_reasons']}")
    print(f"  Remaining Seconds: {g_req['remaining_seconds']}s")

    # Step 9: Poll both Sender and Guardian endpoints
    print("\n[Step 9] Polling Sender vs Guardian endpoints...")
    sender_res = get(f"{API_BASE}/api/v1/guardian/requests/by-guardian-user/{user_a.id}")
    print(f"  GET /api/v1/guardian/requests/by-guardian-user/{user_a.id} (Sender User A) -> Count: {len(sender_res)}")
    assert len(sender_res) == 0, f"Sender endpoint MUST return 0 requests, got {len(sender_res)}"

    guardian_res = get(f"{API_BASE}/api/v1/guardian/requests/by-guardian-user/{user_b.id}")
    print(f"  GET /api/v1/guardian/requests/by-guardian-user/{user_b.id} (Guardian User B) -> Count: {len(guardian_res)}")
    assert len(guardian_res) >= 1, f"Guardian endpoint MUST return pending request, got {len(guardian_res)}"
    match = next((r for r in guardian_res if r["id"] == req_id), None)
    assert match is not None, f"Pending request {req_id} not found in guardian results"
    print(f"  Found pending request {match['id']} for Guardian: Sender='{match['sender_name']}', Amount={match['transaction_amount']}")

    # Step 10 & 11: Guardian Approves Request
    print("\n[Step 10 & 11] Guardian (User 37) Approves Request...")
    app_res = post(f"{API_BASE}/api/v1/guardian/requests/{req_id}/approve", {"notes": "Approved by trusted guardian"})
    print(f"  Resolution outcome: {app_res['outcome']}")
    assert app_res["outcome"] == "APPROVED"

    # Verify transaction status is now GUARDIAN_APPROVED
    txn_check = get(f"{API_BASE}/api/v1/transactions/{txn_id}")
    print(f"  Transaction {txn_id} Status: {txn_check['status']}")
    assert txn_check["status"] == "GUARDIAN_APPROVED"

    # Step 12: Test Rejection Flow on another payment
    print("\n[Step 12] Testing Rejection Flow on another payment...")
    txn_rej = post(f"{API_BASE}/api/v1/transactions", {
        "user_id": user_a.id,
        "amount": 145000.0,
        "payment_method": "IMPS",
        "recipient_identifier": "unverified-vendor@bank",
        "recipient_display_name": "Unverified Vendor Wire",
        "device_identifier": "dev-rayan-phone",
        "device_name": "Rayan Android Device",
        "device_type": "Mobile App"
    })
    g_req_rej = post(f"{API_BASE}/api/v1/guardian/requests", {
        "transaction_id": txn_rej["id"],
        "trusted_contact_id": tc.id
    })
    print(f"  Created Request ID {g_req_rej['id']} for Rs. 145,000.0")

    rej_res = post(f"{API_BASE}/api/v1/guardian/requests/{g_req_rej['id']}/reject", {"notes": "Blocked suspicious payment"})
    print(f"  Resolution outcome: {rej_res['outcome']}")
    assert rej_res["outcome"] == "REJECTED"

    txn_rej_check = get(f"{API_BASE}/api/v1/transactions/{txn_rej['id']}")
    print(f"  Transaction {txn_rej['id']} Status: {txn_rej_check['status']}")
    assert txn_rej_check["status"] == "GUARDIAN_REJECTED"

    print("\n" + "*" * 70)
    print("LIVE END-TO-END DIAGNOSTICS COMPLETED SUCCESSFULLY WITH 100% PASS!")
    print("*" * 70)

if __name__ == "__main__":
    run_live_diagnostics()
