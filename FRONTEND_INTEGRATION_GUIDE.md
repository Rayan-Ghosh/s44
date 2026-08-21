# 🛡️ Avaran (S40) — Frontend Developer Handover & API Integration Guide

Welcome! The entire **FastAPI Backend, ML/NLP Models, Database, and Fusion Engine are 100% complete, tested, and running**.

This guide gives you the exact endpoints, request/response JSON schemas, UI component requirements, design tokens, and live demo flows to plug your Next.js frontend directly into the backend.

---

## 🚀 Quick Start (Running the Backend)

1. **Start the FastAPI Backend** (from repo root):
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir apps/api
   ```
2. **Interactive OpenAPI / Swagger Documentation**:
   Visit **`http://localhost:8000/docs`** to test all endpoints interactively in your browser.
3. **CORS is enabled**: Any request from `http://localhost:3000` will work automatically with zero configuration.

---

## 🎨 Design System & Color Tokens

Per specification (`AVARAN_PROJECT.md` §8):

| Risk Level | Score Range | Color Token | Hex Code | UI Badge Text |
| :--- | :--- | :--- | :--- | :--- |
| **LOW** | 0 – 30 | `var(--color-risk-low)` | `#10B981` (Emerald Green) | `ALLOW / NORMAL` |
| **MEDIUM** | 31 – 60 | `var(--color-risk-medium)` | `#F59E0B` (Amber Yellow) | `WARN / CAUTION` |
| **HIGH** | 61 – 100 | `var(--color-risk-high)` | `#EF4444` (Crimson Red) | `HOLD FOR SAFETY` |

> [!IMPORTANT]
> **Tone & Language Rules**:
> - Never say *"AI blocked your transaction"* or *"You are flagged as fraud"*.
> - Always use: *"Payment held for safety verification"* or *"Unusual activity detected — please verify"*.
> - Never frame Guardian Approval as an *"elderly / senior"* feature in the UI — it is a universal **Family Safety Shield**.

---

## 📄 Page 1: Payment Simulator (`/simulator`)

The main demo page where judges test UPI transactions across Scenarios A through G.

### 1. Fetch Scenario Buttons
* **Endpoint:** `GET http://localhost:8000/api/v1/simulator/scenarios`
* **Response:**
```json
[
  {
    "id": "scenario_a",
    "title": "Scenario A: Routine Grocery / Chai",
    "badge": "LOW RISK",
    "description": "₹450 routine morning tea and snack at local merchant from primary trusted phone.",
    "expected_band": "LOW",
    "expected_score_range": "0 - 15"
  },
  {
    "id": "scenario_b",
    "title": "Scenario B: Sudden High-Value Spike",
    "badge": "HIGH RISK (HOLD)",
    "description": "₹85,000 sent to a brand new unknown UPI ID at 2:00 AM (35x user average).",
    "expected_band": "HIGH",
    "expected_score_range": "75 - 90"
  },
  {
    "id": "scenario_e",
    "title": "Scenario E: Voice Phishing / Digital Arrest Scam",
    "badge": "HIGH RISK (GUARDIAN HOLD)",
    "description": "Caller impersonating Cyber Crime Police demanding immediate ₹45,000 settlement to avoid arrest.",
    "expected_band": "HIGH",
    "expected_score_range": "80 - 95"
  }
]
```

### 2. Execute 1-Click Scenario
* **Endpoint:** `POST http://localhost:8000/api/v1/simulator/scenarios/{scenario_id}/execute`
* **Response:**
```json
{
  "scenario_id": "scenario_b",
  "transaction_id": 14,
  "user_name": "Ananya Sen",
  "amount": 85000.0,
  "risk_score": 78,
  "risk_level": "HIGH",
  "decision": "CONFIRM_OR_CANCEL",
  "plain_language_reasons": [
    "High-value payment initiated from an unrecognized device",
    "Transaction amount is dramatically higher than habitual baseline (>10x average)"
  ],
  "risk_contributions_pct": {
    "amount_deviation": 52.4,
    "recipient_novelty": 28.1,
    "time_of_day_deviation": 19.5
  },
  "latency_ms": 14.8,
  "held_for_guardian": true,
  "guardian_request_id": 3
}
```

### 3. Payment Action Buttons
* **User Confirms:** `POST http://localhost:8000/api/v1/transactions/{id}/confirm`
* **User Cancels:** `POST http://localhost:8000/api/v1/transactions/{id}/cancel`
* **User Reports Fraud:** `POST http://localhost:8000/api/v1/transactions/{id}/report?reason=Scam%20attempt`

---

## 📄 Page 2: Guardian / Family Shield (`/guardian`)

A mobile-friendly screen representing the trusted family member's phone.

### 1. Fetch Pending Approval Requests
* **Endpoint:** `GET http://localhost:8000/api/v1/guardian/requests/pending/{trusted_contact_id}`
  *(For demo, default `trusted_contact_id = 1`)*
* **Response:**
```json
[
  {
    "id": 3,
    "transaction_id": 14,
    "trusted_contact_id": 1,
    "requested_at": "2026-08-20T21:00:00Z",
    "expires_at": "2026-08-20T21:02:00Z",
    "outcome": "PENDING",
    "remaining_seconds": 115,
    "transaction_amount": 85000.0,
    "risk_score": 78,
    "risk_reasons": [
      "High-value payment to unknown UPI ID",
      "Transaction amount 35x higher than normal"
    ]
  }
]
```

### 2. Guardian Action Buttons
* **Approve Payment:** `POST http://localhost:8000/api/v1/guardian/requests/{id}/approve`
  ```json
  { "notes": "Approved by son after phone confirmation" }
  ```
