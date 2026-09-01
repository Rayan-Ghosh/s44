# Avaran (S40) — Database Integration & User Authentication Requirements Roadmap

**Document Version:** 1.0.0  
**Target System:** Avaran Fraud Detection & Financial Defense Platform  
**File Location:** `DATABASE_INTEGRATION_REQUIREMENTS.md`  
**Purpose:** Technical roadmap, architectural specification, schema definitions, and security requirements for migrating Avaran from demo/mock state to a production-grade, database-driven authentication and data persistence system.

---

## 1. Current Project Architecture

### 1.1 Overview of Architecture & Repositories
The Avaran project is structured as a monorepo containing three core application layers:

```
S40 - Copy/
├── apps/
│   ├── api/          # Python 3.13 / FastAPI Backend & SQLite ORM database
│   ├── mobile/       # React Native (Expo ~57) Mobile Application
│   └── web/          # Next.js 15 (React 19) Web Application & Institution Portal
├── engine/           # Fraud detection and risk scoring rule evaluation engine
├── ml/               # Machine Learning models (Isolation Forest, XGBoost pipeline)
├── voice/            # Scam call audio stream transcription & heuristic NLP analyzer
├── Avaran.db         # Local SQLite prototype database
└── scripts/          # Database seeding and demo simulation scripts
```

### 1.2 Frontend Technologies & Frameworks

| Application | Technology Stack | Key Libraries & Frameworks | Storage & State |
| :--- | :--- | :--- | :--- |
| **Mobile App** (`apps/mobile`) | React Native 0.86.3, Expo SDK ~57, React 19.2.3, TypeScript 6.0 | `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `react-native-svg`, `@expo/vector-icons`, `react-native-safe-area-context` | `expo-secure-store` (session persistence), React Context API (`AuthContext`, `GuardianContext`, `AlertBadgeContext`, `SecurityContext`) |
| **Web Portal** (`apps/web`) | Next.js 15, React 19, TypeScript, TailwindCSS / CSS Modules | `lucide-react`, `framer-motion`, `clsx`, `tailwind-merge` | Browser LocalStorage / In-memory React State |

### 1.3 Backend Technologies & Status

| Component | Technology | Current Implementation State |
| :--- | :--- | :--- |
| **Framework** | FastAPI (0.141.1), Uvicorn (0.52.3), Python 3.13 | Fully operational REST & WebSocket API running on port 8000 |
| **ORM / Data Layer** | SQLAlchemy 2.0.52, Pydantic 2.x, Pydantic-Settings | 15 declarative ORM models mapped in `apps/api/app/models/` |
| **Database Engine** | SQLite (`Avaran.db`) via `sqlite:///Avaran.db` | Single-file local database. Schema managed via SQLAlchemy and seeded with prototype data |
| **Migrations** | Alembic 1.19.1 (`apps/api/alembic`) | Basic initial schema scaffold present |
| **Cryptography** | `cryptography` 50.0.1 (Fernet) + SHA-256 with static pepper | Contact info encrypted via Fernet; phone numbers & device IDs hashed via SHA-256 |

### 1.4 Current Authentication State (Real vs. Demo/Mock)

1. **Mobile Application Mock Interception:**
   - In `apps/mobile/src/services/api-client.ts`, `IS_DEMO_MODE` is set via `process.env.EXPO_PUBLIC_DEMO_MODE === "true"`.
   - When enabled, `AuthService.login()` and `AuthService.signup()` completely bypass the backend and return a hardcoded demo user (`Rahul Sharma`, `userId: 1`, token `usr_tok_avaran_demo`).
   - `PaymentService`, `AlertService`, and `GuardianService` similarly default to hardcoded memory structures (`DEMO_PAYMENT_OVERVIEW`, `DEMO_USER_TRANSACTIONS`, `DEMO_ALERTS`).

2. **Backend API Prototype Authentication (`apps/api/app/api/routers/auth.py`):**
   - The backend exposes `POST /api/v1/auth/login` and `POST /api/v1/auth/signup`.
   - **No password verification exists:** The login endpoint accepts any password or default `"password123"`.
   - **No password hashing exists in the database:** The `User` model (`apps/api/app/models/user.py`) has no password column.
   - **Implicit account creation:** If an unrecognized identifier is provided to `login()`, it automatically creates a fresh user row to avoid hackathon demo failure.
   - **Deterministic, unsigned token:** Tokens are plain strings generated as `usr_tok_avaran_{user.id}_{hash[:12]}`. There is no cryptographic signing, JWT validation, or expiration.

### 1.5 Relevant Codebase Files Directory

