# S40 (Avaran) — Real-Time Financial Fraud & Social Engineering Defense Shield
## Comprehensive Technical Context & Architecture Specification

---

## 1. Executive Summary & Purpose

**S40 (Avaran)** is an enterprise-grade real-time financial fraud detection and social-engineering scam defense system designed to protect mobile and web payment transactions (e.g., UPI, FastPay, cards). 

The platform operates as a **Modular Monolith** in Python (FastAPI backend + Scikit-Learn/XGBoost ML engine) and TypeScript (React Native mobile app + Next.js web dashboard). It achieves a sub-20ms inference latency for multi-signal transaction scoring while streaming 16kHz PCM audio over WebSockets to transcribe and detect live phone call scam patterns (authority impersonation, urgency threats, OTP coercion).

---

## 2. System Architecture & Component Layout

```
                                    ┌─────────────────────────────────────────────────────────┐
                                    │                     CLIENT LAYER                        │
                                    │           (React Native Mobile / Next.js Web)           │
                                    └────────────────────┬────────────────────────────────────┘
                                                         │
                                       REST API & WebSockets (/ws/call-stream)
                                                         │
                                                         ▼
                                    ┌─────────────────────────────────────────────────────────┐
                                    │               FASTAPI BACKEND GATEWAY                   │
                                    │                   (apps/api/app/)                       │
                                    └────────────────────┬────────────────────────────────────┘
                                                         │
             ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
             │                                           │                                           │
             ▼                                           ▼                                           ▼
┌──────────────────────────┐                ┌──────────────────────────┐                ┌──────────────────────────┐
│   AUTHENTICATION & DB    │                │    REAL-TIME RISK ENGINE │                │  VOICE SCAM DEFENSE      │
│ (Users, Recipient, Txns) │                │   (ml/inference/predict) │                │ (Bhashini STT + NLP)     │
└──────────────────────────┘                └────────────┬─────────────┘                └──────────────────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │ CALIBRATION & FUSION     │
                                            │  (0-100 Score + Factors) │
                                            └────────────┬─────────────┘
                                                         │
                                         ┌───────────────┴───────────────┐
                                         ▼                               ▼
                            ┌─────────────────────────┐     ┌─────────────────────────┐
                            │   GUARDIAN / FAMILY     │     │  INSTITUTION CONSOLE    │
                            │     APPROVAL HOLD       │     │     ANALYST ALERTS      │
                            └─────────────────────────┘     └─────────────────────────┘
```

### Directory Map
```
S40/
├── apps/
│   ├── api/                 # FastAPI Backend Service
│   │   ├── app/api/routers/ # Routers: auth, users, transactions, risk, alerts, guardian, institution, simulator, voice_stream
│   │   ├── app/models/      # SQLAlchemy Models (User, Transaction, Recipient, Device, RiskScore, GuardianRequest, etc.)
│   │   └── tests/           # FastAPI Pytest suite (46 tests)
│   ├── mobile/              # React Native / Expo Mobile App
│   │   ├── src/screens/     # HomeScreen, PaymentsScreen, ProtectionScreen, ProfileScreen, TrustedScreen, AlertDetailScreen, etc.
│   │   ├── src/components/  # ErrorBoundary, Header, StatusBadge, RiskGauge, GuardianApprovalCard, NotificationDropdown, etc.
│   │   ├── src/context/     # AuthContext, AppHealthContext, BiometricContext, SecurityContext, GuardianContext, AlertBadgeContext
│   │   └── src/services/    # ApiClient, AuthService, PaymentService, AlertService, GuardianService, RiskService, etc.
│   └── web/                 # Next.js 16 Web Dashboard & Analyst Console
├── ml/                      # Machine Learning Engine & Models
│   ├── features/            # Feature computation (transaction, device, behavioral, voice)
│   ├── inference/           # MLPredictor singleton & fusion engine (ml/inference/predict.py)
│   └── models/              # Saved model artifacts (.pkl, .json)
├── voice/                   # Speech-to-Text (Bhashini) & NLP Scam Classifier
├── engine/                  # Stateful Leaky Bucket Fraud Detector
├── services/                # Shared business logic
├── tests/                   # Pytest suite for ML engine & pipelines (14 tests)
├── scratch/                 # Connectivity & verification scripts (verify_connectivity.py)
├── server.js                # Node launcher helper for uvicorn backend
└── main.py                  # Standalone WebSocket entry point (/ws/call-stream/{session_id})
```

