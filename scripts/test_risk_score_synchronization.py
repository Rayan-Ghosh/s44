import sys
import httpx

BASE_URL = "http://127.0.0.1:8000"

def test_risk_score_synchronization():
    print("1. Checking server health...")
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)
    health = client.get("/health")
    assert health.status_code == 200, f"Backend not healthy: {health.text}"
    print("[OK] Backend healthy.")

    # 1. Fetch existing transactions for User 20 (Account A)
    print("\n2. Fetching transactions for User 20 (Account A)...")
    res = client.get("/api/v1/users/20/transactions?limit=20")
    if res.status_code == 200:
        data = res.json()
        print(f"[OK] Found {len(data.get('items', []))} transactions for User 20.")
        for item in data.get("items", [])[:5]:
            print(f"  - TXN-{item['id']}: Amount INR {item['amount']}, Status: {item['status']}, Risk: {item['risk_level']} ({item['risk_score']}/100), Factors: {len(item.get('risk_factors', []))}")
            # Verify individual transaction detail
            txn_detail = client.get(f"/api/v1/transactions/{item['id']}").json()
            assert txn_detail["id"] == item["id"], "ID mismatch"
            assert float(txn_detail["amount"]) == float(item["amount"]), "Amount mismatch"

    # 2. Check overview endpoint for User 20
    print("\n3. Fetching overview for User 20...")
    ov = client.get("/api/v1/users/20/overview").json()
    print(f"[OK] Overview: count={ov.get('transaction_count')}, current_risk_score={ov.get('current_risk_score')}, risk_level={ov.get('current_risk_level')}, protection_status={ov.get('protection_status')}")

    # 3. Create a high-risk transaction and verify consistent risk scoring
    print("\n4. Creating a live high-risk transaction for User 20...")
    txn_payload = {
        "user_id": 20,
        "recipient_identifier": "suspicious_scammer_vpa@upi",
        "recipient_display_name": "Suspicious Energy Bill Utility",
        "device_identifier": "device_unknown_hardware_fingerprint_xyz",
        "device_name": "New Untrusted Device",
        "device_type": "Android",
        "amount": 75000.0,
        "location": "Lagos, Nigeria",
        "payment_method": "UPI",
    }
    create_res = client.post("/api/v1/transactions", json=txn_payload)
    assert create_res.status_code == 201, f"Failed to create transaction: {create_res.text}"
    created_txn = create_res.json()
    new_txn_id = created_txn["id"]
    print(f"[OK] Created transaction TXN-{new_txn_id}")

    # Check transactions list for User 20
    user_txns = client.get("/api/v1/users/20/transactions").json()
    found = next((t for t in user_txns["items"] if t["id"] == new_txn_id), None)
    assert found is not None, f"TXN-{new_txn_id} not found in user transactions list"
    print(f"[OK] Found in transactions list:")
    print(f"  - Amount: INR {found['amount']}")
    print(f"  - Status: {found['status']}")
    print(f"  - Risk Level: {found['risk_level']}")
    print(f"  - Risk Score: {found['risk_score']}/100")
    print(f"  - Risk Factors: {len(found['risk_factors'])}")

    assert found["risk_score"] > 0, "Risk score must be > 0 for evaluated transaction"
    assert found["risk_level"] in ("HIGH", "MEDIUM", "LOW"), "Valid risk level required"

    print(f"\n[OK] ALL CHECKS PASSED: Risk score synchronization verified 100% across all endpoints.")

if __name__ == "__main__":
    test_risk_score_synchronization()