```
Avaran Core Files Map:
├── Authentication & User Identity:
│   ├── apps/mobile/src/services/auth-service.ts          # Mobile authentication API caller & SecureStore manager
│   ├── apps/mobile/src/context/AuthContext.tsx           # React Context providing session & login methods
│   ├── apps/mobile/src/screens/LoginScreen.tsx           # User login UI component
│   ├── apps/mobile/src/screens/CreateAccountScreen.tsx   # User registration UI component
│   ├── apps/mobile/src/screens/ProfileScreen.tsx         # User profile display & update UI
│   ├── apps/api/app/api/routers/auth.py                 # Backend authentication endpoints (/login, /signup)
│   ├── apps/api/app/api/routers/users.py                # Backend user profile & overview endpoints
│   ├── apps/api/app/models/user.py                      # User ORM model
│   ├── apps/api/app/models/user_contact_info.py         # Encrypted contact details ORM model
│   ├── apps/api/app/schemas/user.py                     # Pydantic schemas (UserCreate, UserRead)
│   ├── apps/api/app/repositories/user_repository.py     # Database queries for users
│   └── apps/api/app/services/user_service.py            # Business logic for user creation/retrieval
│
├── Financial Transactions & Risk Scores:
│   ├── apps/mobile/src/services/payment-service.ts       # Mobile transaction & overview manager
│   ├── apps/mobile/src/screens/HomeScreen.tsx            # Dashboard with dynamic RiskGauge & attention cards
│   ├── apps/mobile/src/screens/PaymentsScreen.tsx        # Payment records, details & approval workflows
│   ├── apps/mobile/src/components/common/RiskGauge.tsx   # SVG animated risk score gauge (0-100)
│   ├── apps/api/app/models/transaction.py               # Transaction ORM model
│   ├── apps/api/app/models/risk_score.py                # Risk score evaluation ORM model
│   ├── apps/api/app/models/risk_factor.py               # Risk explainability factors ORM model
│   └── apps/api/app/api/routers/transactions.py         # Transaction CRUD & query routes
│
└── Protection, Guardians & Alerts:
    ├── apps/mobile/src/services/alert-service.ts        # Mobile security alerts manager
    ├── apps/mobile/src/services/guardian-service.ts     # Mobile guardian requests & approval manager
    ├── apps/mobile/src/screens/ProtectionScreen.tsx     # Security status & active protection features UI
    ├── apps/mobile/src/screens/TrustedScreen.tsx        # Trusted contacts management UI
    ├── apps/api/app/models/trusted_contact.py           # Trusted contact ORM model
    ├── apps/api/app/models/guardian_request.py          # Guardian approval request ORM model
    └── apps/api/app/models/alert.py                     # Security alert ORM model
```

---

## 2. Current Authentication Flow

### 2.1 Login Flow
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant LoginScreen as LoginScreen.tsx
    participant AuthContext as AuthContext.tsx
    participant AuthService as auth-service.ts
    participant SecureStore as expo-secure-store
    participant API as FastAPI /api/v1/auth/login
    participant DB as SQLite (Avaran.db)

    User->>LoginScreen: Enters Email/Mobile & Password
    LoginScreen->>AuthContext: login({ identifier, password })
    AuthContext->>AuthService: AuthService.login(credentials)
    
    alt IS_DEMO_MODE is true
        AuthService-->>AuthService: buildDemoSession() (Rahul Sharma)
        AuthService->>SecureStore: setItemAsync("avaran.session.v1", session)
        AuthService-->>AuthContext: { success: true, session }
    else Real API Mode
        AuthService->>API: POST /api/v1/auth/login
        API->>DB: Query User by phone_hash / identifier
        alt User Not Found
            API->>DB: Auto-creates new user (Demo fallback)
        end
        API-->>AuthService: { success: true, token, user }
        AuthService->>SecureStore: setItemAsync("avaran.session.v1", session)
        AuthService-->>AuthContext: { success: true, session }
    end
    
    AuthContext->>AuthContext: setSession(session), setPostLoginLoading(true)
    AuthContext-->>LoginScreen: { success: true }
    Note over User,AuthContext: RootNavigator navigates to Authenticated Tabs & displays PostLoginSplashScreen
```

### 2.2 Create Account / Signup Flow
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CreateScreen as CreateAccountScreen.tsx
    participant AuthContext as AuthContext.tsx
    participant AuthService as auth-service.ts
    participant API as FastAPI /api/v1/auth/signup
    participant DB as SQLite (Avaran.db)

    User->>CreateScreen: Fills Name, Mobile, Email, Password, Accepts Terms
    CreateScreen->>CreateScreen: Validates length, matching passwords, terms checkbox
    CreateScreen->>AuthContext: signup(data)
    AuthContext->>AuthService: AuthService.signup(data)

    alt IS_DEMO_MODE is true
        AuthService-->>AuthService: buildDemoSession(userId=timestamp)
        AuthService-->>AuthContext: { success: true, session }
    else Real API Mode
        AuthService->>API: POST /api/v1/auth/signup
        API->>DB: Check if phone_hash already exists
        API->>DB: INSERT User (name, phone_hash)
        API->>DB: INSERT UserContactInfo (encrypted phone & email)
        API-->>AuthService: { success: true, token, user }
        AuthService-->>AuthContext: { success: true, session }
    end

    AuthContext->>AuthContext: setSession(session), setPostLoginLoading(true)
```

### 2.3 Session Handling & App Boot Restoration
1. When the mobile app starts, `AuthProvider` executes a startup `useEffect`.
2. It calls `AuthService.getCurrentUser()`, which reads `avaran.session.v1` from `expo-secure-store`.
3. If a cached session is found, `setAuthToken(session.token)` sets the in-memory token for `ApiClient` and restores `session`.
4. In the background, `AuthService.refreshProfile(session)` calls `GET /api/v1/users/{userId}` to sync any updated name/email/phone from the server without blocking the UI.
5. If no session exists and `IS_DEMO_MODE` is enabled, it automatically logs in the demo user. If `IS_DEMO_MODE` is false, it stays on `LandingScreen`.

### 2.4 Logout Flow
1. User clicks "Log Out" in `ProfileScreen` or `SettingsScreen`.
2. `AuthContext.logout()` calls `AuthService.logout()`.
3. `setAuthToken(null)` clears the in-memory token from `api-client.ts`.
4. `expo-secure-store.deleteItemAsync("avaran.session.v1")` destroys the stored session.
5. `setSession(null)` updates state, causing `RootNavigator` to immediately switch back to the unauthenticated stack (`LandingScreen`).

### 2.5 Post-Login Loading / Reveal Sequence
1. Upon successful `login()` or `signup()`, `AuthContext` sets `isPostLoginLoading = true` alongside `session`.
2. `RootNavigator` renders `PostLoginSplashScreen` as an overlay on top of `TabNavigator`.
3. The splash screen animates the gold/dark Cinzel "AVARAN" logo with an active ring indicator for ~1.9 seconds.
4. When finished, `setPostLoginLoading(false)` is invoked.
5. In `HomeScreen.tsx`, detecting `isPostLoginLoading` transitioning `true -> false` triggers the `RiskGauge` Result Reveal animation:
   - Stroke fills from 0 to the user's risk score (1350ms).
   - Score counter counts up from 0 to 78.
   - At 1100ms, the "HIGH RISK" status badge fades and slides up.
   - At 1300ms, the explanation card fades and slides up.
