"""
Multi-Pair End-to-End Test Suite for Mandatory Guardian Approval:
1. Dynamic User/Guardian Pair 1: High-Risk -> Verify & Continue -> Guardian Hold -> Direct Confirm Blocked -> Guardian Approves -> Payment Completes
2. Dynamic User/Guardian Pair 2: High-Risk -> Verify & Continue -> Guardian Hold -> Guardian Rejects -> Payment Blocked
3. Dynamic User/Guardian Pair 3: Low-Risk -> No Guardian Hold -> Direct Completion
4. Multi-Guardian Notification Isolation & Refresh Persistence Check
"""

import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

def test_mandatory_guardian_approval_suite():
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)

    print("=" * 80)
    print("MANDATORY GUARDIAN APPROVAL FLOW: MULTI-PAIR DYNAMIC VALIDATION SUITE")
    print("=" * 80)

    # 1. Health check
    h = client.get("/health")
    assert h.status_code == 200, f"Backend not ready: {h.text}"
    print("[0/4] Backend health verified.")

    # ------------------------------------------------------------------------
    # PAIR 1: Sender A & Guardian A (Approve Flow)
    # ------------------------------------------------------------------------
    ts1 = int(time.time())
    u_sender_a = client.post("/api/v1/users", json={"name": f"Sender A {ts1}", "phone_number": f"+91-91{ts1 % 100000000:08d}"}).json()
    u_guardian_a = client.post("/api/v1/users", json={"name": f"Guardian A {ts1}", "phone_number": f"+91-92{ts1 % 100000000:08d}"}).json()
    sender_a_id = u_sender_a["id"]
    guardian_a_id = u_guardian_a["id"]

    contact_a = client.post(f"/api/v1/users/{sender_a_id}/trusted-contacts", json={
        "name": f"Guardian A {ts1}",
        "phone_number": f"+91-92{ts1 % 100000000:08d}",
        "relationship": "Father",
        "guardian_user_id": guardian_a_id,
    }).json()
    print(f"\n[1/4] PAIR 1 SETUP: Sender A (ID={sender_a_id}) -> Guardian A (ID={guardian_a_id}, Contact={contact_a['id']})")

    # High risk transaction for Sender A
    txn_a = client.post("/api/v1/transactions", json={
        "user_id": sender_a_id,
        "recipient_identifier": "urgent_scam_bill@upi",
        "recipient_display_name": "Suspicious Electricity Billing Scam",
        "device_identifier": "device_unrecognized_a1",
        "device_name": "Rooted Emulator",
        "amount": 75000.0,
        "location": "Bangkok, Thailand",
        "payment_method": "UPI",
    }).json()
    txn_a_id = txn_a["id"]
    print(f"      Created High-Risk Txn A: ID={txn_a_id}, Amount=Rs.75000, Status={txn_a['status']}")

    # Sender A performs biometric identity verification
    auth_a = client.post(f"/api/v1/transactions/{txn_a_id}/authorize", json={"method": "BIOMETRIC"}).json()
    assert auth_a["authorization_status"] == "AUTHORIZED"
    print(f"      Sender A authorized with Biometrics (Integrity Hash: {auth_a['integrity_hash'][:16]}...)")

    # Create Guardian Request
    req_a = client.post("/api/v1/guardian/requests", json={
        "transaction_id": txn_a_id,
        "trusted_contact_id": contact_a["id"],
    }).json()
    req_a_id = req_a["id"]
    print(f"      GuardianRequest A Created: ID={req_a_id}, Remaining={req_a['remaining_seconds']}s, Outcome={req_a['outcome']}")
    assert req_a["remaining_seconds"] > 0

    # Verify transaction status is PENDING_GUARDIAN_APPROVAL
    txn_a_held = client.get(f"/api/v1/transactions/{txn_a_id}").json()
    assert txn_a_held["status"] == "PENDING_GUARDIAN_APPROVAL"
    print(f"      Transaction status transitioned to: {txn_a_held['status']}")

    # Verify direct confirm is BLOCKED
    direct_confirm_a = client.post(f"/api/v1/transactions/{txn_a_id}/confirm")
    assert direct_confirm_a.status_code in (400, 403), f"Expected direct confirmation to be blocked, but got {direct_confirm_a.status_code}"
    print(f"      [SECURITY OK] Direct payment completion blocked while awaiting guardian approval: {direct_confirm_a.json()['detail']}")

    # ------------------------------------------------------------------------
    # PAIR 2: Sender B & Guardian B (Reject Flow)
    # ------------------------------------------------------------------------
    ts2 = ts1 + 100
    u_sender_b = client.post("/api/v1/users", json={"name": f"Sender B {ts2}", "phone_number": f"+91-93{ts2 % 100000000:08d}"}).json()
    u_guardian_b = client.post("/api/v1/users", json={"name": f"Guardian B {ts2}", "phone_number": f"+91-94{ts2 % 100000000:08d}"}).json()
    sender_b_id = u_sender_b["id"]
    guardian_b_id = u_guardian_b["id"]

    contact_b = client.post(f"/api/v1/users/{sender_b_id}/trusted-contacts", json={
        "name": f"Guardian B {ts2}",
        "phone_number": f"+91-94{ts2 % 100000000:08d}",
        "relationship": "Spouse",
        "guardian_user_id": guardian_b_id,
    }).json()
    print(f"\n[2/4] PAIR 2 SETUP: Sender B (ID={sender_b_id}) -> Guardian B (ID={guardian_b_id}, Contact={contact_b['id']})")

    txn_b = client.post("/api/v1/transactions", json={
        "user_id": sender_b_id,
        "recipient_identifier": "phishing_reward_club@upi",
        "recipient_display_name": "Lottery Win Reward Club",
        "device_identifier": "device_unrecognized_b2",
        "device_name": "Virtual Android Device",
        "amount": 110000.0,
        "location": "Saint Petersburg, Russia",
        "payment_method": "UPI",
    }).json()
    txn_b_id = txn_b["id"]

    client.post(f"/api/v1/transactions/{txn_b_id}/authorize", json={"method": "BIOMETRIC"})
    req_b = client.post("/api/v1/guardian/requests", json={
        "transaction_id": txn_b_id,
        "trusted_contact_id": contact_b["id"],
    }).json()
    req_b_id = req_b["id"]
    print(f"      GuardianRequest B Created: ID={req_b_id}, Remaining={req_b['remaining_seconds']}s")

    # ------------------------------------------------------------------------
    # NOTIFICATION ISOLATION VERIFICATION
    # ------------------------------------------------------------------------
    print("\n[3/4] Verifying Dynamic Notification Routing & Strict User Isolation...")
    notifs_ga = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian_a_id}").json()
    notifs_gb = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian_b_id}").json()
    notifs_sa = client.get(f"/api/v1/guardian/requests/by-guardian-user/{sender_a_id}").json()
    notifs_sb = client.get(f"/api/v1/guardian/requests/by-guardian-user/{sender_b_id}").json()

    assert len(notifs_ga) == 1 and notifs_ga[0]["id"] == req_a_id, f"Guardian A must receive only Req A: {notifs_ga}"
    assert len(notifs_gb) == 1 and notifs_gb[0]["id"] == req_b_id, f"Guardian B must receive only Req B: {notifs_gb}"
    assert len(notifs_sa) == 0, f"Sender A must have 0 incoming approval notifications"
    assert len(notifs_sb) == 0, f"Sender B must have 0 incoming approval notifications"
    print(f"      [OK] Guardian A sees ONLY Request A (ID={req_a_id})")
    print(f"      [OK] Guardian B sees ONLY Request B (ID={req_b_id})")
    print(f"      [OK] Senders A & B see 0 incoming notification requests")

    # ------------------------------------------------------------------------
    # RESOLUTION & SENDER PAY / BLOCK EXECUTION
    # ------------------------------------------------------------------------
    print("\n[4/4] Executing Approval & Rejection Decisions...")
    
    # Guardian A Approves
    appr_a = client.post(f"/api/v1/guardian/requests/{req_a_id}/approve", json={"notes": "Approved by Father"}).json()
    assert appr_a["outcome"] == "APPROVED"
    txn_a_appr = client.get(f"/api/v1/transactions/{txn_a_id}").json()
    assert txn_a_appr["status"] == "GUARDIAN_APPROVED"
    print(f"      Guardian A APPROVED Request {req_a_id} -> Txn status: {txn_a_appr['status']}")

    # Sender A confirms payment after approval
    conf_a = client.post(f"/api/v1/transactions/{txn_a_id}/confirm")
    assert conf_a.status_code == 200
    txn_a_final = client.get(f"/api/v1/transactions/{txn_a_id}").json()
    assert txn_a_final["status"] == "CONFIRMED"
    print(f"      [OK] Sender A completed payment -> Status: {txn_a_final['status']}")

    # Guardian B Rejects
    rej_b = client.post(f"/api/v1/guardian/requests/{req_b_id}/reject", json={"notes": "Rejected by Spouse: Potential Fraud"}).json()
    assert rej_b["outcome"] == "REJECTED"
    txn_b_rej = client.get(f"/api/v1/transactions/{txn_b_id}").json()
    assert txn_b_rej["status"] == "GUARDIAN_REJECTED"
    print(f"      Guardian B REJECTED Request {req_b_id} -> Txn status: {txn_b_rej['status']}")

    # Sender B attempt to confirm rejected payment MUST FAIL
    conf_b = client.post(f"/api/v1/transactions/{txn_b_id}/confirm")
    assert conf_b.status_code in (400, 403)
    print(f"      [SECURITY OK] Sender B cannot confirm rejected payment: {conf_b.json()['detail']}")

    # ------------------------------------------------------------------------
    # PAIR 3: Low-Risk Non-Guardian Flow
    # ------------------------------------------------------------------------
    ts3 = ts1 + 200
    u_sender_c = client.post("/api/v1/users", json={"name": f"Sender C {ts3}", "phone_number": f"+91-95{ts3 % 100000000:08d}"}).json()
    sender_c_id = u_sender_c["id"]

    txn_c = client.post("/api/v1/transactions", json={
        "user_id": sender_c_id,
        "recipient_identifier": "routine_dairy_milk@upi",
        "recipient_display_name": "Routine Dairy & Milk Corner",
        "device_identifier": "device_home_c3",
        "device_name": "Personal Phone",
        "amount": 150.0,
        "location": "Mumbai, India",
        "payment_method": "UPI",
    }).json()
    txn_c_id = txn_c["id"]
    print(f"\n      PAIR 3: Low-Risk Routine Payment ID={txn_c_id} (Rs.150)")

    # Low risk payment confirms directly without guardian intervention
    conf_c = client.post(f"/api/v1/transactions/{txn_c_id}/confirm")
    assert conf_c.status_code == 200
    txn_c_final = client.get(f"/api/v1/transactions/{txn_c_id}").json()
    assert txn_c_final["status"] == "CONFIRMED"
    print(f"      [OK] Low-Risk payment confirmed directly without guardian hold: {txn_c_final['status']}")

    print("\n" + "=" * 80)
    print("MANDATORY GUARDIAN APPROVAL SUITE PASSED 100% ACROSS ALL PAIRS!")
    print("=" * 80)

if __name__ == "__main__":
    test_mandatory_guardian_approval_suite()