---

## 3. Technology Stack

- **Backend Gateway**: FastAPI, Python 3.13, Pydantic v2, SQLAlchemy ORM, Alembic migrations, SQLite (`Avaran.db`) / PostgreSQL.
- **Machine Learning Engine**: Scikit-Learn (Isotonic Regression, CalibratedClassifierCV, IsolationForest, StandardScaler, TfidfVectorizer), XGBoost, NumPy, pandas, joblib.
- **Voice & Scam Defense**: Bhashini Streaming ASR + Stateful Leaky Bucket Fraud Detector + NLP Classifier.
- **Mobile Frontend**: React Native, Expo ~57, React Navigation v7, TypeScript, React Context API.
- **Web Dashboard**: Next.js 16, React 19, Tailwind CSS v4, Three.js, Lucide Icons, Shadcn UI.

---

## 4. Core Business Logic & Risk Fusion Pipeline

### Multi-Signal Inference & Fusion Workflow
1. **Signal Collection**:
   - `transaction`: amount, recipient ID, timestamp, device ID, location.
   - `user_profile`: `normal_avg_amount`, `normal_std_amount`, frequent contact list.
   - `voice_transcript`: live transcription output from active voice calls.
2. **Independent Sub-Models**:
   - **Transaction ML**: XGBoost & Isolation Forest score amount velocity and recipient novelty.
   - **Device Risk**: Hardware fingerprinting & location anomaly scoring.
   - **Behavioral Biometrics**: Keystroke dynamics and time-on-screen cadence.
   - **Voice Scam Engine**: NLP classifier scanning for urgency, authority impersonation, and OTP coercion patterns.
3. **Calibration & Fusion Engine**:
   - Individual sub-models never block a transaction directly.
   - Signals are passed to the Isotonic Calibrated Classifier to yield a normalized **0–100 `risk_score`**.
4. **Decision Engine & Enforcements**:
   - **`LOW` (0–30)** -> `ALLOW`: Transaction executes smoothly.
   - **`MEDIUM` (31–60)** -> `WARN_CHOICE`: Displays warning banner and contextual checks.
   - **`HIGH` (61–100)** -> `CONFIRM_OR_CANCEL` / **Guardian Hold**: Triggers a 2-minute family approval hold requiring PIN override or guardian sign-off.

---

## 5. Guardian / Family Shield Subsystem

- Users register trusted contacts (`/api/v1/users/{id}/trusted-contacts`).
- When a transaction triggers a `HIGH` risk score, an asynchronous 2-minute `GuardianRequest` is created (`/api/v1/guardian/requests`).
- Trusted family members receive push notifications and can approve or reject the hold.
- If the 2-minute window expires without response, the user can execute a friction-based PIN override (`/user-override`).

---

## 6. Database Entities & Schemas

- **`users`**: User profiles, phone numbers (hashed), risk baselines.
- **`devices`**: Registered hardware IDs, trusted flags, fingerprints.
- **`recipients`**: Hashed recipient handles, `display_name`, first/last seen timestamps.
- **`transactions`**: Amount, timestamp, location, payment method, status (`PENDING`, `ALLOWED`, `AWAITING_CONFIRMATION`, `CONFIRMED`, `CANCELLED`, `REPORTED`).
- **`risk_scores`**: Final score, risk level, decision category.
- **`risk_factors`**: Granular factor explanations & percentage contributions.
- **`trusted_contacts`**: User guardians, phone hashes, relationship labels.
- **`guardian_requests`**: 2-minute hold state, outcome (`PENDING`, `APPROVED`, `REJECTED`, `TIMEOUT`).
- **`alerts`**: High/Medium risk events routed to institutional fraud analyst consoles.