6. The state is marked completed so tab switching does not replay the animation.

### 2.6 What is Mock/Demo vs. What Needs Real Database Replacement

| Feature | Current Implementation | Required Production Implementation |
| :--- | :--- | :--- |
| **Password Storage** | None (ignored completely) | Argon2id / bcrypt password hash with unique salt stored in `user_credentials` table |
| **Credential Validation** | Accepts any input string | Cryptographic verification of password hash or SMS OTP against database records |
| **Session Tokens** | `usr_tok_avaran_{id}_{hash}` (Unsigned text) | Cryptographically signed JWT (RS256/HS256) access token + rotated refresh token in DB |
| **User Data Isolation** | Hardcoded user ID 1 or demo data | Every API endpoint extracts `user_id` strictly from verified JWT token claims |
| **Financial Overview** | Static calculation from 13 hardcoded mock txns | SQL aggregation (`SUM`, `COUNT`) over user's actual `transactions` table |
| **Security Alerts** | Static array in `demo-data.ts` | Real-time queried rows from `alerts` table filtered by `user_id` |
| **Trusted Contacts** | Memory array with demo fallback | Database CRUD in `trusted_contacts` table with two-way SMS consent status |

---

## 3. Database Requirements & Schema Specifications

To support real user accounts, authentication, financial transaction analysis, real-time risk scoring, and guardian approvals, the database requires **16 relational tables**.

```mermaid
erDiagram
    USERS ||--o| USER_CREDENTIALS : "authenticates via"
    USERS ||--o| USER_CONTACT_INFO : "has encrypted"
    USERS ||--o{ USER_SESSIONS : "holds active"
    USERS ||--o{ DEVICES : "operates from"
    USERS ||--o{ RECIPIENTS : "frequent beneficiaries"
    USERS ||--o{ TRANSACTIONS : "initiates"
    USERS ||--o{ TRUSTED_CONTACTS : "enrolls"
    USERS ||--o{ ALERTS : "receives"
    TRANSACTIONS ||--o{ RISK_SCORES : "evaluated by"
    TRANSACTIONS ||--o{ GUARDIAN_REQUESTS : "held for"
    TRANSACTIONS ||--o{ VOICE_ANALYSES : "co-occurring with"
    RISK_SCORES ||--o{ RISK_FACTORS : "explained by"
    TRUSTED_CONTACTS ||--o{ GUARDIAN_REQUESTS : "approves/rejects"
```

---

### 3.1 Table Specifications

#### 1. `users` (Core Identity & Risk Profile)
Stores fundamental user identity without exposing raw PII.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` / `INT` | **PRIMARY KEY**, Auto-increment | Internal unique user ID | Non-sensitive internal identifier |
| `public_id` | `UUID` | **UNIQUE**, `NOT NULL`, Index | Public-facing UUID for client APIs | Prevents ID enumeration attacks |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full legal or display name | Displayed in UI; sanitized against XSS |
| `phone_hash` | `VARCHAR(64)` | **UNIQUE**, `NOT NULL`, Index | SHA-256 / Blind index of normalized phone | One-way lookup; cannot be reversed |
| `risk_profile` | `JSONB` / `JSON` | `NULLABLE` | Behavioral baseline (normal amount, velocity) | System behavioral metadata |
| `status` | `VARCHAR(32)` | `NOT NULL`, Default: `'ACTIVE'` | `'ACTIVE'`, `'SUSPENDED'`, `'LOCKED'` | Account status management |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Registration timestamp | Audit trail |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Last profile update timestamp | Audit trail |

---

#### 2. `user_credentials` (Authentication & Security Secrets)
Isolated from general user profile data to prevent accidental credential leakage.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Unique credential record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, **UNIQUE**, `NOT NULL`, `ON DELETE CASCADE` | 1-to-1 link to user | Strictly isolated |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | Argon2id or bcrypt password hash | **Never store plaintext**. Cost factor: Argon2id (m=65536, t=3, p=4) or bcrypt (12 rounds) |
| `failed_login_attempts`| `INT` | `NOT NULL`, Default: `0` | Consecutive failed login counter | Used for brute-force rate-limiting |
| `lockout_until` | `TIMESTAMPTZ` | `NULLABLE` | Temporary account lockout expiration | Mitigates dictionary attacks |
| `last_password_change`| `TIMESTAMPTZ`| `NOT NULL`, Default: `NOW()` | Password age tracker | Enforces rotation if needed |
| `two_factor_secret` | `VARCHAR(255)` | `NULLABLE` | Encrypted TOTP secret (if MFA enabled) | Encrypted at rest via AES-256-GCM |
| `two_factor_enabled`| `BOOLEAN` | `NOT NULL`, Default: `FALSE` | MFA status flag | User security preference |

---

#### 3. `user_contact_info` (Reversible PII / Encrypted Communication)
Stores contact details needed for notifications, profile edits, and recovery. Decoupled from `users` so general queries never load raw contact details.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Unique record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, **UNIQUE**, `NOT NULL`, `ON DELETE CASCADE` | Link to user | Isolated table |
| `email_encrypted` | `TEXT` | `NULLABLE` | Fernet / AES-256-GCM encrypted email | Decrypted only on profile fetch |
| `phone_encrypted` | `TEXT` | `NOT NULL` | Fernet / AES-256-GCM encrypted phone number | Decrypted only for SMS/OTP dispatch |
| `email_verified` | `BOOLEAN` | `NOT NULL`, Default: `FALSE` | Email verification flag | Prevents unverified account takeover |
| `phone_verified` | `BOOLEAN` | `NOT NULL`, Default: `FALSE` | SMS OTP verification flag | Core identity verification |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Last update timestamp | Audit trail |

---

#### 4. `user_sessions` (Active Tokens & Refresh Tokens)
Manages token lifecycles, active logins across devices, and revocation.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | **PRIMARY KEY**, Default: `gen_random_uuid()` | Session ID (JWT JTI claim) | Random unguessable ID |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | Link to authenticated user | Access boundary |
| `refresh_token_hash`| `VARCHAR(64)`| **UNIQUE**, `NOT NULL`, Index | SHA-256 hash of refresh token | Raw refresh token sent only to client |
| `device_id` | `VARCHAR(128)`| `NULLABLE` | Unique client device identifier | Device fingerprinting |
| `user_agent` | `VARCHAR(512)`| `NULLABLE` | Client browser/app user-agent | Anomaly detection signal |
| `ip_address` | `VARCHAR(45)` | `NULLABLE` | Client IP address (IPv4/IPv6) | Geolocation & velocity scoring |
| `is_revoked` | `BOOLEAN` | `NOT NULL`, Default: `FALSE` | Token revocation status | Set `TRUE` on logout or password change |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL`, Index | Refresh token expiration | Session duration policy |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Session creation time | Audit |

