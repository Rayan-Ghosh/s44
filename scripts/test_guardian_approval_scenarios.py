"""
Guardian Approval end-to-end scenario test — SAFE DUMMY DATA ONLY.

Creates a self-contained set of QA test accounts (clearly namespaced
"QA Guardian Test *" / phone range +91-77700-000xx, entirely separate from
the real demo accounts such as Rahul Sharma / Ananya Sharma / Priya Nair)
and drives every step through the REAL backend APIs — signup, OTP
verification, transaction creation, the real ML risk-evaluation endpoint,
and the real guardian request lifecycle. Nothing here hardcodes a risk
score or a guardian outcome; every score comes back from a live call to
POST /api/v1/risk/evaluate, and every guardian outcome comes from a live
call to the real approve/reject/user-override endpoints.

Safe to re-run: uses fixed, clearly-marked QA phone numbers; signup calls
that hit "already exists" are treated as "already seeded, log in instead."
Does not touch any existing user, transaction, or trusted contact.

Usage:
    .venv\\Scripts\\python.exe scripts/test_guardian_approval_scenarios.py
Requires the backend already running at BASE_URL (default localhost:8000).
"""

import json
import sys
import time
import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:8000"

FAILURES = []


def check(label, condition, detail=""):
    status = "OK" if condition else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(f"{label} — {detail}")


class Response:
    """Minimal requests.Response-alike so the rest of the script doesn't
    need to know it's built on stdlib urllib (no `requests` package is
    installed in this venv, and this script deliberately adds no new
    dependency)."""

    def __init__(self, status_code, text):
        self.status_code = status_code
        self.text = text

    def json(self):
        return json.loads(self.text) if self.text else None


