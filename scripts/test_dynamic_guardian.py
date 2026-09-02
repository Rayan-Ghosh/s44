import sys
from pathlib import Path
import time

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.user import User

client = TestClient(app)
suffix = str(int(time.time()))[-4:]

print("===============================================================")
print("RUNNING 100% DATABASE-DRIVEN DYNAMIC GUARDIAN VERIFICATION SUITE")
print("===============================================================")

# ---------------------------------------------------------------------------
# Test Flow 1: Dynamic Guardian Linkage & Approval Flow
# ---------------------------------------------------------------------------
sender_phone = f"+91-98765-1{suffix}"
guardian_phone = f"+91-98765-2{suffix}"

print(f"\n[Test 1] Registering dynamic Sender ({sender_phone}) and Guardian ({guardian_phone})...")
sender_res = client.post("/api/v1/users", json={"name": f"Sender User {suffix}", "phone_number": sender_phone})
assert sender_res.status_code == 201, f"Failed to create sender: {sender_res.text}"
sender_id = sender_res.json()["id"]

guardian_res = client.post("/api/v1/users", json={"name": f"Guardian User {suffix}", "phone_number": guardian_phone})
assert guardian_res.status_code == 201, f"Failed to create guardian: {guardian_res.text}"
guardian_id = guardian_res.json()["id"]
print(f"  -> Sender User ID: {sender_id}, Guardian User ID: {guardian_id}")

print("\n[Test 1] Sender adds Guardian as Trusted Contact by phone number...")
tc_res = client.post(
    f"/api/v1/users/{sender_id}/trusted-contacts",
    json={"name": f"Guardian User {suffix}", "phone_number": guardian_phone, "relationship": "Sister"},
)
assert tc_res.status_code == 201, f"Failed to add contact: {tc_res.text}"
tc_data = tc_res.json()
gid = tc_data.get("guardian_user_id")
print(f"  -> Dynamically resolved guardian_user_id = {gid}")
assert gid == guardian_id, f"Expected guardian_user_id={guardian_id}, got {gid}"

print("\n[Test 1] Sender initiates High-Risk Payment...")
txn_res = client.post(
    "/api/v1/transactions",
    json={
        "user_id": sender_id,
        "recipient_identifier": "unknown.crypto@upi",
        "recipient_display_name": "Apex Crypto Exchange",
        "device_identifier": f"device-sender-{suffix}",
        "amount": "85000.00",
        "payment_method": "UPI",
    },
)
assert txn_res.status_code == 201, f"Failed to create transaction: {txn_res.text}"
txn_id = txn_res.json()["id"]
print(f"  -> Created Transaction ID: {txn_id}")

print("\n[Test 1] Triggering dynamic Guardian Request...")
guard_res = client.post("/api/v1/guardian/requests", json={"transaction_id": txn_id})
assert guard_res.status_code == 201, f"Failed to trigger guardian request: {guard_res.text}"
g_req_data = guard_res.json()
g_req_id = g_req_data["id"]
print(f"  -> GuardianRequest created: ID={g_req_id}, sender_name='{g_req_data.get('sender_name')}', recipient_name='{g_req_data.get('recipient_name')}'")
assert g_req_data.get("sender_name") == f"Sender User {suffix}"
assert g_req_data.get("recipient_name") == "Apex Crypto Exchange"

print(f"\n[Test 1] Guardian ({guardian_id}) polls pending notifications by user ID...")
pending_res = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian_id}")
assert pending_res.status_code == 200
pending_list = pending_res.json()
assert len(pending_list) == 1
assert pending_list[0]["id"] == g_req_id
assert pending_list[0]["sender_name"] == f"Sender User {suffix}"
assert pending_list[0]["transaction_amount"] == 85000.0
print(f"  -> Guardian successfully received dynamic notification for Rs. {pending_list[0]['transaction_amount']}!")

print("\n[Test 1] Guardian approves payment...")
appr_res = client.post(f"/api/v1/guardian/requests/{g_req_id}/approve", json={"notes": "Approved by guardian sister"})
assert appr_res.status_code == 200

txn_after = client.get(f"/api/v1/transactions/{txn_id}").json()
print(f"  -> Transaction Status: {txn_after.get('status')}")
assert txn_after.get("status") == "GUARDIAN_APPROVED"

# ---------------------------------------------------------------------------
# Test Flow 2: Late Guardian Registration Backlink Flow
# ---------------------------------------------------------------------------
print("\n[Test 2] Late Guardian Signup Backlink Verification...")
user_c_phone = f"+91-98765-3{suffix}"
user_d_phone = f"+91-98765-4{suffix}"

payer_c = client.post("/api/v1/users", json={"name": f"Payer C {suffix}", "phone_number": user_c_phone}).json()
payer_c_id = payer_c["id"]

# User C adds User D BEFORE User D registers
print(f"  -> User C ({payer_c_id}) adds unregistered phone ({user_d_phone}) as trusted contact...")
tc_pre = client.post(
    f"/api/v1/users/{payer_c_id}/trusted-contacts",
    json={"name": f"Future Guardian {suffix}", "phone_number": user_d_phone, "relationship": "Parent"},
).json()
assert tc_pre.get("guardian_user_id") is None
print(f"  -> Initial guardian_user_id is None (as expected)")

# User D now registers
print(f"  -> User D now registers with phone {user_d_phone}...")
user_d = client.post("/api/v1/users", json={"name": f"Guardian D {suffix}", "phone_number": user_d_phone}).json()
user_d_id = user_d["id"]

# Verify contact is now linked
tc_updated_list = client.get(f"/api/v1/users/{payer_c_id}/trusted-contacts").json()
assert len(tc_updated_list) == 1
assert tc_updated_list[0]["guardian_user_id"] == user_d_id
print(f"  -> Contact automatically backlinked! guardian_user_id = {tc_updated_list[0]['guardian_user_id']}")

print("\n***************************************************************")
print("SUCCESS: 100% DATABASE-DRIVEN DYNAMIC GUARDIAN LOOKUP VERIFIED!")
print("***************************************************************")