---

#### 5. `devices` (Registered & Known Hardware Fingerprints)
Tracks user hardware for risk anomaly detection (e.g., payment from new device).

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Device record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | Owning user ID | User partition |
| `device_hash` | `VARCHAR(64)` | `NOT NULL`, Index | SHA-256 hash of hardware identifier | Hashed hardware ID |
| `device_name` | `VARCHAR(100)`| `NULLABLE` | Display name (e.g. "Pixel 8 Pro") | Displayed in user profile |
| `device_type` | `VARCHAR(50)` | `NULLABLE` | `'MOBILE_ANDROID'`, `'MOBILE_IOS'`, `'WEB'` | Platform classification |
| `trust_score` | `FLOAT` | `NOT NULL`, Default: `1.0` | 0.0 (untrusted) to 1.0 (trusted) | ML feature input |
| `first_seen` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Enrollment date | Velocity baseline |
| `last_seen` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Last active date | Inactivity detection |

---

#### 6. `recipients` (Beneficiary Handles & Merchant Profiles)
Tracks payees (UPI IDs, bank accounts, merchants) and their global risk reputation.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Payee record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | User who paid this payee | User partition |
| `recipient_hash`| `VARCHAR(64)` | `NOT NULL`, Index | SHA-256 hash of UPI ID / VPA | Privacy preservation |
| `display_name` | `VARCHAR(255)`| `NOT NULL` | Merchant or contact display name | UI representation |
| `category` | `VARCHAR(50)` | `NULLABLE` | `'UTILITY'`, `'MERCHANT'`, `'P2P'`, `'UNKNOWN'` | Category-based risk rules |
| `reputation_score`| `FLOAT` | `NOT NULL`, Default: `0.0` | Global scam/mule risk score (0-100) | Intelligence engine feed |
| `is_verified_merchant`| `BOOLEAN`| `NOT NULL`, Default: `FALSE` | NPCI verified merchant flag | Whitelist bypass |

---

#### 7. `transactions` (Financial Transactions & Interceptions)
Core transaction ledger containing all user payments and hold statuses.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Transaction ID | Primary financial key |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | Initiating user ID | Multi-tenant isolation |
| `recipient_id` | `BIGINT` | **FOREIGN KEY (`recipients.id`)**, `NOT NULL`, Index | Payee record ID | Relation |
| `device_id` | `BIGINT` | **FOREIGN KEY (`devices.id`)**, `NOT NULL`, Index | Device used for payment | Hardware anomaly signal |
| `amount` | `NUMERIC(12,2)`| `NOT NULL` | Payment amount in INR (e.g. 4890.00) | Exact decimal precision |
| `payment_method`| `VARCHAR(50)`| `NOT NULL`, Default: `'UPI'` | `'UPI'`, `'IMPS'`, `'NET_BANKING'`, `'CARD'` | Payment rail |
| `location` | `VARCHAR(255)`| `NULLABLE` | Geolocation city / IP location | Spatial anomaly detection |
| `status` | `VARCHAR(32)` | `NOT NULL`, Index | `'ALLOWED'`, `'PENDING_GUARDIAN_APPROVAL'`, `'GUARDIAN_APPROVED'`, `'GUARDIAN_REJECTED'`, `'CONFIRMED'`, `'CANCELLED'`, `'REPORTED'` | Payment state machine |
| `timestamp` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()`, Index | Transaction initiation timestamp | Time series & velocity |

---

#### 8. `risk_scores` (Fusion Engine Risk Evaluations)
Detailed outputs from the ML and rule-based risk fusion engine for every transaction.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Risk score evaluation ID | Evaluation ID |
| `transaction_id`| `BIGINT` | **FOREIGN KEY (`transactions.id`)**, `NOT NULL`, Index | Evaluated transaction | 1-to-N evaluation history |
| `final_score` | `FLOAT` | `NOT NULL` | Calculated risk score (0.0 to 100.0) | Displayed on Home RiskGauge |
| `risk_level` | `VARCHAR(16)` | `NOT NULL` | `'LOW'`, `'MEDIUM'`, `'HIGH'` | Level categorization |
| `decision` | `VARCHAR(32)` | `NOT NULL` | `'ALLOW'`, `'WARN'`, `'CONFIRM_OR_CANCEL'` | Engine verdict |
| `fraud_probability`| `FLOAT` | `NULLABLE` | XGBoost/ML classification probability (0-1) | ML sub-score |
| `anomaly_score` | `FLOAT` | `NULLABLE` | Isolation Forest behavioral score (0-1) | Anomaly sub-score |
| `device_score` | `FLOAT` | `NULLABLE` | Device risk component (0-100) | Hardware risk |
| `behaviour_score`| `FLOAT`| `NULLABLE` | Spending velocity & time anomaly (0-100) | Profile deviation |
| `voice_score` | `FLOAT` | `NULLABLE` | Audio scam heuristic score (0-100) | Voice call threat signal |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()`, Index | Calculation timestamp | Audit trail |