---

## 7. Complete API Endpoints Summary

### Authentication (`/api/v1/auth`)
- `POST /login`: Authenticates user by email/phone identifier, returns session token & profile.
- `POST /signup`: Registers user account with validation.

### Users & Overview (`/api/v1/users`)
- `GET /{id}`: User profile lookup.
- `GET /{id}/overview`: Monthly totals, transaction counts, risk level, and protection status.
- `GET /{id}/transactions`: Paginated transaction list with risk levels and factor breakdowns.
- `GET /{id}/trusted-contacts`: Lists enrolled trusted guardians.
- `POST /{id}/trusted-contacts`: Enrolls new trusted contact.
- `DELETE /{id}/trusted-contacts/{contact_id}`: Removes a trusted contact.

### Real-Time Risk & Transactions (`/api/v1/risk`, `/api/v1/transactions`)
- `POST /api/v1/risk/evaluate`: Runs sub-20ms multi-signal ML scoring.
- `POST /api/v1/transactions/{id}/confirm`: Records user confirmation of held payment.
- `POST /api/v1/transactions/{id}/cancel`: Cancels held transaction.
- `POST /api/v1/transactions/{id}/report`: Flags transaction as fraudulent and alerts operations.

### Family Guardian Shield (`/api/v1/guardian`)
- `POST /requests`: Triggers 2-minute guardian hold.
- `GET /requests/pending/{contact_id}`: Lists pending holds for a guardian.
- `POST /requests/{id}/approve`: Guardian approves payment.
- `POST /requests/{id}/reject`: Guardian rejects & blocks payment.
- `POST /requests/{id}/user-override`: Friction PIN override.

### Real-Time Voice Streaming (`/ws`)
- `WebSocket /ws/call-stream/{session_id}`: Streams 16kHz PCM audio for live speech fraud analysis.

---

## 8. Client Resilience Architecture & Mobile App

- **React Error Boundary**: [ErrorBoundary.tsx](file:///d:/AVARAN/S40/apps/mobile/src/components/common/ErrorBoundary.tsx) intercepts uncaught JS runtime exceptions to prevent application crashes.
- **Null Safety**: Optional chaining and nullish coalescing applied across all data access paths (`(alert.whyFlagged || [])`, `(amount ?? 0).toLocaleString("en-IN")`).
- **Offline Security Mode**: [ApiClient.ts](file:///d:/AVARAN/S40/apps/mobile/src/services/api-client.ts) automatically falls back to client-side rule evaluation if the backend server is unreachable.

---

## 9. Verification & Test Suite Results

- **ML & Pipeline Test Suite** (`pytest tests/`): **14 / 14 Passed** (100%)
- **FastAPI Integration Suite** (`pytest apps/api/tests/`): **46 / 46 Passed** (100%)
- **Mobile App TypeScript** (`apps/mobile` `tsc --noEmit`): **0 Errors**
- **Web App TypeScript** (`apps/web` `tsc --noEmit`): **0 Errors**
- **End-to-End API Connectivity** (`verify_connectivity.py`): **9 / 9 Endpoints Successful**

---

## 10. Local Setup & Execution Guide

1. **Start Backend Dev Server**:
   ```bash
   node server.js
   # OR directly:
   $env:PYTHONPATH="apps/api;."; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir apps/api
   ```
2. **Run Mobile App**:
   ```bash
   cd apps/mobile
   npx expo start --web
   ```
3. **Run Web Dashboard**:
   ```bash
   cd apps/web
   npm run dev
   ```
4. **Execute Full System Connectivity Check**:
   ```bash
   $env:PYTHONPATH="apps/api;."; .\.venv\Scripts\python.exe scratch/verify_connectivity.py
   ```