def _request(method, path, json_body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(json_body).encode("utf-8") if json_body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return Response(resp.status, resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return Response(e.code, e.read().decode("utf-8"))


def post(path, json_body=None, headers=None):
    return _request("POST", path, json_body)


def get(path, headers=None):
    return _request("GET", path)


# ---------------------------------------------------------------------------
# Account provisioning — real signup + real OTP verification, not DB shortcuts
# ---------------------------------------------------------------------------

def signup_and_verify(name: str, phone: str, password: str) -> dict:
    """Returns {"user_id": int, "token": str|None} for a freshly (or
    already) registered + verified account."""
    r = post("/api/v1/auth/signup", {
        "fullName": name,
        "mobileNumber": phone,
        "password": password,
        "deviceId": f"qa-device-{phone}",
    })
    if r.status_code == 409:
        # Already provisioned by a previous run — log in instead.
        login_r = post("/api/v1/auth/login", {"identifier": phone, "password": password})
        if login_r.status_code == 200:
            data = login_r.json()
            return {"user_id": data["user"]["id"], "token": data.get("token")}
        # Could be device-bound to a different session; that's fine for our
        # purposes, we only need the user_id, resolvable via a fresh lookup.
        raise RuntimeError(f"User {phone} exists but re-login failed: {login_r.status_code} {login_r.text}")

    if r.status_code != 201:
        raise RuntimeError(f"Signup failed for {phone}: {r.status_code} {r.text}")

    data = r.json()
    user_id = data["userId"]
    dev_otp = data.get("devTestCode")
    if not dev_otp:
        raise RuntimeError(f"No devTestCode returned for {phone} — dev OTP inspection must be enabled.")

    verify_r = post("/api/v1/auth/verify-otp", {
        "userId": user_id,
        "otp": dev_otp,
        "deviceId": f"qa-device-{phone}",
    })
    if verify_r.status_code != 200:
        raise RuntimeError(f"OTP verify failed for {phone}: {verify_r.status_code} {verify_r.text}")

    vdata = verify_r.json()
    return {"user_id": user_id, "token": vdata.get("token")}


def link_guardian(sender_user_id: int, guardian_name: str, guardian_phone: str, relationship: str) -> dict:
    r = post("/api/v1/guardian/trusted-contacts", {
        "user_id": sender_user_id,
        "contact_name": guardian_name,
        "phone_number": guardian_phone,
        "relationship": relationship,
    })
    if r.status_code != 201:
        # Might already exist from a previous run — fetch the list instead.
        existing = get(f"/api/v1/guardian/trusted-contacts/{sender_user_id}")
        for c in existing.json():
            if c["contact_name"] == guardian_name:
                return c
        raise RuntimeError(f"Could not create or find trusted contact {guardian_name} for user {sender_user_id}: {r.status_code} {r.text}")
    return r.json()


def create_transaction(user_id: int, recipient_id: str, recipient_name: str, device_id: str, amount: float, location: str) -> int:
    r = post("/api/v1/transactions", {
        "user_id": user_id,
        "recipient_identifier": recipient_id,
        "recipient_display_name": recipient_name,
        "device_identifier": device_id,
        "amount": amount,
        "location": location,
        "payment_method": "UPI",
    })
    if r.status_code != 201:
        raise RuntimeError(f"Transaction creation failed: {r.status_code} {r.text}")
    return r.json()["id"]


def evaluate_risk(transaction_id: int) -> dict:
    r = post("/api/v1/risk/evaluate", {"transaction_id": transaction_id})
    if r.status_code != 200:
        raise RuntimeError(f"Risk evaluate failed for txn {transaction_id}: {r.status_code} {r.text}")
    return r.json()


def authorize_transaction(transaction_id: int) -> Response:
    return post(f"/api/v1/transactions/{transaction_id}/authorize", {"method": "BIOMETRIC"})


def create_guardian_request(transaction_id: int) -> dict:
    r = post("/api/v1/guardian/requests", {"transaction_id": transaction_id})
    if r.status_code != 201:
        raise RuntimeError(f"Guardian request creation failed for txn {transaction_id}: {r.status_code} {r.text}")
    return r.json()


def get_transaction(transaction_id: int) -> dict:
    r = get(f"/api/v1/transactions/{transaction_id}")
    return r.json()


# ---------------------------------------------------------------------------
# Scenario driver
# ---------------------------------------------------------------------------

QA_PASSWORD = "QaTest@2026!"

PAIRS = [
    {"tag": "alpha", "sender": ("QA Sender Alpha", "+91-77700-00001"),
     "guardian": ("QA Guardian Alpha", "+91-77700-00002", "Mother")},
    {"tag": "beta", "sender": ("QA Sender Beta", "+91-77700-00003"),
     "guardian": ("QA Guardian Beta", "+91-77700-00004", "Father")},
    {"tag": "gamma", "sender": ("QA Sender Gamma", "+91-77700-00005"),
     "guardian": ("QA Guardian Gamma", "+91-77700-00006", "Sibling")},
    {"tag": "delta", "sender": ("QA Sender Delta", "+91-77700-00007"),
     "guardian": ("QA Guardian Delta", "+91-77700-00008", "Spouse")},
]


def main():
    print("=" * 80)
    print("GUARDIAN APPROVAL — SAFE DUMMY DATA + SCENARIO TESTS")
    print("=" * 80)

    accounts = {}
    for pair in PAIRS:
        tag = pair["tag"]
        s_name, s_phone = pair["sender"]
        g_name, g_phone, rel = pair["guardian"]

        sender = signup_and_verify(s_name, s_phone, QA_PASSWORD)
        guardian = signup_and_verify(g_name, g_phone, QA_PASSWORD)
        contact = link_guardian(sender["user_id"], g_name, g_phone, rel)

        check(
            f"[{tag}] trusted contact auto-linked to guardian's real user account",
            contact.get("guardian_user_id") == guardian["user_id"],
            f"contact.guardian_user_id={contact.get('guardian_user_id')} expected={guardian['user_id']}",
        )

        accounts[tag] = {
            "sender_id": sender["user_id"],
            "guardian_id": guardian["user_id"],
            "contact_id": contact["id"],
            "sender_phone": s_phone,
            "guardian_phone": g_phone,
        }
        print(f"  [{tag}] sender_id={sender['user_id']} guardian_id={guardian['user_id']} contact_id={contact['id']}")

    # -----------------------------------------------------------------
    # Baseline transactions per sender — establishes a normal spending
    # profile (familiar recipient/device, modest amounts) so that a
    # later outlier transaction genuinely reads as anomalous to the ML
    # feature extractors, rather than us inventing the "HIGH" result.
    # -----------------------------------------------------------------
    print("\n--- Seeding baseline transaction history (small, familiar payments) ---")
    for tag, acc in accounts.items():
        for i, amt in enumerate([250, 400, 320, 500], start=1):
            txn_id = create_transaction(
                acc["sender_id"], f"{tag}.regular.merchant@upi", "Regular Merchant",
                f"qa-{tag}-primary-device", amt, "Bengaluru",
            )
            evaluate_risk(txn_id)
        print(f"  [{tag}] 4 baseline transactions seeded")

    # -----------------------------------------------------------------
    # Scenario 6 (low/medium risk must NOT require guardian approval) —
    # done first, on top of the now-established baseline, so these are
    # genuinely "normal-looking" payments.
    # -----------------------------------------------------------------
    print("\n--- Scenario 6: low & medium risk payments must not trigger guardian approval ---")
    low_txn = create_transaction(accounts["alpha"]["sender_id"], "alpha.regular.merchant@upi", "Regular Merchant", "qa-alpha-primary-device", 300, "Bengaluru")
    low_result = evaluate_risk(low_txn)
    check("low-risk txn scores below HIGH threshold (61)", low_result["risk_score"] < 61, f"score={low_result['risk_score']}")
    no_req = get(f"/api/v1/guardian/requests/by-transaction/{low_txn}")
    check("no guardian request exists for the low-risk txn", no_req.status_code == 200 and no_req.json() is None, str(no_req.json()))

    medium_txn = create_transaction(accounts["alpha"]["sender_id"], "alpha.new.medium.recipient@upi", "New Local Shop", "qa-alpha-primary-device", 3500, "Bengaluru")
    medium_result = evaluate_risk(medium_txn)
    check("medium-ish txn scores below HIGH threshold (61)", medium_result["risk_score"] < 61, f"score={medium_result['risk_score']}")
    no_req2 = get(f"/api/v1/guardian/requests/by-transaction/{medium_txn}")
    check("no guardian request exists for the medium txn", no_req2.status_code == 200 and no_req2.json() is None, str(no_req2.json()))

    # -----------------------------------------------------------------
    # High-risk outlier generator: large amount + brand-new device +
    # brand-new recipient, immediately after an established baseline.
    # -----------------------------------------------------------------
    def make_high_risk_txn(tag: str, suffix: str, amount: float) -> tuple:
        acc = accounts[tag]
        txn_id = create_transaction(
            acc["sender_id"],
            f"unknown.suspicious.{tag}.{suffix}@paytm",
            "Unknown High-Risk Recipient",
            f"qa-{tag}-NEW-unrecognised-device-{suffix}",
            amount,
            "New Delhi",
        )
        result = evaluate_risk(txn_id)
        return txn_id, result

    high_txns = {}
    for tag in ["alpha", "beta", "gamma", "delta"]:
        txn_id, result = make_high_risk_txn(tag, "1", 65000)
        check(f"[{tag}] outlier txn genuinely scores HIGH (>=61) via real ML evaluate", result["risk_score"] >= 61, f"score={result['risk_score']} level={result['risk_level']}")
        high_txns[f"{tag}_1"] = (txn_id, result)

    # A second HIGH-risk txn for alpha, reserved for the timeout scenario.
    txn_id, result = make_high_risk_txn("alpha", "2", 72000)
    check("[alpha] second outlier txn also scores HIGH", result["risk_score"] >= 61, f"score={result['risk_score']}")
    high_txns["alpha_2"] = (txn_id, result)

    # -----------------------------------------------------------------
    # Scenario 1: high-risk payment -> confirm -> verification (authorize)
    # -> guardian approval request created -> live countdown data present.
    # -----------------------------------------------------------------
    print("\n--- Scenario 1: high-risk payment -> verification -> guardian request -> countdown ---")
    a1_id, a1_result = high_txns["alpha_1"]
    auth_r = authorize_transaction(a1_id)
    check("[alpha_1] biometric verification (authorize) succeeds pre-guardian", auth_r.status_code == 200, f"{auth_r.status_code} {auth_r.text}")

    req_a1 = create_guardian_request(a1_id)
    check("[alpha_1] guardian request created with PENDING outcome", req_a1["outcome"] == "PENDING")
    check("[alpha_1] guardian request has a live countdown ~120s", 110 <= req_a1["remaining_seconds"] <= 120, f"remaining_seconds={req_a1['remaining_seconds']}")

    pending_for_alpha_contact = get(f"/api/v1/guardian/requests/pending/{accounts['alpha']['contact_id']}").json()
    check("[alpha_1] appears in pending-by-contact listing", any(r["id"] == req_a1["id"] for r in pending_for_alpha_contact))

    pending_by_guardian = get(f"/api/v1/guardian/requests/by-guardian-user/{accounts['alpha']['guardian_id']}").json()
    check("[alpha_1] appears in pending-by-guardian-user listing (what the guardian's app polls)", any(r["id"] == req_a1["id"] for r in pending_by_guardian))
    if pending_by_guardian:
        row = next(r for r in pending_by_guardian if r["id"] == req_a1["id"])
        check("[alpha_1] guardian-facing payload includes sender name + amount + risk score", row["sender_name"] and row["transaction_amount"] and row["risk_score"] is not None, json.dumps(row))

    txn_state = get_transaction(a1_id)
    check("[alpha_1] transaction now in PENDING_GUARDIAN_APPROVAL", txn_state["status"] == "PENDING_GUARDIAN_APPROVAL", txn_state["status"])

    # -----------------------------------------------------------------
    # Scenario 2: guardian approves -> sender sees approval -> transaction
    # moves to a state where "Confirm & Choose App" can proceed.
    # -----------------------------------------------------------------
    print("\n--- Scenario 2: guardian approves -> transaction unlocked for payment-app selection ---")
    b1_id, _ = high_txns["beta_1"]
    authorize_transaction(b1_id)
    req_b1 = create_guardian_request(b1_id)

    approve_r = post(f"/api/v1/guardian/requests/{req_b1['id']}/approve")
    check("[beta_1] approve call succeeds", approve_r.status_code == 200, approve_r.text)
    check("[beta_1] approve response reports APPROVED", approve_r.json().get("outcome") == "APPROVED")

    detail_b1 = get(f"/api/v1/guardian/requests/{req_b1['id']}").json()
    check("[beta_1] request detail now shows APPROVED (what the sender's app polls)", detail_b1["outcome"] == "APPROVED")

    txn_b1_state = get_transaction(b1_id)
    check("[beta_1] transaction now GUARDIAN_APPROVED (payment-app picker unlocks on this status)", txn_b1_state["status"] == "GUARDIAN_APPROVED", txn_b1_state["status"])

    # -----------------------------------------------------------------
    # Scenario 3: guardian rejects -> payment is blocked, cannot proceed.
    # -----------------------------------------------------------------
    print("\n--- Scenario 3: guardian rejects -> payment blocked ---")
    g1_id, _ = high_txns["gamma_1"]
    authorize_transaction(g1_id)
    req_g1 = create_guardian_request(g1_id)

    reject_r = post(f"/api/v1/guardian/requests/{req_g1['id']}/reject")
    check("[gamma_1] reject call succeeds", reject_r.status_code == 200, reject_r.text)
    check("[gamma_1] reject response reports REJECTED", reject_r.json().get("outcome") == "REJECTED")

    txn_g1_state = get_transaction(g1_id)
    check("[gamma_1] transaction now GUARDIAN_REJECTED", txn_g1_state["status"] == "GUARDIAN_REJECTED", txn_g1_state["status"])

    reauth_attempt = authorize_transaction(g1_id)
    check("[gamma_1] any further authorize attempt on the rejected txn is refused (blocked)", reauth_attempt.status_code == 400, f"{reauth_attempt.status_code} {reauth_attempt.text}")

    # -----------------------------------------------------------------
    # Scenario 5: multiple users, different guardians -> notifications
    # must be isolated per guardian. Checked here (before scenario 4
    # consumes alpha's second request) using the three ALREADY-resolved
    # requests above plus one more live PENDING one for delta.
    # -----------------------------------------------------------------
    print("\n--- Scenario 5: guardian notification isolation across different senders/guardians ---")
    d1_id, _ = high_txns["delta_1"]
    authorize_transaction(d1_id)
    req_d1 = create_guardian_request(d1_id)

    for tag in ["alpha", "beta", "gamma", "delta"]:
        listing = get(f"/api/v1/guardian/requests/by-guardian-user/{accounts[tag]['guardian_id']}").json()
        other_tags_txn_ids = {high_txns[f"{t}_1"][0] for t in ["alpha", "beta", "gamma", "delta"] if t != tag}
        leaked = [r for r in listing if r["transaction_id"] in other_tags_txn_ids]
        check(f"[{tag}] guardian's pending list contains none of the other senders' requests", len(leaked) == 0, f"leaked={leaked}")

    check("[delta_1] delta's guardian correctly sees exactly delta's pending request", any(r["id"] == req_d1["id"] for r in get(f"/api/v1/guardian/requests/by-guardian-user/{accounts['delta']['guardian_id']}").json()))

    # Clean up delta's live request so it doesn't linger mid-countdown forever.
    post(f"/api/v1/guardian/requests/{req_d1['id']}/approve")

    # -----------------------------------------------------------------
    # Scenario 4: guardian timeout. The backend has a fixed 120s window
    # with NO server-side job that auto-cancels an expired request — it
    # simply stops appearing in "pending" listings once expires_at has
    # passed, and the transaction stays PENDING_GUARDIAN_APPROVAL until
    # the user calls /user-override (which, per the current
    # implementation, lets the payment PROCEED under PIN re-verification
    # rather than blocking it — see the written report for why this
    # differs from "cancelled/blocked").
    # -----------------------------------------------------------------
    print("\n--- Scenario 4: guardian timeout (waiting out the real 120s window) ---")
    a2_id, _ = high_txns["alpha_2"]
    authorize_transaction(a2_id)
    req_a2 = create_guardian_request(a2_id)
    print(f"  waiting ~122s for request {req_a2['id']} to genuinely expire...")
    time.sleep(122)

    pending_after_expiry = get(f"/api/v1/guardian/requests/pending/{accounts['alpha']['contact_id']}").json()
    check("[alpha_2] expired request no longer appears in pending listing", not any(r["id"] == req_a2["id"] for r in pending_after_expiry))

    detail_after_expiry = get(f"/api/v1/guardian/requests/{req_a2['id']}").json()
    check("[alpha_2] detail view reports remaining_seconds=0 after real expiry", detail_after_expiry["remaining_seconds"] == 0)
    check(
        "[alpha_2] outcome is STILL 'PENDING' at the DB level — nothing auto-marks it TIMEOUT/blocked",
        detail_after_expiry["outcome"] == "PENDING",
        f"outcome={detail_after_expiry['outcome']} (see report: no backend job resolves an expired request on its own)",
    )

    override_r = post(f"/api/v1/guardian/requests/{req_a2['id']}/user-override", {"pin": "1234"})
    check("[alpha_2] user-override call succeeds", override_r.status_code == 200, override_r.text)
    txn_a2_state = get_transaction(a2_id)
    check(
        "[alpha_2] ACTUAL current behavior: timeout + override lets the payment PROCEED (status GUARDIAN_TIMEOUT_USER_OVERRODE), it is NOT cancelled/blocked",
        txn_a2_state["status"] == "GUARDIAN_TIMEOUT_USER_OVERRODE",
        txn_a2_state["status"],
    )

    # -----------------------------------------------------------------
    # Scenario 7 note: refresh/reload restore is a CLIENT (mobile app)
    # behavior — verified separately via the live Expo-web app in the
    # accompanying browser walkthrough, using QA Sender Delta or a fresh
    # request, since it requires an actual page reload mid-countdown.
    # -----------------------------------------------------------------

    print("\n" + "=" * 80)
    if FAILURES:
        print(f"{len(FAILURES)} CHECK(S) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
    else:
        print("ALL CHECKS PASSED")
    print("=" * 80)

    print("\nAccount reference (all QA dummy data, safe to leave or delete):")
    print(json.dumps(accounts, indent=2))
    print("\nHigh-risk transaction reference:")
    print(json.dumps({k: {"transaction_id": v[0], "risk_score": v[1]["risk_score"], "risk_level": v[1]["risk_level"]} for k, v in high_txns.items()}, indent=2))

    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