---

#### 9. `risk_factors` (Explainability & Scam Reason Codes)
Human-readable reasons explaining why a transaction received an elevated risk score.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Factor record ID | Internal |
| `risk_score_id`| `BIGINT` | **FOREIGN KEY (`risk_scores.id`)**, `NOT NULL`, Index | Link to parent evaluation | Cascade delete |
| `factor_type` | `VARCHAR(50)` | `NOT NULL` | `'RULE'`, `'ML_FEATURE'`, `'VOICE'`, `'DEVICE'` | Category |
| `factor_name` | `VARCHAR(100)`| `NOT NULL` | E.g. `'NEW_RECIPIENT'`, `'URGENCY_KEYWORD'` | Code identifier |
| `contribution` | `FLOAT` | `NOT NULL` | Weighted score contribution (e.g. 35.0) | Math contribution |
| `explanation` | `TEXT` | `NOT NULL` | User-facing explanation text | Displayed on Payments screen |

---

#### 10. `trusted_contacts` (Enrolled Family Guardians)
Contacts designated by the user to approve high-risk intercepted payments.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Guardian record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | User who added the guardian | User isolation |
| `contact_name` | `VARCHAR(100)`| `NOT NULL` | Name (e.g. "Priya Sharma") | Displayed in UI |
| `contact_phone_hash`| `VARCHAR(64)`| `NOT NULL`, Index | SHA-256 hash of guardian mobile | Prevents plaintext phone exposure |
| `phone_masked` | `VARCHAR(20)` | `NOT NULL` | Display string (e.g. `+91-98765-XXXXX`) | Safe for frontend display |
| `relationship` | `VARCHAR(50)` | `NOT NULL`, Default: `'Family'` | `'Spouse'`, `'Parent'`, `'Sibling'`, `'Friend'` | User classification |
| `consent_status`| `VARCHAR(32)`| `NOT NULL`, Default: `'PENDING'` | `'PENDING'`, `'ACCEPTED'`, `'REVOKED'` | DPDP Act consent requirement |
| `consented_at` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp when guardian accepted invite | Legal compliance proof |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Enrollment date | Audit |

---

#### 11. `guardian_requests` (Live Scam Hold Approvals)
Active and historical approval requests sent to guardians when payments are intercepted.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Request record ID | Internal |
| `transaction_id`| `BIGINT` | **FOREIGN KEY (`transactions.id`)**, `NOT NULL`, Index | Intercepted transaction | Linked payment |
| `trusted_contact_id`| `BIGINT`| **FOREIGN KEY (`trusted_contacts.id`)**, `NOT NULL`, Index | Assigned guardian | Recipient |
| `outcome` | `VARCHAR(32)` | `NOT NULL`, Default: `'PENDING'` | `'PENDING'`, `'APPROVED'`, `'REJECTED'`, `'TIMEOUT'` | Approval outcome |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL`, Index | Expiration window (e.g. 5 minutes from hold) | Prevents indefinite holds |
| `resolved_at` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp of guardian action | Resolution timing |
| `resolution_notes`| `TEXT` | `NULLABLE` | Notes entered by guardian on decision | Feedback |
| `resolution_channel`| `VARCHAR(50)`| `NOT NULL`, Default: `'MOBILE_APP'` | `'MOBILE_APP'`, `'SMS_LINK'`, `'WEB_PORTAL'` | Audit channel |
| `requested_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Dispatch timestamp | Timing analysis |

---

#### 12. `alerts` (Security Notifications & Warnings)
Critical alerts pushed to the user regarding intercepted threats, voice scams, and new devices.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Alert record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | Target user ID | User partition |
| `transaction_id`| `BIGINT` | **FOREIGN KEY (`transactions.id`)**, `NULLABLE`, Index | Related transaction | Optional relation |
| `category` | `VARCHAR(50)` | `NOT NULL` | `'PAYMENT'`, `'VOICE_SCAM'`, `'DEVICE_LOGIN'`, `'SYSTEM'` | Alert classification |
| `severity` | `VARCHAR(16)` | `NOT NULL` | `'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'` | Visual styling & priority |
| `title` | `VARCHAR(255)`| `NOT NULL` | Short title (e.g. "Suspicious payment held") | User notification text |
| `description` | `TEXT` | `NOT NULL` | Detailed explanation and guidance | Guidance text |
| `is_read` | `BOOLEAN` | `NOT NULL`, Default: `FALSE` | Read status | Drives unread badge counts |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()`, Index | Dispatch timestamp | Sorted newest first |

---

#### 13. `user_feedback` (False Positive & User Reports)
User disputes, false positive reports, and confirmed scam reports.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Feedback ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | Reporting user ID | User link |
| `transaction_id`| `BIGINT` | **FOREIGN KEY (`transactions.id`)**, `NOT NULL`, Index | Related transaction | Transaction link |
| `feedback_type` | `VARCHAR(32)` | `NOT NULL` | `'FALSE_POSITIVE'`, `'CONFIRMED_SCAM'`, `'ACCIDENTAL_OVERRIDE'` | Feedback type |
| `comments` | `TEXT` | `NULLABLE` | User description of the incident | User-provided text |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Report timestamp | Model retraining pipeline |

---

#### 14. `voice_analyses` (Scam Call Detection Logs)
Logs of real-time speech analysis during live calls (urgency, impersonation, OTP solicitation).

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Audio analysis record ID | Internal |
| `user_id` | `BIGINT` | **FOREIGN KEY (`users.id`)**, `NOT NULL`, Index | User receiving call | User link |
| `transaction_id`| `BIGINT` | **FOREIGN KEY (`transactions.id`)**, `NULLABLE`, Index | Correlated transaction | Fraud correlation |
| `caller_hash` | `VARCHAR(64)` | `NULLABLE` | SHA-256 of incoming caller phone number | Hashed caller ID |
| `scam_probability`| `FLOAT` | `NOT NULL` | 0.0 to 1.0 scam probability | Threat score |
| `detected_patterns`| `JSONB` | `NOT NULL` | Detected keywords (e.g. `['electricity_bill', 'cut_off']`) | NLP keyword list |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Call analysis time | Time correlation |

---

#### 15. `fraud_cases` (Institution Investigation & Bank Review)
Case management records for bank compliance officers reviewing high-risk incidents.

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Case ID | Institution ticket |
| `transaction_id`| `BIGINT` | **FOREIGN KEY (`transactions.id`)**, `NOT NULL`, Index | Flagged transaction | Case origin |
| `assigned_officer`| `VARCHAR(100)`| `NULLABLE` | Compliance officer ID / email | Case ownership |
| `status` | `VARCHAR(32)` | `NOT NULL`, Default: `'OPEN'` | `'OPEN'`, `'UNDER_REVIEW'`, `'CONFIRMED_FRAUD'`, `'FALSE_POSITIVE'`, `'CLOSED'` | Case workflow |
| `notes` | `TEXT` | `NULLABLE` | Investigation notes | Bank internal records |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()` | Case open timestamp | SLA tracking |

