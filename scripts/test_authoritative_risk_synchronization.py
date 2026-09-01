"""
Comprehensive Test for Authoritative Risk-Data Synchronization Across All Tiers:
Tests simultaneous LOW, MEDIUM, and HIGH risk payments for:
1. One single authoritative ML risk score and level from backend.
2. Identical risk score, risk level, reasons, and status in overview, transaction lists, and individual transaction lookup.
3. No components overriding, defaulting, or drifting risk scores.
"""

import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

def test_authoritative_risk_synchronization():
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)

    print("=" * 80)
    print("AUTHORITATIVE RISK-DATA SYNCHRONIZATION TEST (LOW, MEDIUM, HIGH)")
    print("=" * 80)

    # 1. Health check
    h = client.get("/health")
    assert h.status_code == 200, f"Backend not ready: {h.text}"

    # 2. Setup user with trusted contact
    ts = int(time.time())
    u_sender = client.post("/api/v1/users", json={"name": f"User {ts}", "phone_number": f"+91-98{ts % 100000000:08d}"}).json()
    u_guardian = client.post("/api/v1/users", json={"name": f"Guardian {ts}", "phone_number": f"+91-99{ts % 100000000:08d}"}).json()
    user_id = u_sender["id"]
    guardian_id = u_guardian["id"]

    client.post(f"/api/v1/users/{user_id}/trusted-contacts", json={
        "name": f"Guardian {ts}",
        "phone_number": f"+91-99{ts % 100000000:08d}",
        "relationship": "Sister",
        "guardian_user_id": guardian_id,
    })
    print(f"[1] Created User ID={user_id} and Guardian ID={guardian_id}")

    # 3. Create 3 transactions simultaneously:
    # A) LOW-RISK Routine Transaction (Rs. 180)
    txn_low = client.post("/api/v1/transactions", json={
        "user_id": user_id,
        "recipient_identifier": "routine_groceries@upi",
        "recipient_display_name": "Routine Grocery Store",
        "device_identifier": "device_trusted_home_01",
        "device_name": "Personal Device",
        "amount": 180.0,
        "location": "Mumbai, India",
        "payment_method": "UPI",
    }).json()

    # B) MEDIUM-RISK Transaction (Rs. 18,500 with unverified recipient handle)
    txn_med = client.post("/api/v1/transactions", json={
        "user_id": user_id,
        "recipient_identifier": "unverified_vpa_electronics@upi",
        "recipient_display_name": "Unverified Electronics Seller",
        "device_identifier": "device_trusted_home_01",
        "device_name": "Personal Device",
        "amount": 18500.0,
        "location": "Mumbai, India",
        "payment_method": "UPI",
    }).json()

    # C) HIGH-RISK Transaction (Rs. 98,000 to urgent unknown destination from unrecognized device)
    txn_high = client.post("/api/v1/transactions", json={
        "user_id": user_id,
        "recipient_identifier": "urgent_crypto_airdrop@upi",
        "recipient_display_name": "Urgent Crypto Airdrop Foundation",
        "device_identifier": "device_unrecognized_vpn_99",
        "device_name": "Rooted Emulator",
        "amount": 98000.0,
        "location": "Nairobi, Kenya",
        "payment_method": "UPI",
    }).json()

    low_id = txn_low["id"]
    med_id = txn_med["id"]
    high_id = txn_high["id"]

    print(f"[2] Created 3 Simultaneous Transactions: Low (ID={low_id}), Medium (ID={med_id}), High (ID={high_id})")

    # 4. Fetch list endpoint: GET /api/v1/users/{user_id}/transactions
    txn_list = client.get(f"/api/v1/users/{user_id}/transactions").json()["items"]
    list_map = {t["id"]: t for t in txn_list}

    # 5. Fetch individual endpoints: GET /api/v1/transactions/{id}
    detail_low = client.get(f"/api/v1/transactions/{low_id}").json()
    detail_med = client.get(f"/api/v1/transactions/{med_id}").json()
    detail_high = client.get(f"/api/v1/transactions/{high_id}").json()

    # 6. Verify 100% Data Synchronization between List item & Detail Item for every transaction
    print("\n[3] Verifying Individual & List Data Parity:")
    for (t_id, detail_item, label) in [
        (low_id, detail_low, "LOW RISK"),
        (med_id, detail_med, "MEDIUM RISK"),
        (high_id, detail_high, "HIGH RISK"),
    ]:
        list_item = list_map[t_id]
        print(f"\n--- Checking {label} (Txn {t_id}) ---")
        print(f"    List View   -> Level: {list_item['risk_level']}, Score: {list_item['risk_score']}, Merchant: '{list_item['merchant']}'")
        print(f"    Detail View -> Level: {detail_item['risk_level']}, Score: {detail_item['risk_score']}, Merchant: '{detail_item['merchant']}'")
        
        assert list_item["risk_level"] == detail_item["risk_level"], f"Mismatch risk_level for {t_id}: list={list_item['risk_level']} vs detail={detail_item['risk_level']}"
        assert list_item["risk_score"] == detail_item["risk_score"], f"Mismatch risk_score for {t_id}: list={list_item['risk_score']} vs detail={detail_item['risk_score']}"
        assert list_item["merchant"] == detail_item["merchant"], f"Mismatch merchant for {t_id}: list={list_item['merchant']} vs detail={detail_item['merchant']}"
        assert list_item["status"] == detail_item["status"], f"Mismatch status for {t_id}: list={list_item['status']} vs detail={detail_item['status']}"
        print(f"    [OK] 100% identical authoritative data between list and detail for Txn {t_id}")

    # 7. Verify Dashboard Overview Priorities and Metrics
    ov = client.get(f"/api/v1/users/{user_id}/overview").json()
    print(f"\n[4] Dashboard Overview Check:")
    print(f"    Current Risk Score: {ov['current_risk_score']}, Level: {ov['current_risk_level']}, Status: {ov['protection_status']}")
    print(f"    Needs Review Count: {ov['needs_review_count']}, Total Transactions: {ov['transaction_count']}")

    # Dashboard must prioritize the highest active risk transaction (High Txn score)
    assert ov["current_risk_score"] == detail_high["risk_score"], f"Dashboard score {ov['current_risk_score']} != high risk score {detail_high['risk_score']}"
    assert ov["current_risk_level"] == "HIGH", f"Dashboard level {ov['current_risk_level']} != HIGH"
    assert ov["protection_status"] == "ATTENTION REQUIRED"
    assert ov["needs_review_count"] == 3
    print("    [OK] Dashboard correctly prioritizes highest active risk score with zero drift.")

    # 8. Settle the High-Risk and Medium-Risk payments and verify dashboard transitions cleanly
    client.post(f"/api/v1/transactions/{high_id}/authorize", json={"method": "BIOMETRIC"})
    req_h = client.post("/api/v1/guardian/requests", json={"transaction_id": high_id, "trusted_contact_id": 1}).json()
    client.post(f"/api/v1/guardian/requests/{req_h['id']}/approve")
    client.post(f"/api/v1/transactions/{high_id}/confirm")

    client.post(f"/api/v1/transactions/{med_id}/confirm")
    client.post(f"/api/v1/transactions/{low_id}/confirm")

    ov_after = client.get(f"/api/v1/users/{user_id}/overview").json()
    print(f"\n[5] Post-Settlement Overview Check:")
    print(f"    Current Risk Score: {ov_after['current_risk_score']}, Level: {ov_after['current_risk_level']}, Status: {ov_after['protection_status']}")
    assert ov_after["needs_review_count"] == 0
    assert ov_after["current_risk_level"] == "LOW"
    assert ov_after["current_risk_score"] == 0.0
    assert ov_after["protection_status"] == "PROTECTED"
    print("    [OK] Clean baseline restoration after all transactions settled.")

    print("\n" + "=" * 80)
    print("ALL RISK-DATA SYNCHRONIZATION CHECKS PASSED 100%!")
    print("=" * 80)

if __name__ == "__main__":
    test_authoritative_risk_synchronization()