* **Reject & Block Payment:** `POST http://localhost:8000/api/v1/guardian/requests/{id}/reject`
  ```json
  { "notes": "Blocked - father was on suspicious call" }
  ```

### 3. Friction Timeout Override (If timer reaches 0)
* **Endpoint:** `POST http://localhost:8000/api/v1/guardian/requests/{id}/user-override`
  ```json
  { "pin": "1234" }
  ```

---

## 📄 Page 3: Bank Analyst Review Console (`/institution`)

High-density dashboard for bank risk officers.

### 1. Stats Summary Bar
* **Endpoint:** `GET http://localhost:8000/api/v1/institution/stats`
* **Response:**
```json
{
  "total_transactions_evaluated": 154,
  "high_risk_flagged_count": 18,
  "guardian_held_count": 9,
  "false_positives_resolved_count": 4,
  "confirmed_fraud_count": 12,
  "average_latency_ms": 16.2
}
```

### 2. Flagged Transaction Feed
* **Endpoint:** `GET http://localhost:8000/api/v1/institution/transactions?risk_level=HIGH&limit=20`
* **Response:**
```json
[
  {
    "id": 14,
    "user_id": 2,
    "user_name": "Ananya Sen",
    "amount": 85000.0,
    "timestamp": "2026-08-20T21:00:00Z",
    "location": "Kolkata",
    "status": "PENDING_GUARDIAN_APPROVAL",
    "risk_score": 78,
    "risk_level": "HIGH",
    "top_risk_factor": "Amount Deviation (>10x avg)"
  }
]
```

### 3. Transaction Forensic Audit Detail (Slide-out Drawer)
* **Endpoint:** `GET http://localhost:8000/api/v1/institution/transactions/{id}/audit`
* **Response:**
```json
{
  "transaction_id": 14,
  "user_name": "Ananya Sen",
  "amount": 85000.0,
  "status": "PENDING_GUARDIAN_APPROVAL",
  "risk_score": 78,
  "risk_level": "HIGH",
  "decision": "CONFIRM_OR_CANCEL",
  "plain_language_reasons": [
    "High-value payment initiated from an unrecognized device",
    "Transaction amount is dramatically higher than habitual baseline"
  ],
  "sub_scores": {
    "transaction_fraud": 0.74,
    "behaviour_anomaly": 0.81,
    "device_risk": 0.55,
    "voice_risk": 0.0
  },
  "shap_contributions_pct": {
    "amount_deviation": 52.4,
    "recipient_novelty": 28.1,
    "time_of_day_deviation": 19.5
  },
  "audit_timeline": [
    { "event": "TRANSACTION_INITIATED", "timestamp": "2026-08-20T21:00:00Z", "detail": "UPI payment initiated" },
    { "event": "RISK_EVALUATED", "timestamp": "2026-08-20T21:00:00.015Z", "detail": "Risk Score 78/100 (HIGH)" },
    { "event": "GUARDIAN_HOLD_TRIGGERED", "timestamp": "2026-08-20T21:00:00.020Z", "detail": "2-minute safety hold started" }
  ]
}
```

### 4. Dispute Resolution (Mark Legitimate / False Positive)
* **Endpoint:** `POST http://localhost:8000/api/v1/institution/disputes/{transaction_id}/resolve`
* **Payload:**
```json
{
  "status": "FALSE_POSITIVE",
  "notes": "Spoke to customer. Verified legitimate property advance."
}
```

---

## 📄 Page 4: Real-Time Call Coercion WebSocket (`/voice-call`)

Simulates a live phone call under scam pressure with live risk updates.

* **WebSocket URL:** `ws://localhost:8000/ws/voice-stream`
* **Send text chunk / transcript chunk:**
  ```json
  { "text_chunk": "This is Officer Rathore from CBI Cyber Crime. Your Aadhaar is linked to illegal narcotics. A digital arrest warrant is issued. Immediately transfer ₹45,000 security deposit." }
  ```
* **Receive streaming analysis:**
  ```json
  {
    "accumulated_risk": 0.89,
    "coercion_level": "CRITICAL",
    "detected_intents": ["AUTHORITY_IMPERSONATION", "LEGAL_THREAT", "URGENCY", "ACTION_EXTRACTION"],
    "matched_phrases": ["cbi cyber crime", "digital arrest", "immediately transfer", "narcotics"],
    "is_scam_alert": true,
    "message": "CRITICAL SOCIAL ENGINEERING SCAM DETECTED! High pressure coercive scam call in progress."
  }
  ```

---

## ⏱️ 3-Minute Winning Demo Flow for Hackathon Judges

1. **Step 1 — Show Routine Payment (Scenario A):**
   - Click *Scenario A*. Risk score shows **6/100 (Green / ALLOW)**. Latency shows **<15ms**.
2. **Step 2 — Show Sudden Anomaly (Scenario B):**
   - Click *Scenario B* (₹85,000). Score spikes to **78/100 (Red / HOLD)**.
   - Explainability panel shows: *Amount is 35x higher than average*.
3. **Step 3 — Show Guardian Family Shield (`/guardian`):**
   - Switch to Guardian view. Watch the **2-minute countdown timer** ticking live.
   - Click *[Approve]* or *[Reject]* to demonstrate user protection during active coercion.
4. **Step 4 — Show Live Voice Coercion (Scenario E):**
   - Stream Digital Arrest transcript. Watch the **NLP Intent Classifier** light up all 5 coercion tags (`Threat`, `Urgency`, `Authority`, `Secrecy`, `Financial`).
5. **Step 5 — Show Bank Console (`/institution`):**
   - Show the SHAP waterfall feature breakdown and explain how **False Positives are suppressed for legitimate high-volume merchants (Scenario F)**.