---

#### 16. `audit_logs` (Immutable Security Audit Trail)
Tamper-evident logs of all security-sensitive actions (logins, password updates, guardian approvals).

| Column | Data Type | Constraints | Description | Security / Privacy |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | **PRIMARY KEY** | Log ID | Read-only append |
| `user_id` | `BIGINT` | `NULLABLE`, Index | User involved (if applicable) | Actor link |
| `event_type` | `VARCHAR(64)` | `NOT NULL`, Index | E.g. `'AUTH_LOGIN_SUCCESS'`, `'PASSWORD_RESET'`, `'GUARDIAN_APPROVED'` | Event code |
| `ip_address` | `VARCHAR(45)` | `NULLABLE` | Originating IP address | Source attribution |
| `details` | `JSONB` | `NULLABLE` | Structured event metadata | Context (no plain secrets) |
| `timestamp` | `TIMESTAMPTZ` | `NOT NULL`, Default: `NOW()`, Index | Occurrence time | Immutable record |

---

## 4. Authentication & Account Data Security Standards

### 4.1 What MUST Be Stored in the Database

1. **User Identity Baseline:** `public_id` (UUID), `name`, `phone_hash` (one-way SHA-256 with server pepper), account status, and timestamps.
2. **Cryptographic Password Hashes:** Secure salted hashes generated using **Argon2id** (preferred) or **bcrypt (cost 12+)**.
3. **Encrypted PII (`user_contact_info`):** Raw email and raw phone number encrypted at rest using AES-256-GCM or Fernet with a dedicated KMS-managed key.
4. **Session JTI & Refresh Token Hashes:** One-way hashes of refresh tokens to support multi-device management and instantaneous revocation.
5. **Security State:** Failed attempt counters, lockout expiration timestamps, and MFA status.

### 4.2 What MUST NEVER Be Stored in the Database

1. ❌ **Plaintext Passwords:** Under no circumstance should plaintext or reversibly encrypted passwords ever be written to disk, database, or logs.
2. ❌ **Plaintext Payment Credentials / Card Numbers:** Full credit/debit card numbers (PAN) and CVVs must never enter the database (violates PCI-DSS & RBI tokenization mandates).
3. ❌ **UPI PINs or MPINs:** Never request, process, or store user UPI PINs.
4. ❌ **Raw JWT Tokens in Plaintext:** Only hashed refresh token signatures should be stored in the session table.
5. ❌ **Raw SMS OTP Codes:** Only short-lived (3-5 min) cryptographically hashed OTPs with max attempt limits should be stored in Redis/memory.

### 4.3 Managed Auth Provider vs. Custom In-Database Auth

| Dimension | Custom FastAPI + PostgreSQL Auth | Managed Provider (Supabase Auth / Firebase / Clerk) |
| :--- | :--- | :--- |
| **Control & Hosting** | 100% self-hosted on your own server/VPC | Hosted on third-party cloud infrastructure |
| **Password & Token Security** | Implemented in Python (`passlib`, `argon2-cffi`, `python-jose`) | Managed by provider with built-in brute-force protection |
| **SMS OTP & Verification** | Requires direct integration with Twilio/MSG91 gateway | Built-in SMS/Email verification flows |
| **Integration Complexity** | Matches existing FastAPI backend perfectly | Requires adopting provider's client SDKs & webhook syncing |
| **Recommendation** | **Recommended if you want to keep the existing FastAPI backend architecture intact.** | **Recommended if you want out-of-the-box phone OTP and zero password maintenance.** |

---

## 5. Backend Requirements & Recommended Architecture

### 5.1 Analysis of Current FastAPI Backend
The existing FastAPI backend (`apps/api`) already has a clean structure with SQLAlchemy models, repositories, and routers. However, to support production database authentication, the following components must be implemented:

```
apps/api/app/
├── core/
│   ├── security.py          # UPGRADE: Add password hashing (Argon2id) & JWT token creation/verification
│   ├── database.py          # UPGRADE: Connect to PostgreSQL (DATABASE_URL from environment)
│   └── dependencies.py      # NEW: FastAPI Depends(get_current_user) token extractor
├── api/
│   └── routers/
│       ├── auth.py          # UPGRADE: Real password verification, JWT issuance, refresh endpoint
│       ├── users.py         # UPGRADE: Enforce token-based user isolation
│       └── transactions.py  # UPGRADE: Scope queries to authenticated user_id
└── schemas/
    └── auth.py              # NEW: Token schemas, Login credentials, PasswordReset schemas
```

