import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.core.security import hash_identifier
from app.models.enums import RiskLevel, TransactionStatus
from app.models.recipient import Recipient
from app.models.risk_factor import RiskFactor
from app.models.risk_score import RiskScore
from app.models.transaction import Transaction

client = TestClient(app)

def test_dynamic_flow():
    print("=" * 70)
    print("RUNNING COMPLETE DYNAMIC GUARDIAN NOTIFICATION & ISOLATION SUITE")
    print("=" * 70)

    # -------------------------------------------------------------
    # TEST PAIR 1: User A & User B (Dynamic Creation & Approval)
    # -------------------------------------------------------------
    print("\n--- [TEST PAIR 1: User A & User B] ---")
    suffix_1 = int(time.time()) % 100000
    phone_a = f"+9198765{suffix_1:05d}"
    phone_b = f"+9198766{suffix_1:05d}"
    name_a = f"Dynamic Sender {suffix_1}"
    name_b = f"Dynamic Guardian {suffix_1}"

    headers_1 = {"X-Forwarded-For": f"10.1.{suffix_1 % 255}.1"}

    # 1. Register User A
    res_a = client.post("/api/v1/auth/signup", json={"fullName": name_a, "mobileNumber": phone_a, "password": "Password123!"}, headers=headers_1)
    assert res_a.status_code == 201, res_a.text
    user_a_id = res_a.json()["userId"]
    code_a = res_a.json().get("devTestCode", "123456")
    client.post("/api/v1/auth/verify-otp", json={"userId": user_a_id, "otp": code_a}, headers=headers_1)

    # 2. Register User B
    res_b = client.post("/api/v1/auth/signup", json={"fullName": name_b, "mobileNumber": phone_b, "password": "Password123!"}, headers=headers_1)
    assert res_b.status_code == 201, res_b.text
    user_b_id = res_b.json()["userId"]
    code_b = res_b.json().get("devTestCode", "123456")
    client.post("/api/v1/auth/verify-otp", json={"userId": user_b_id, "otp": code_b}, headers=headers_1)
    print(f"Registered User A (ID={user_a_id}, Name='{name_a}') and User B (ID={user_b_id}, Name='{name_b}')")

    # 3. User A adds User B as trusted contact
    res_tc = client.post(f"/api/v1/users/{user_a_id}/trusted-contacts", json={
        "name": name_b,
        "phone_number": phone_b,
        "relationship": "Trusted Friend"
    })
    assert res_tc.status_code == 201, res_tc.text
    tc_data = res_tc.json()
    assert tc_data["guardian_user_id"] == user_b_id, f"Expected guardian_user_id={user_b_id}, got {tc_data.get('guardian_user_id')}"
    print(f"User A added User B as trusted contact -> Resolved guardian_user_id={tc_data['guardian_user_id']}")

    # 4. User A creates High-Risk Transaction via API
    res_txn = client.post("/api/v1/transactions", json={
        "user_id": user_a_id,
        "amount": 72000.0,
        "payment_method": "UPI",
        "recipient_identifier": f"crypto-{suffix_1}@upi",
        "recipient_display_name": "Nexus Crypto Desk",
        "device_identifier": f"dev-{suffix_1}",
        "device_name": "Pixel 8 Pro",
        "device_type": "Mobile App"
    })
    assert res_txn.status_code == 201, res_txn.text
    txn_id = res_txn.json()["id"]

    # 5. Trigger Guardian Request
    res_req = client.post("/api/v1/guardian/requests", json={
        "transaction_id": txn_id,
        "trusted_contact_id": tc_data["id"]
    })
    assert res_req.status_code == 201, res_req.text
    req_data = res_req.json()
    assert req_data["sender_name"] == name_a, f"Expected sender_name={name_a}, got {req_data.get('sender_name')}"
    assert req_data["recipient_name"] == "Nexus Crypto Desk"
    assert req_data["transaction_amount"] == 72000.0
    print(f"GuardianRequest created (ID={req_data['id']}): Sender='{req_data['sender_name']}', Amount={req_data['transaction_amount']}")

    # 6. Verify Notification Isolation: User A (Sender) vs User B (Guardian)
    res_poll_a = client.get(f"/api/v1/guardian/requests/by-guardian-user/{user_a_id}")
    assert res_poll_a.status_code == 200
    assert len(res_poll_a.json()) == 0, f"Sender User A should receive 0 notifications, got {len(res_poll_a.json())}"
    print("Verified User A (Sender) receives 0 guardian notifications.")

    res_poll_b = client.get(f"/api/v1/guardian/requests/by-guardian-user/{user_b_id}")
    assert res_poll_b.status_code == 200
    b_notifs = res_poll_b.json()
    assert len(b_notifs) == 1, f"Guardian User B should receive 1 notification, got {len(b_notifs)}"
    assert b_notifs[0]["id"] == req_data["id"]
    assert b_notifs[0]["sender_name"] == name_a
    assert b_notifs[0]["transaction_amount"] == 72000.0
    print(f"Verified User B (Guardian) received the pending notification (Amount={b_notifs[0]['transaction_amount']}, Sender='{b_notifs[0]['sender_name']}')")

    # 7. User B Approves
    res_app = client.post(f"/api/v1/guardian/requests/{req_data['id']}/approve")
    assert res_app.status_code == 200, res_app.text
    assert res_app.json()["outcome"] == "APPROVED"
    print("User B approved the request -> Status is APPROVED.")

    # -------------------------------------------------------------
    # TEST PAIR 2: User C & User D (Late Registration & Rejection)
    # -------------------------------------------------------------
    print("\n--- [TEST PAIR 2: User C & User D (Late Registration & Rejection)] ---")
    suffix_2 = (suffix_1 + 1234) % 100000
    phone_c = f"+9198771{suffix_2:05d}"
    phone_d = f"+9198772{suffix_2:05d}"
    name_c = f"Dynamic Sender {suffix_2}"
    name_d = f"Dynamic Guardian {suffix_2}"

    headers_2 = {"X-Forwarded-For": f"10.2.{suffix_2 % 255}.1"}

    # 1. Register User C
    res_c = client.post("/api/v1/auth/signup", json={"fullName": name_c, "mobileNumber": phone_c, "password": "Password123!"}, headers=headers_2)
    assert res_c.status_code == 201, res_c.text
    user_c_id = res_c.json()["userId"]
    code_c = res_c.json().get("devTestCode", "123456")
    client.post("/api/v1/auth/verify-otp", json={"userId": user_c_id, "otp": code_c}, headers=headers_2)

    # 2. User C adds unregistered phone_d as trusted contact
    res_tc2 = client.post(f"/api/v1/users/{user_c_id}/trusted-contacts", json={
        "name": name_d,
        "phone_number": phone_d,
        "relationship": "Family"
    })
    tc2_data = res_tc2.json()
    assert tc2_data["guardian_user_id"] is None, "guardian_user_id should initially be None before registration"
    print("User C added unregistered phone as trusted contact (guardian_user_id is None).")

    # 3. User C creates High-Risk Transaction via API
    res_txn2 = client.post("/api/v1/transactions", json={
        "user_id": user_c_id,
        "amount": 95000.0,
        "payment_method": "IMPS",
        "recipient_identifier": f"wire-{suffix_2}@bank",
        "recipient_display_name": "Global Wire Exchange",
        "device_identifier": f"dev-{suffix_2}",
        "device_name": "Galaxy S24",
        "device_type": "Mobile App"
    })
    assert res_txn2.status_code == 201, res_txn2.text
    txn2_id = res_txn2.json()["id"]

    # 4. Trigger Guardian Request
    res_req2 = client.post("/api/v1/guardian/requests", json={
        "transaction_id": txn2_id,
        "trusted_contact_id": tc2_data["id"]
    })
    assert res_req2.status_code == 201
    req2_data = res_req2.json()

    # 5. User D registers late
    res_d = client.post("/api/v1/auth/signup", json={"fullName": name_d, "mobileNumber": phone_d, "password": "Password123!"}, headers=headers_2)
    assert res_d.status_code == 201, res_d.text
    user_d_id = res_d.json()["userId"]
    code_d = res_d.json().get("devTestCode", "123456")
    client.post("/api/v1/auth/verify-otp", json={"userId": user_d_id, "otp": code_d}, headers=headers_2)
    print(f"User D registered late (ID={user_d_id}).")

    # 6. User D polls /by-guardian-user/{user_d_id}
    res_poll_d = client.get(f"/api/v1/guardian/requests/by-guardian-user/{user_d_id}")
    assert res_poll_d.status_code == 200
    d_notifs = res_poll_d.json()
    assert len(d_notifs) == 1, f"User D should receive 1 notification after late registration, got {len(d_notifs)}"
    assert d_notifs[0]["id"] == req2_data["id"]
    assert d_notifs[0]["sender_name"] == name_c
    print(f"User D received notification via dynamic backlink! (Amount={d_notifs[0]['transaction_amount']}, Sender='{d_notifs[0]['sender_name']}')")

    # 7. User D Rejects
    res_rej = client.post(f"/api/v1/guardian/requests/{req2_data['id']}/reject")
    assert res_rej.status_code == 200
    assert res_rej.json()["outcome"] == "REJECTED"
    print("User D rejected the request -> Status is REJECTED.")

    # -------------------------------------------------------------
    # TEST PAIR 3: Phone Formatting Variations (Spaces, Country Code, Hyphens)
    # -------------------------------------------------------------
    print("\n--- [TEST PAIR 3: Phone Formatting Variations] ---")
    suffix_3 = (suffix_1 + 5678) % 100000
    raw_digits_e = f"98781{suffix_3:05d}"
    raw_digits_f = f"98782{suffix_3:05d}"
    phone_e_signup = f"+91 {raw_digits_e[:5]} {raw_digits_e[5:]}"
    phone_f_signup = f"+91-{raw_digits_f[:5]}-{raw_digits_f[5:]}"
    phone_f_added_by_e = f"{raw_digits_f}"

    name_e = f"Sender Format {suffix_3}"
    name_f = f"Guardian Format {suffix_3}"

    headers_3 = {"X-Forwarded-For": f"10.3.{suffix_3 % 255}.1"}

    res_e = client.post("/api/v1/auth/signup", json={"fullName": name_e, "mobileNumber": phone_e_signup, "password": "Password123!"}, headers=headers_3)
    assert res_e.status_code == 201, res_e.text
    user_e_id = res_e.json()["userId"]
    client.post("/api/v1/auth/verify-otp", json={"userId": user_e_id, "otp": res_e.json().get("devTestCode", "123456")}, headers=headers_3)

    res_f = client.post("/api/v1/auth/signup", json={"fullName": name_f, "mobileNumber": phone_f_signup, "password": "Password123!"}, headers=headers_3)
    assert res_f.status_code == 201, res_f.text
    user_f_id = res_f.json()["userId"]
    client.post("/api/v1/auth/verify-otp", json={"userId": user_f_id, "otp": res_f.json().get("devTestCode", "123456")}, headers=headers_3)

    # User E adds User F using 10 digits without prefix
    res_tc3 = client.post(f"/api/v1/users/{user_e_id}/trusted-contacts", json={
        "name": name_f,
        "phone_number": phone_f_added_by_e,
        "relationship": "Advisor"
    })
    assert res_tc3.status_code == 201, res_tc3.text
    tc3_data = res_tc3.json()
    assert tc3_data["guardian_user_id"] == user_f_id, f"Expected guardian_user_id={user_f_id} across format variations, got {tc3_data.get('guardian_user_id')}"
    print(f"Matched format variation '{phone_f_added_by_e}' to registered '{phone_f_signup}' -> guardian_user_id={user_f_id}")

    # User E creates High-Risk Transaction via API
    res_txn3 = client.post("/api/v1/transactions", json={
        "user_id": user_e_id,
        "amount": 55000.0,
        "payment_method": "UPI",
        "recipient_identifier": f"advisor-{suffix_3}@upi",
        "recipient_display_name": "Advisory Desk",
        "device_identifier": f"dev-{suffix_3}",
        "device_name": "iPhone 15 Pro",
        "device_type": "Mobile App"
    })
    assert res_txn3.status_code == 201, res_txn3.text
    txn3_id = res_txn3.json()["id"]

    # Trigger Guardian Request
    res_req3 = client.post("/api/v1/guardian/requests", json={
        "transaction_id": txn3_id,
        "trusted_contact_id": tc3_data["id"]
    })
    assert res_req3.status_code == 201
    req3_data = res_req3.json()

    # User F polls and approves
    res_poll_f = client.get(f"/api/v1/guardian/requests/by-guardian-user/{user_f_id}")
    assert res_poll_f.status_code == 200
    f_notifs = res_poll_f.json()
    assert len(f_notifs) == 1
    assert f_notifs[0]["id"] == req3_data["id"]
    assert f_notifs[0]["sender_name"] == name_e
    print(f"User F received notification (Amount={f_notifs[0]['transaction_amount']}, Sender='{f_notifs[0]['sender_name']}')")

    res_app3 = client.post(f"/api/v1/guardian/requests/{req3_data['id']}/approve")
    assert res_app3.status_code == 200
    assert res_app3.json()["outcome"] == "APPROVED"
    print("User F approved payment -> Status is APPROVED.")

    print("\n" + "*" * 70)
    print("ALL DYNAMIC GUARDIAN NOTIFICATION & ISOLATION TESTS PASSED 100%!")
    print("*" * 70)

if __name__ == "__main__":
    test_dynamic_flow()