### 5.2 Required Python Dependencies to Add (`apps/api/requirements.txt`)

```text
passlib[argon2,bcrypt]==1.7.4     # Password hashing algorithms
python-jose[cryptography]==3.3.0  # JWT token generation, signing, and verification
psycopg2-binary==2.9.10           # PostgreSQL database adapter
redis==5.2.1                      # (Optional) Fast OTP verification & rate limiting
```

### 5.3 Required Authentication API Endpoints

| HTTP Method | Endpoint | Description | Access Level |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/signup` | Register new user, hash password, create DB records, issue JWT | Public |
| `POST` | `/api/v1/auth/login` | Verify credentials, reset failed counter, issue access & refresh tokens | Public |
| `POST` | `/api/v1/auth/refresh` | Validate refresh token, issue new access token (token rotation) | Public (Refresh Token) |
| `POST` | `/api/v1/auth/logout` | Revoke session in `user_sessions` table | Authenticated |
| `GET` | `/api/v1/auth/me` | Fetch currently logged-in user profile derived from JWT claims | Authenticated |
| `POST` | `/api/v1/auth/change-password` | Verify current password and set new Argon2id hash | Authenticated |
| `POST` | `/api/v1/auth/forgot-password` | Dispatch password reset OTP / signed reset link | Public |
| `POST` | `/api/v1/auth/reset-password` | Validate OTP / reset token and update password hash | Public |

---

## 6. Frontend Changes Required (Mobile & Web)

### 6.1 Mobile Application Modifications

| File Path | Component / Service | Required Change |
| :--- | :--- | :--- |
| `apps/mobile/src/services/api-client.ts` | `ApiClient`, `IS_DEMO_MODE` | Remove hardcoded `IS_DEMO_MODE` bypass. Ensure `ApiClient.request` automatically attaches `Authorization: Bearer <token>` and handles `401 Unauthorized` token refreshing. |
| `apps/mobile/src/services/auth-service.ts` | `AuthService` | Replace `buildDemoSession` with actual backend payload mapping. Store access token + refresh token in `expo-secure-store`. Implement automatic silent token refresh. |
| `apps/mobile/src/context/AuthContext.tsx` | `AuthContext`, `AuthProvider` | Maintain real user session state. On app launch, validate stored refresh token against `/api/v1/auth/me`. Handle session expiry gracefully. |
| `apps/mobile/src/screens/LoginScreen.tsx` | `LoginScreen` | Connect form submission directly to `AuthService.login()` with real error handling (e.g. invalid password, locked account). |
| `apps/mobile/src/screens/CreateAccountScreen.tsx` | `CreateAccountScreen` | Connect registration form to `AuthService.signup()` with backend field error mapping (e.g. phone already in use). |
| `apps/mobile/src/services/payment-service.ts` | `PaymentService` | Remove `CentralPaymentManager` in-memory mock fallback. Ensure all queries pass the authenticated user's ID or rely on backend JWT extraction. |
| `apps/mobile/src/services/alert-service.ts` | `AlertService` | Replace `DEMO_ALERTS` with `GET /api/v1/users/{userId}/alerts` from database. |
| `apps/mobile/src/services/guardian-service.ts` | `GuardianService` | Replace mock approvals with real WebSocket / polling updates from `guardian_requests` table. |

### 6.2 Web Application Modifications (`apps/web`)

| File Path | Required Change |
| :--- | :--- |
| `apps/web/lib/api.ts` | Update API client to store JWT tokens in `HttpOnly`, `SameSite=Strict`, `Secure` cookies or secure local storage. |
| `apps/web/app/login/page.tsx` | Connect login form to FastAPI backend `/api/v1/auth/login`. |
| `apps/web/app/institution/` | Protect institution routes so only accounts with role `'COMPLIANCE_OFFICER'` or `'ADMIN'` can access fraud cases. |

---

## 7. Step-by-Step Database Integration Roadmap

```mermaid
graph TD
    S1[Step 1: Database Provisioning & Schema Migration] --> S2[Step 2: Backend Password Hashing & Security Module]
    S2 --> S3[Step 3: Registration & Login Endpoints with JWT]
    S3 --> S4[Step 4: Endpoint Security & Token Dependencies]
    S4 --> S5[Step 5: Frontend AuthService & SecureStore Integration]
    S5 --> S6[Step 6: User-Specific Financial & Risk Data Wiring]
    S6 --> S7[Step 7: Real-time Guardian & Alert Notifications]
    S7 --> S8[Step 8: Multi-user Security & Isolation Testing]
```

### Step 1: Database Provisioning & Schema Migration
1. Set up a PostgreSQL instance (local PostgreSQL 16+ or hosted Supabase/Neon/RDS).
2. Configure `DATABASE_URL=postgresql://user:password@host:5432/avaran_db` in `.env`.
3. Add `user_credentials` and `user_sessions` models to `apps/api/app/models/`.
4. Generate and run Alembic migrations (`alembic revision --autogenerate -m "add auth and credentials schema"` followed by `alembic upgrade head`).

### Step 2: Implement Backend Password Hashing & Cryptography
1. Create `app/core/security.py` utilities:
   - `hash_password(password: str) -> str` using Argon2id / bcrypt.
   - `verify_password(plain_password: str, hashed_password: str) -> bool`.
   - `create_access_token(data: dict, expires_delta: timedelta) -> str`.
   - `create_refresh_token() -> (str, str)` (returns plain token for client + SHA-256 hash for database).

### Step 3: Implement Registration & Login Endpoints
1. In `apps/api/app/api/routers/auth.py`, implement `POST /signup`:
   - Validates input format (E.164 phone, valid email, strong password).
   - Hashes password using Argon2id and saves to `user_credentials`.
   - Encrypts contact details and saves to `user_contact_info`.
   - Creates a new `user_sessions` entry and returns access + refresh tokens.
2. Implement `POST /login`:
   - Looks up user by `phone_hash` or encrypted email index.
   - Verifies password against `user_credentials.password_hash`.
   - Increments failed counter or handles account lockout if invalid.
   - On success, resets failed attempts, creates session, and returns tokens.

### Step 4: Secure Backend Endpoints with Token Dependencies
1. Create `app/core/dependencies.py` with `get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User`.
2. Update `/api/v1/users/{user_id}/...` endpoints:
   - Verify that the authenticated `current_user.id == requested_user_id` (or user is an authorized admin).
   - Prevent users from reading or modifying another user's transactions, alerts, or guardians.

### Step 5: Update Frontend Mobile Auth & Storage
1. In `apps/mobile/src/services/auth-service.ts`:
   - Store access token in memory (`ApiClient`) and refresh token in `expo-secure-store`.
   - Implement `getCurrentUser()` to validate stored session on app launch.
2. In `apps/mobile/src/context/AuthContext.tsx`:
   - Wire `login()` and `signup()` to live API responses.
   - Ensure `isPostLoginLoading` triggers the `PostLoginSplashScreen` only on fresh login.

### Step 6: Connect Domain Data (Transactions, Risk Score, Alerts)
1. In `apps/mobile/src/screens/HomeScreen.tsx`, fetch real overview data from `GET /api/v1/users/{userId}/overview`.
2. Connect `RiskGauge` on the Home screen to animate from 0 to the user's real calculated score.
3. In `apps/mobile/src/screens/PaymentsScreen.tsx`, load real paginated transactions from `GET /api/v1/users/{userId}/transactions`.

### Step 7: Multi-User Testing & Verification
1. Create User A (e.g. `rahul@example.com`) and User B (e.g. `priya@example.com`).
2. Log in as User A: create transactions, add trusted contacts.
3. Log in as User B: verify that User B sees **0** of User A's transactions, alerts, or contacts.
4. Test token expiration, refresh rotation, and logout revocation.

---

## 8. Security, Privacy & Compliance Requirements

### 8.1 Password & Credential Security
- **Algorithm:** Argon2id (`time_cost=3`, `memory_cost=65536`, `parallelism=4`) or bcrypt (work factor 12).
- **Password Policy:** Minimum 8 characters, at least 1 uppercase letter, 1 number, and 1 special character.
- **Brute Force Protection:** Maximum 5 consecutive failed attempts before a 15-minute temporary lockout.

### 8.2 Token & API Security
- **Access Token Lifespan:** Short-lived JWT (15–30 minutes).
- **Refresh Token Lifespan:** Long-lived (7–30 days) with **Refresh Token Rotation (RTR)** — using a refresh token invalidates it and issues a new pair.
- **Token Revocation:** Logging out marks the session row `is_revoked = TRUE` in the database.
- **Transport Security:** All communication over HTTPS (TLS 1.3).
- **CORS Configuration:** Restrict FastAPI CORS origins strictly to authorized mobile app schemes and official web domains.

### 8.3 Privacy & Regulatory Compliance (DPDP Act 2023 & RBI Guidelines)
- **Data Minimization:** Financial risk engine operates primarily on hashes (`phone_hash`, `device_hash`, `recipient_hash`). Raw contact details are isolated in encrypted storage.
- **Right to Erasure:** Deleting a user account cascades to delete credentials, sessions, contact info, and guardian links.
- **Guardian Consent:** Two-way consent (`consent_status = 'ACCEPTED'`) is recorded before routing scam hold requests to third-party family members.
- **Audit Immutability:** System audit logs must be write-only/append-only.

---

## 9. Decisions & Information Needed from the Project Owner

Before writing code for the database integration, please review and decide on the following architectural choices:

| Decision Item | Options | Implications & Recommendations |
| :--- | :--- | :--- |
| **1. Database Engine & Hosting** | **A.** Managed PostgreSQL (Supabase / Neon / AWS RDS)<br>**B.** Local / Self-hosted PostgreSQL on VPS<br>**C.** Retain SQLite (`Avaran.db`) | **Recommendation: Option A (Supabase or Neon PostgreSQL)** for seamless cloud migration, automated backups, and scalability. |
| **2. Authentication Provider Strategy** | **A.** Custom FastAPI JWT + PostgreSQL Auth<br>**B.** Managed Auth (Supabase Auth / Firebase / Clerk) | **Recommendation: Option A** if you want to keep full control of the existing FastAPI backend code; **Option B** if you want automated SMS OTP delivery with zero backend auth maintenance. |
| **3. User Verification Mechanism** | **A.** Mobile Phone SMS OTP (Twilio / MSG91 / Fast2SMS)<br>**B.** Email Magic Link / Email OTP<br>**C.** Password-only (simplest for demos/prototypes) | **Recommendation: Start with Option C (Password-based with database hashes)** to get the system database-driven immediately, then add Option A (SMS OTP) for production. |
| **4. Transaction & Payment Data Source** | **A.** Live UPI Simulation Engine (generates real DB rows per user)<br>**B.** Account Aggregator / Bank Open Sandbox API (Setu / Finvu / Razorpay Sandbox) | **Recommendation: Option A (Enhanced simulation engine writing to PostgreSQL)** ensures 100% controllable high-risk scam demos for evaluations. |
| **5. Multi-Factor Authentication (MFA)** | **A.** Optional TOTP / Biometric authentication<br>**B.** Mandatory 2FA on high-risk transfers<br>**C.** Single-factor password/OTP only | **Recommendation: Option B** matches Avaran's core value proposition of biometric/guardian intervention on high-risk payments. |

---
*End of Requirements Roadmap — Ready for Implementation upon Decision Review.*
