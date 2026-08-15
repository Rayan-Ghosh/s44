# S40 --- End-to-End Technical Implementation Plan

> **Project:** SOAIDEATHON 2026 --- Problem Statement S40\
> **Goal:** Build a privacy-preserving, real-time fraud-risk engine that
> detects suspicious payment behaviour, device changes, coercive
> interaction patterns, and voice-phishing indicators before a
> transaction is completed; explains the risk to users; supports user
> confirmation; and enables institutional review of false positives.

------------------------------------------------------------------------

## 1. Product Vision

S40 should be presented as an **explainable, multimodal, real-time fraud
decision system**, not simply as a fraud-classification model.

### Core story

``` text
Payment / User Context
        ↓
Real-Time Signal Collection
        ↓
User Risk Profile + Historical Context
        ↓
Feature Engineering
        ↓
┌────────────────┬────────────────┬────────────────────┐
│ Transaction ML │ Behaviour ML   │ Social-Engineering │
│ + Fraud Model  │ + Anomaly      │ / Voice-NLP        │
└────────────────┴────────────────┴────────────────────┘
        │                │                  │
        └────────────────┼──────────────────┘
                         ↓
              Device Risk + Rule Engine
                         ↓
              Risk Calibration + Fusion
                         ↓
             Final Risk + Risk Factors
                         ↓
                  Explainability
                         ↓
                  Decision Engine
              ├── Low    → Allow
              ├── Medium → Warn + User Choice
              └── High   → Strong Confirmation / Cancel
                         ↓
                    User Outcome
                         ↓
                 Feedback + Audit
                         ↓
                Institution Dashboard
                         ↓
                 Model Monitoring Loop
```

------------------------------------------------------------------------

# 2. Goals

## Primary Goals

-   Detect suspicious transactions in real time.
-   Detect abnormal payment behaviour.
-   Detect device/account changes.
-   Detect coercive or social-engineering interaction patterns.
-   Detect voice-phishing indicators.
-   Combine multiple signals into a single risk score.
-   Explain why a transaction was flagged.
-   Avoid unnecessarily blocking legitimate transactions.
-   Allow users to confirm or cancel suspicious transactions.
-   Capture false-positive feedback.
-   Provide an institutional dashboard for review and analytics.
-   Demonstrate privacy-preserving handling of sensitive information.

## Non-Goals for the Hackathon

-   Direct integration with live banking/UPI infrastructure.
-   Real-money transaction processing.
-   Production-grade banking compliance certification.
-   Perfect fraud detection.
-   Replacing a bank's actual transaction authorization system.

For the demo, use a realistic transaction simulator and
synthetic/anonymized data.

------------------------------------------------------------------------

# 3. Recommended Tech Stack

## Frontend

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   Framer Motion
-   Recharts
-   Lucide icons

### Frontend objectives

-   Premium fintech visual design.
-   Responsive web application.
-   Animated risk visualization.
-   Real-time transaction feed.
-   User warning/confirmation experience.
-   Institution dashboard.
-   Fraud analytics.
-   Explainability panels.

------------------------------------------------------------------------

## Backend

-   Python
-   FastAPI
-   Pydantic
-   SQLAlchemy
-   Alembic

### Backend responsibilities

-   Transaction API
-   Risk orchestration
-   Feature computation
-   ML inference
-   Voice-analysis orchestration
-   User confirmation
-   Alert generation
-   Feedback collection
-   Institution APIs
-   Audit logging

------------------------------------------------------------------------

## ML

### Tabular fraud model

Recommended:

-   XGBoost or LightGBM

Output:

``` text
P(fraud)
```

### Behaviour anomaly model

Recommended:

-   Isolation Forest initially
-   Autoencoder as an optional extension

Output:

``` text
anomaly_score
```

### Voice/social-engineering model

Pipeline:

``` text
Audio
  ↓
Speech-to-Text
  ↓
Text preprocessing
  ↓
Social-engineering classifier
  ↓
Threat / urgency / authority / financial-request signals
  ↓
voice_risk_score
```

### Explainability

-   SHAP for tabular ML
-   Rule-based explanations
-   Feature contribution display

------------------------------------------------------------------------

## Database

Primary:

-   PostgreSQL

Optional:

-   Redis for caching and short-lived real-time state

Core entities:

``` text
users
devices
transactions
recipients
risk_scores
risk_factors
voice_analysis
alerts
user_feedback
fraud_cases
model_predictions
audit_logs
```

------------------------------------------------------------------------

## Infrastructure

-   Docker
-   Docker Compose for local development
-   Git
-   GitHub
-   CI/CD
-   Cloud deployment

Keep infrastructure simple enough for the hackathon.

------------------------------------------------------------------------

# 4. High-Level Architecture

``` text
                         ┌──────────────────────────┐
                         │      Next.js Frontend    │
                         │ User + Institution Apps  │
                         └────────────┬─────────────┘
                                      │
                              REST / WebSocket
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │        FastAPI           │
                         │       API Gateway        │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │    Risk Orchestrator     │
                         │ Transaction Coordination │
                         └────────────┬─────────────┘
                                      │
             ┌────────────────────────┼────────────────────────┐
             ▼                        ▼                        ▼
   ┌────────────────┐       ┌────────────────┐       ┌────────────────────┐
   │ User Risk      │       │ Feature        │       │ Social-Engineering │
   │ Profile        │       │ Engine         │       │ / Voice Service    │
   └───────┬────────┘       └───────┬────────┘       └─────────┬──────────┘
           │                         │                          │
           └─────────────────────────┼──────────────────────────┘
                                     ▼
       ┌────────────────────────────────────────────────────────────┐
       │                    Detection Layer                        │
       │  Transaction Fraud ML │ Behaviour Anomaly │ Device Risk    │
       │  Rule Engine          │ Voice/NLP         │ Other Signals  │
       └──────────────────────────────┬─────────────────────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │   Risk Calibration +     │
                         │     Fusion Engine        │
                         └────────────┬─────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │   Explainability Engine  │
                         │ SHAP + Rules + Deviations│
                         └────────────┬─────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │     Decision Engine      │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                       LOW         MEDIUM         HIGH
                         │            │            │
                       Allow        Warn       Confirm/Cancel
                         │            │            │
                         └────────────┼────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │   User Decision +        │
                         │   Feedback / Audit       │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────┴─────────────┐
                         ▼                          ▼
                ┌─────────────────┐       ┌────────────────────┐
                │ PostgreSQL      │       │ Institution        │
                │ + Redis         │       │ Dashboard          │
                └─────────────────┘       └─────────┬──────────┘
                                                     ▼
                                          ┌────────────────────┐
                                          │ Model Monitoring   │
                                          │ + FP Review        │
                                          └────────────────────┘
```

### Architecture principles

- Use a **modular monolith** for the hackathon, with clearly separated risk, ML, voice, and API modules.
- Keep the detection components independently testable and replaceable.
- Treat the **User Risk Profile** as a first-class context source rather than calculating every historical baseline ad hoc.
- Generate the explanation package **before** the final decision is presented to the user.
- Keep risk-fusion weights/configuration externalized and calibratable.
- Avoid double-counting the same feature across models and rules wherever possible.
- Keep infrastructure simple enough to finish, test, deploy, and demo reliably.

------------------------------------------------------------------------

# 5. End-to-End Transaction Pipeline

## Step 1 --- Transaction Initiation

The demo application generates or receives a payment event.

Example:

``` json
{
  "transaction_id": "TXN_92831",
  "user_id": "USER_102",
  "amount": 24999,
  "recipient_id": "RECIPIENT_442",
  "timestamp": "2026-08-14T20:15:00Z",
  "device_id": "DEVICE_19",
  "location": "Bhubaneswar",
  "payment_method": "UPI"
}
```

Do not use real financial credentials.

------------------------------------------------------------------------

# 6. Signal Collection

Create four major signal groups.

## 6.1 Transaction Signals

Examples:

-   amount
-   transaction frequency
-   recipient novelty
-   merchant novelty
-   transaction time
-   transaction velocity
-   historical average
-   historical maximum
-   amount deviation
-   first-time recipient

Derived features:

``` text
amount_zscore
amount_vs_average
transactions_last_10m
transactions_last_1h
recipient_seen_before
recipient_frequency
time_of_day_deviation
```

------------------------------------------------------------------------

## 6.2 Device Signals

Examples:

-   new device
-   device fingerprint
-   OS/browser change
-   IP/network change
-   location change
-   device age
-   multiple accounts on device

Derived features:

``` text
new_device
device_risk
location_distance
impossible_travel
ip_novelty
device_account_count
```

------------------------------------------------------------------------

## 6.3 Behaviour Signals

Compare current behaviour with the user's historical profile.

Example:

``` text
Normal:
₹300 → ₹700 → ₹500 → ₹1,200

Current:
₹300 → ₹700 → ₹500 → ₹48,000
```

Features:

``` text
behaviour_deviation
amount_deviation
velocity_deviation
recipient_deviation
time_deviation
location_deviation
```

------------------------------------------------------------------------

## 6.4 Voice/Social-Engineering Signals

Example input:

> "Your account will be blocked immediately. Send the money to this
> account now."

Pipeline:

``` text
Microphone
    ↓
Audio capture
    ↓
Speech-to-text
    ↓
Text normalization
    ↓
NLP classifier
    ↓
Social engineering features
```

Extract:

``` text
urgency_score
threat_score
authority_impersonation_score
financial_request_score
coercion_score
phishing_score
```

------------------------------------------------------------------------

# 7. Feature Engineering Layer

Create a unified feature vector.

``` text
X =
[
  transaction_features,
  device_features,
  behaviour_features,
  voice_features
]
```

Example:

``` json
{
  "amount_deviation": 7.2,
  "recipient_novelty": 1,
  "new_device": 1,
  "transaction_velocity": 4,
  "location_anomaly": 0.8,
  "voice_phishing_score": 0.91
}
```

Feature computation should be deterministic and testable.

### User Risk Profile

Maintain a compact historical profile for each user/account. It should provide
context for deviation-based features without exposing unnecessary raw data.

``` text
User Risk Profile
    ├── Normal transaction amount/range
    ├── Frequent recipients
    ├── Known devices
    ├── Typical locations
    ├── Typical transaction times
    ├── Transaction velocity
    └── Historical risk / outcomes
```

A new transaction is compared against this profile to derive features such as
amount deviation, recipient novelty, device novelty, location deviation, and
time deviation.

The profile must be privacy-minimized and should not become a permanent store of
unnecessary sensitive information.

------------------------------------------------------------------------

# 8. Detection Layer

Use a hybrid approach rather than one model.

## 8.1 Rule Engine

Rules provide predictable, fast detection.

Example:

``` text
IF new_device = true
AND amount > historical_average * 5
AND recipient_seen_before = false

THEN increase risk
```

Rules should have:

-   rule ID
-   description
-   severity
-   score contribution
-   explanation

Example:

``` json
{
  "rule_id": "NEW_DEVICE_HIGH_VALUE",
  "severity": "high",
  "score": 25,
  "explanation": "High-value payment initiated from a new device."
}
```

------------------------------------------------------------------------

# 9. Fraud ML Engine

## Supervised model

Use XGBoost/LightGBM.

Input:

``` text
transaction + device + behaviour features
```

Output:

``` text
fraud_probability
```

Example:

``` text
fraud_probability = 0.87
```

Evaluation:

-   Precision
-   Recall
-   F1
-   ROC-AUC
-   PR-AUC
-   Confusion matrix

For fraud detection, pay particular attention to class imbalance.

------------------------------------------------------------------------

# 10. Anomaly Detection Engine

Use Isolation Forest initially.

Purpose:

> Detect behaviour that is unusual even when there is insufficient
> labelled fraud data.

Output:

``` text
anomaly_score = 0.81
```

Use it as an additional signal, not as the sole decision-maker.

------------------------------------------------------------------------

# 11. Voice Phishing Engine

## Pipeline

``` text
Audio
 ↓
Speech-to-Text
 ↓
Text preprocessing
 ↓
Classifier / LLM-assisted analysis
 ↓
Risk attributes
 ↓
Voice risk score
```

Example:

``` json
{
  "urgency": 0.94,
  "threat": 0.82,
  "authority_impersonation": 0.76,
  "financial_request": 0.91,
  "coercion": 0.87,
  "overall_voice_risk": 0.89
}
```

For the hackathon, a reliable pretrained speech-to-text model plus a
lightweight classifier/rules is preferable to attempting to train a
large audio model from scratch.

------------------------------------------------------------------------

# 12. Risk Calibration + Fusion Engine

This is the central decision layer. Individual detectors should **not directly
block transactions**. They produce normalized risk signals that are calibrated
and combined into a final risk score.

Inputs:

``` text
Transaction fraud probability
Behaviour anomaly score
Device risk
Voice/social-engineering risk
Rule risk
Contextual/user-profile risk
```

### Avoiding double-counting

The same underlying feature can influence multiple models. For example,
`new_device` may increase both device risk and a fraud-model probability. The
fusion layer must therefore avoid blindly adding correlated signals twice.

For the hackathon, begin with configurable weighted fusion, then calibrate the
weights against validation scenarios. Document the methodology and keep the
configuration outside model code.

Example normalized inputs:

``` text
Transaction model     0.72
Behaviour anomaly     0.91
Device risk            0.82
Voice risk              0.94
Rule risk               0.80
```

### Recommended prototype architecture

``` text
Individual model outputs
        ↓
Normalization / calibration
        ↓
Correlation / double-count safeguards
        ↓
Configurable weighted fusion
        ↓
Final risk score 0–100
        ↓
Risk level + contributing factors
```

Initial prototype formula:

``` text
final_risk =
    calibrated_transaction_risk
  + calibrated_behaviour_risk
  + calibrated_device_risk
  + calibrated_voice_risk
  + calibrated_rule_risk
  + contextual_adjustment
```

The exact weights are **not scientifically optimal by default**. Calibrate them
using validation data and document the chosen methodology. Keep all thresholds
and weights configurable.

The fusion output should be a structured decision package, not only a number:

``` json
{
  "risk_score": 91,
  "risk_level": "HIGH",
  "risk_factors": [
    "new_device",
    "new_recipient",
    "amount_deviation",
    "voice_phishing"
  ],
  "decision": "CONFIRM_OR_CANCEL"
}
```

------------------------------------------------------------------------

# 13. Decision Engine

Initial thresholds:

``` text
0–30     LOW
31–60    MEDIUM
61–100   HIGH
```

These are prototype thresholds, not banking-grade thresholds.

## Low

``` text
Risk = 17

→ Allow
```

## Medium

``` text
Risk = 58

→ Warning

"This transaction differs significantly
from your usual activity."

[Proceed] [Cancel]
```

## High

``` text
Risk = 91

→ Strong warning

Detected:
• New device
• Unusual amount
• New recipient
• Possible social-engineering indicators

[Confirm it's me]
[Cancel payment]
[Report]
```

------------------------------------------------------------------------

# 14. Explainability Layer

Never show only:

``` text
Fraud probability = 0.87
```

Instead show the reasons.

Example:

``` text
WHY WAS THIS FLAGGED?

🔴 Transaction amount is 7.2× higher
   than the user's normal average.

🟠 Recipient has never been used before.

🟠 Transaction originated from a new device.

🟡 Transaction timing is unusual.

RISK CONTRIBUTION

Transaction       31%
Device             20%
Behaviour          25%
Recipient          14%
Other              10%
```

### Decision-package principle

Explainability is generated immediately after risk fusion and before the final
user-facing decision. The API should return the risk score, decision, and
explanation together so the frontend never has to reconstruct why a decision
was made.

``` text
Risk Fusion
    ↓
Explanation Package
    ↓
Decision Engine
    ↓
User-facing response
```

Use:

-   SHAP
-   rule explanations
-   feature deviations
-   historical comparisons

------------------------------------------------------------------------

# 15. User Confirmation Flow

``` text
             Risk detected
                  ↓
          Explain the reasons
                  ↓
        ┌─────────┴─────────┐
        ↓                   ↓
      Cancel              Proceed
        │                   │
      Report              Confirm
                            │
                            ▼
                        Transaction
```

The goal is to avoid unnecessarily blocking legitimate urgent payments.

------------------------------------------------------------------------

# 16. Feedback Loop

After every suspicious transaction:

``` text
AI prediction
     ↓
User decision
     ↓
Transaction outcome
     ↓
Feedback
```

Store:

``` text
prediction = suspicious
user_feedback = legitimate
```

This becomes a false-positive case.

------------------------------------------------------------------------

# 17. Institution Dashboard

Build a separate dashboard.

## Dashboard sections

### Overview

``` text
Transactions
Suspicious transactions
High-risk transactions
Confirmed fraud
False positives
Average risk
```

### Live Risk Feed

``` text
TXN-92831   ₹49,000   🔴 91
TXN-92830   ₹1,200    🟢 12
TXN-92829   ₹8,900    🟡 64
```

### Fraud Analytics

Charts:

-   fraud over time
-   risk distribution
-   fraud by transaction amount
-   device risk
-   geographic anomalies
-   voice-phishing alerts

### Model Health & Monitoring

Show operational and model-quality indicators alongside fraud analytics:

``` text
Model version          v1.x
Fraud precision        91.2%
Fraud recall            87.4%
F1 score                89.2%
False-positive rate      3.8%
Average inference       84 ms
Voice model status      Healthy
Last evaluation         <timestamp>
```

These values should come from the evaluation/inference metadata where possible
and should clearly be labelled as prototype/demo metrics rather than banking-grade
production guarantees.

### False Positive Review

``` text
Transaction
Risk score
Reasons
Model prediction
User decision
Review status
```

Actions:

``` text
[Mark legitimate]
[Escalate]
[Add investigation note]
```

------------------------------------------------------------------------

# 18. Database Design

## users

``` text
id
name
phone_hash
created_at
risk_profile
```

## devices

``` text
id
user_id
device_hash
first_seen
last_seen
risk_score
```

## transactions

``` text
id
user_id
recipient_id
device_id
amount
timestamp
location
status
```

## risk_scores

``` text
id
transaction_id
fraud_probability
anomaly_score
device_score
behaviour_score
voice_score
final_score
decision
created_at
```

## risk_factors

``` text
id
risk_score_id
factor_type
factor_name
contribution
explanation
```

## voice_analysis

``` text
id
transaction_id
transcript_hash
urgency_score
threat_score
authority_score
financial_request_score
coercion_score
overall_score
```

## user_feedback

``` text
id
transaction_id
user_decision
feedback_type
created_at
```

## fraud_cases

``` text
id
transaction_id
status
reviewer
review_notes
created_at
```

## audit_logs

``` text
id
actor
action
resource
timestamp
metadata
```

------------------------------------------------------------------------

# 19. API Design

## Transaction APIs

``` text
POST /api/v1/transactions
GET  /api/v1/transactions/{id}
```

## Risk APIs

``` text
POST /api/v1/risk/evaluate
GET  /api/v1/risk/{transaction_id}
```

## Voice APIs

``` text
POST /api/v1/voice/analyze
```

## User decision APIs

``` text
POST /api/v1/transactions/{id}/confirm
POST /api/v1/transactions/{id}/cancel
POST /api/v1/transactions/{id}/report
```

## Institution APIs

``` text
GET /api/v1/institution/overview
GET /api/v1/institution/alerts
GET /api/v1/institution/fraud-cases
POST /api/v1/institution/cases/{id}/review
```

------------------------------------------------------------------------

# 20. Real-Time Communication

Use WebSockets for:

-   live transaction feed
-   live risk changes
-   institution alerts
-   dashboard updates

Example:

``` text
Transaction created
      ↓
Risk evaluation
      ↓
WebSocket event
      ↓
Dashboard updates instantly
```

------------------------------------------------------------------------

# 21. Privacy and Security

The system should demonstrate privacy by design.

## Data minimization

Only retain information required for risk evaluation and auditing.

## Sensitive identifiers

Use:

``` text
hash(device_id)
hash(phone_number)
pseudonymous user IDs
```

## Voice

Do not retain raw audio unless explicitly required for the demo.

Prefer:

``` text
audio
 ↓
transcription/features
 ↓
risk analysis
 ↓
discard raw audio
```

## Authentication

Use:

-   JWT/session authentication
-   role-based access control

Roles:

``` text
USER
INSTITUTION_ANALYST
ADMIN
```

## Audit

Record sensitive operations.

------------------------------------------------------------------------

# 22. Frontend Design

The UI should look like a **modern financial security product**, not a
generic dashboard.

## User Application

Pages:

``` text
/
 /dashboard
 /transactions
 /transaction/[id]
 /security
 /alerts
```

Main visual elements:

-   animated risk ring
-   transaction timeline
-   risk factors
-   warning cards
-   confirmation modal
-   live activity
-   security status

------------------------------------------------------------------------

## Institution Application

Pages:

``` text
/institution
/institution/transactions
/institution/alerts
/institution/fraud-cases
/institution/analytics
/institution/models
```

Use:

-   animated counters
-   charts
-   live feed
-   risk heatmaps
-   investigation panels
-   model metrics

------------------------------------------------------------------------

# 23. ML Training Pipeline

``` text
Raw Dataset
    ↓
Data Cleaning
    ↓
Feature Engineering
    ↓
Train/Validation/Test Split
    ↓
Class Imbalance Handling
    ↓
Model Training
    ↓
Evaluation
    ↓
Calibration
    ↓
Explainability
    ↓
Model Artifact
    ↓
FastAPI Inference
```

Store:

``` text
models/
  fraud_model.pkl
  anomaly_model.pkl
  metadata.json
```

Never train inside the API process.

------------------------------------------------------------------------

# 24. Synthetic Data Strategy

Because live banking data will not be available, generate realistic
synthetic transactions.

Generate:

### Legitimate patterns

``` text
normal amounts
regular recipients
known devices
normal locations
normal timing
```

### Fraud patterns

``` text
sudden high-value transaction
new recipient
new device
rapid transactions
location anomaly
unusual timing
```

### Voice-phishing scenarios

Create scripted examples:

``` text
bank impersonation
KYC scam
account-block threat
refund scam
investment scam
police/authority impersonation
```

This allows a deterministic demo.

------------------------------------------------------------------------

# 25. Testing Strategy

## Unit tests

Test:

-   feature calculations
-   rule engine
-   risk fusion
-   thresholds
-   API validation

## Integration tests

Test:

``` text
transaction
 → feature extraction
 → ML inference
 → risk fusion
 → decision
 → database
```

## ML tests

Test:

-   prediction shape
-   missing values
-   model loading
-   threshold behaviour
-   performance metrics

## Frontend tests

Test:

-   transaction flow
-   warning modal
-   confirmation
-   cancellation
-   dashboard loading

------------------------------------------------------------------------

# 26. Demo Scenarios

Prepare at least four scripted scenarios.

## Scenario 1 --- Legitimate

``` text
Known device
Known recipient
Normal amount
Normal location

Risk = LOW
→ Allow
```

## Scenario 2 --- Suspicious transaction

``` text
New recipient
5× normal amount
New device

Risk = MEDIUM/HIGH
→ Warning
```

## Scenario 3 --- Voice phishing

``` text
Suspicious call
       ↓
Voice analysis
       ↓
High social-engineering score
       ↓
User initiates payment
       ↓
Risk fusion increases
       ↓
Strong warning
```

## Scenario 4 --- False positive

``` text
High-value transaction
       ↓
AI flags it
       ↓
User confirms legitimate
       ↓
Feedback recorded
       ↓
Institution dashboard
       ↓
False-positive review
```

------------------------------------------------------------------------

# 27. Repository Structure

``` text
s40-fraud-shield/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── hooks/
│   │
│   └── api/
│       ├── app/
│       │   ├── api/
│       │   ├── core/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   ├── repositories/
│       │   └── main.py
│       └── tests/
│
├── ml/
│   ├── data/
│   ├── features/
│   ├── training/
│   ├── inference/
│   ├── explainability/
│   └── models/
│
├── voice/
│   ├── transcription/
│   ├── preprocessing/
│   ├── classifier/
│   └── tests/
│
├── scripts/
│   ├── generate_data.py
│   ├── seed_database.py
│   └── run_demo.py
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── ml.md
│   ├── security.md
│   └── demo.md
│
├── infra/
│   ├── docker/
│   └── deployment/
│
├── docker-compose.yml
├── README.md
└── .env.example
```

------------------------------------------------------------------------

# 28. Development Phases

## Phase 0 --- Project Definition

-   [ ] Read and freeze S40 requirements.
-   [ ] Define demo scope.
-   [ ] Define architecture.
-   [ ] Define data contracts.
-   [ ] Define acceptance criteria.

## Phase 1 --- Repository & Infrastructure

-   [ ] Create monorepo.
-   [ ] Setup frontend.
-   [ ] Setup FastAPI.
-   [ ] Setup PostgreSQL.
-   [ ] Setup Redis if required.
-   [ ] Setup Docker.
-   [ ] Setup environment configuration.
-   [ ] Setup CI.

## Phase 2 --- Database & APIs

-   [ ] Create database schema.
-   [ ] Add migrations.
-   [ ] Implement transaction APIs.
-   [ ] Implement risk APIs.
-   [ ] Implement feedback APIs.
-   [ ] Implement institution APIs.

## Phase 3 --- Synthetic Data

-   [ ] Build transaction generator.
-   [ ] Build user profiles.
-   [ ] Build device profiles.
-   [ ] Build fraud scenarios.
-   [ ] Build voice-phishing scenarios.
-   [ ] Seed database.

## Phase 4 --- ML

-   [ ] Build feature pipeline.
-   [ ] Train fraud model.
-   [ ] Train anomaly detector.
-   [ ] Evaluate models.
-   [ ] Add model versioning.
-   [ ] Add inference service.
-   [ ] Add SHAP explanations.

## Phase 5 --- Voice

-   [ ] Add audio input.
-   [ ] Add speech-to-text.
-   [ ] Add social-engineering analysis.
-   [ ] Add voice risk score.
-   [ ] Integrate with risk fusion.

## Phase 6 --- Risk Engine

-   [ ] Build rule engine.
-   [ ] Build risk fusion.
-   [ ] Build decision engine.
-   [ ] Build explainability.
-   [ ] Add configurable thresholds.
-   [ ] Add audit logging.

## Phase 7 --- Frontend

-   [ ] Build user dashboard.
-   [ ] Build transaction screen.
-   [ ] Build warning experience.
-   [ ] Build confirmation flow.
-   [ ] Build institution dashboard.
-   [ ] Build analytics.
-   [ ] Build false-positive review.

## Phase 8 --- Real-Time

-   [ ] Add WebSockets.
-   [ ] Add live risk feed.
-   [ ] Add live institution alerts.
-   [ ] Add transaction status updates.

## Phase 9 --- Security

-   [ ] Add authentication.
-   [ ] Add RBAC.
-   [ ] Hash sensitive identifiers.
-   [ ] Add audit logs.
-   [ ] Remove unnecessary raw voice retention.
-   [ ] Validate all APIs.

## Phase 10 --- Testing

-   [ ] Unit tests.
-   [ ] API tests.
-   [ ] Integration tests.
-   [ ] ML tests.
-   [ ] Frontend tests.
-   [ ] End-to-end tests.
-   [ ] Load-test the demo pipeline.

## Phase 11 --- Polish

-   [ ] Improve animations.
-   [ ] Improve visual hierarchy.
-   [ ] Improve loading states.
-   [ ] Improve error states.
-   [ ] Improve explainability.
-   [ ] Add demo data.
-   [ ] Add guided demo mode.

## Phase 12 --- Deployment

-   [ ] Build Docker images.
-   [ ] Deploy backend.
-   [ ] Deploy frontend.
-   [ ] Configure database.
-   [ ] Configure environment variables.
-   [ ] Run production smoke tests.

## Phase 13 --- Final Demo

-   [ ] Prepare legitimate transaction.
-   [ ] Prepare suspicious transaction.
-   [ ] Prepare voice-phishing scenario.
-   [ ] Prepare false-positive scenario.
-   [ ] Prepare institution investigation.
-   [ ] Prepare architecture slide.
-   [ ] Prepare ML metrics.
-   [ ] Prepare privacy/security slide.

------------------------------------------------------------------------

# 29. Acceptance Criteria

The project is considered demo-ready when:

``` text
✓ A transaction can be created.
✓ User/device/history signals are generated.
✓ Risk is evaluated in near real time.
✓ Multiple detection mechanisms contribute to the risk.
✓ Final risk score is produced.
✓ Reasons are shown to the user.
✓ Medium-risk transactions show a warning.
✓ High-risk transactions require explicit confirmation/cancellation.
✓ Voice input can produce a social-engineering signal.
✓ User feedback is recorded.
✓ False positives appear in the institution dashboard.
✓ Institution analysts can review cases.
✓ Dashboard updates in real time.
✓ ML metrics are available.
✓ Sensitive data is minimized/pseudonymized.
✓ Complete demo runs without external banking infrastructure.
```

------------------------------------------------------------------------

# 30. What NOT to Overbuild

Avoid spending hackathon time on:

-   Kubernetes
-   15 microservices
-   Kafka unless genuinely needed
-   training huge models from scratch
-   actual UPI integration
-   complex blockchain components
-   unnecessary mobile apps
-   custom distributed databases

A **modular monolith + dedicated ML/voice modules** is enough for the
prototype.

------------------------------------------------------------------------

# 31. Recommended Architecture Decision

Use:

``` text
Next.js
    +
FastAPI
    +
PostgreSQL
    +
Redis
    +
XGBoost/LightGBM
    +
Isolation Forest
    +
Speech-to-Text
    +
NLP Social-Engineering Classifier
    +
SHAP
    +
WebSockets
    +
Docker
```

The architecture should be modular enough to evolve but simple enough to
finish.

------------------------------------------------------------------------

# 32. The Golden Demo Flow

The strongest 3--5 minute demonstration should be:

``` text
1. Open the user app
        ↓
2. Show normal transaction
        ↓
3. System allows it
        ↓
4. Start a suspicious voice call
        ↓
5. Voice engine detects social-engineering indicators
        ↓
6. Initiate unusually large payment
        ↓
7. Device + transaction + behaviour + voice
   signals are combined
        ↓
8. Risk score jumps to HIGH
        ↓
9. User sees an animated warning
        ↓
10. System explains exactly WHY
        ↓
11. User cancels/reports
        ↓
12. Open institution dashboard
        ↓
13. Show the alert
        ↓
14. Show risk contributors
        ↓
15. Show false-positive review workflow
```

This gives the judges a complete story:

**Detection → Reasoning → Prevention → User Control → Institutional
Review**

------------------------------------------------------------------------

# 33. Team Division

For a small team:

### Member 1 --- AI/ML

-   Fraud model
-   Anomaly detection
-   Feature engineering
-   SHAP
-   Evaluation

### Member 2 --- Backend

-   FastAPI
-   PostgreSQL
-   Risk engine
-   APIs
-   WebSockets
-   Authentication

### Member 3 --- Frontend

-   Next.js
-   User experience
-   Warning flow
-   Institution dashboard
-   Animations

### Member 4 --- Voice/Integration/DevOps

-   Speech-to-text
-   Social-engineering classifier
-   Integration
-   Docker
-   Deployment
-   End-to-end testing

If there are fewer members, combine backend + DevOps and ML + voice.

------------------------------------------------------------------------

# 34. Final System

The finished system should conceptually look like:

``` text
                         S40 FRAUD SHIELD
                               │
                ┌──────────────┴──────────────┐
                │                             │
             USER APP                    INSTITUTION
                │                         DASHBOARD
                │                             │
                ▼                             ▼
         Payment / Voice                Alerts / Cases
                │                             │
                └──────────────┬──────────────┘
                               ▼
                    USER RISK PROFILE
                               ▼
                     FEATURE ENGINE
                               ▼
          ┌────────────────────┼────────────────────┐
          │                    │                    │
       PAYMENT              DEVICE             BEHAVIOUR
       SIGNALS              SIGNALS             SIGNALS
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                         VOICE / TEXT
                               │
                               ▼
                    ┌────────────────────┐
                    │   HYBRID DETECTOR  │
                    │                    │
                    │ Transaction ML     │
                    │ Behaviour Anomaly  │
                    │ Device Risk        │
                    │ Voice/NLP          │
                    │ Rule Engine        │
                    └──────────┬─────────┘
                               ▼
                    CALIBRATION + RISK FUSION
                               ▼
                       RISK SCORE 0–100
                               ▼
                        EXPLAINABILITY
                               ▼
                       DECISION ENGINE
                               ▼
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                   LOW       MEDIUM      HIGH
                    │          │          │
                  ALLOW       WARN      CONFIRM
                               │          │
                               └────┬─────┘
                                    ▼
                            USER DECISION
                         ┌──────────┴──────────┐
                         ▼                     ▼
                      CANCEL                PROCEED
                         │                     │
                         └──────────┬──────────┘
                                    ▼
                             FEEDBACK + AUDIT
                                    ▼
                         INSTITUTION REVIEW
                                    ▼
                       MODEL HEALTH / MONITORING
                                    │
                                    └──► Future calibration
```

## Final positioning

> **S40 is an explainable, privacy-preserving, multimodal real-time
> fraud-risk engine that combines transaction, device, behavioural, and
> voice/social-engineering signals with user-specific context to intervene
> before suspicious payments are completed while preserving user control and
> enabling institutional false-positive review.**

The system is intentionally designed as a practical hackathon prototype: it
should demonstrate the complete decision loop without requiring live banking or
UPI infrastructure, while keeping its modules replaceable enough to evolve into
a more production-oriented architecture later.

------------------------------------------------------------------------

# 35. ML Training & Open-Source Dataset Strategy

## 35.1 Training Philosophy

Do **not** train one giant "S40 model".

S40 is multimodal and has several distinct detection problems. Use
independent models and combine their outputs through the Risk Fusion
Engine.

``` text
                         S40 INPUT
                            │
              ┌─────────────┼─────────────┐
              ↓             ↓             ↓
         Transaction     Behaviour       Voice
            Model          Model          Model
              │             │             │
              └─────────────┼─────────────┘
                            ↓
                      RISK FUSION
                            ↓
                       FINAL RISK
```

Recommended components:

1.  Transaction fraud model
2.  Behaviour/anomaly model
3.  Device-risk features/rules
4.  Voice/social-engineering model
5.  Deterministic rule engine
6.  Risk-fusion layer

------------------------------------------------------------------------

# 36. Open-Source/Public Dataset Strategy

There is no single public dataset that perfectly represents all S40
requirements.

Instead, combine public datasets with a small S40-specific synthetic
dataset.

## 36.1 PaySim

### Purpose

Use PaySim as the initial transaction-fraud dataset.

Useful for:

-   transaction amounts
-   transaction types
-   sender/recipient behaviour
-   balances
-   temporal patterns
-   fraud labels

Recommended use:

``` text
PaySim
  ↓
Transaction Feature Engineering
  ↓
XGBoost Fraud Model
```

Public source:

https://www.kaggle.com/datasets/ealaxi/paysim1

PaySim is particularly useful as a starting point because it represents
mobile-money transactions and provides labelled fraudulent transactions.

------------------------------------------------------------------------

## 36.2 IEEE-CIS Fraud Detection

### Purpose

Use IEEE-CIS for additional fraud modelling and device/identity-related
features.

Useful areas include:

-   transaction information
-   device information
-   identity information
-   timing
-   address-related features
-   browser/device-related information

Recommended use:

``` text
IEEE-CIS
  ↓
Transaction + Device Features
  ↓
Fraud Model / Generalization Test
```

Public source:

https://www.kaggle.com/c/ieee-fraud-detection

Important:

Do not assume that a model trained on PaySim will automatically
generalize to IEEE-CIS. Use IEEE-CIS as an additional
training/validation source and compare performance.

------------------------------------------------------------------------

## 36.3 TeleAntiFraud-28k

### Purpose

Use TeleAntiFraud-28k for the voice/social-engineering component.

It provides audio/text fraud examples and is particularly relevant to
the voice-phishing requirement in S40.

Recommended use:

``` text
Audio
 ↓
Speech-to-Text
 ↓
Transcript
 ↓
Social-Engineering Classifier
 ↓
Voice Risk Score
```

Public source:

https://huggingface.co/datasets/JimmyMa99/TeleAntiFraud

Use the dataset according to its published license and terms. Verify
licensing before including any dataset or derived model in a public
submission.

------------------------------------------------------------------------

# 37. S40-Specific Synthetic Dataset

Public datasets will not contain all of the exact S40 signals.

Create a synthetic dataset that combines:

``` text
transaction
+
device
+
behaviour
+
location
+
recipient
+
voice
```

Example schema:

``` text
user_id
transaction_amount
historical_avg_amount
historical_max_amount
recipient_known
device_known
location_change
transaction_velocity
time_anomaly
device_risk
voice_fraud_score
is_fraud
```

Example legitimate record:

``` json
{
  "device_known": 1,
  "recipient_known": 1,
  "amount_deviation": 0.2,
  "location_anomaly": 0.0,
  "voice_fraud_score": 0.02,
  "is_fraud": 0
}
```

Example suspicious record:

``` json
{
  "device_known": 0,
  "recipient_known": 0,
  "amount_deviation": 8.4,
  "location_anomaly": 0.9,
  "voice_fraud_score": 0.87,
  "is_fraud": 1
}
```

------------------------------------------------------------------------

# 38. Synthetic Data Scenarios

Do **not** generate synthetic data using a simplistic rule such as:

``` text
amount > ₹50,000 → fraud
```

Otherwise the model will simply learn the artificial rule.

Instead create multiple overlapping scenarios.

## Scenario A --- New Device + New Recipient + High Amount

``` text
new_device = 1
new_recipient = 1
amount_deviation = high
```

## Scenario B --- Normal Legitimate Payment

``` text
known_device = 1
known_recipient = 1
normal_amount = 1
normal_location = 1
```

## Scenario C --- New Recipient Only

``` text
known_device = 1
new_recipient = 1
normal_amount = 1
```

## Scenario D --- Location Anomaly

``` text
known_device = 1
known_recipient = 1
location_anomaly = high
```

## Scenario E --- Voice Phishing

``` text
normal_transaction_features
+
high_voice_fraud_score
```

## Scenario F --- Legitimate High-Value Transaction

This is especially important.

``` text
high_amount
known_device
known_recipient
normal_location
user_has_history_of_large_transactions
```

Label:

``` text
fraud = 0
```

This demonstrates that S40 is not simply "block expensive transactions".

------------------------------------------------------------------------

# 39. Transaction Fraud Model

## Recommended model

Start with:

``` text
XGBoost
```

Alternative:

``` text
LightGBM
```

XGBoost is recommended for the first implementation because it is
effective for tabular data, fast to train, and easy to explain with
SHAP.

## Input features

Examples:

``` text
amount
transaction_type
amount_deviation
transaction_velocity
recipient_novelty
time_of_day
historical_average
historical_maximum
device_novelty
location_anomaly
```

## Output

``` text
fraud_probability
```

Example:

``` text
fraud_probability = 0.87
```

------------------------------------------------------------------------

# 40. Behaviour / Anomaly Model

The anomaly model answers:

> "Is this transaction unusual for this particular user?"

This is different from the supervised fraud model.

Example:

``` text
User's normal activity:

₹200
₹500
₹700
₹1,200

Current:

₹48,000
```

Even if the transaction resembles a legitimate transaction in a global
dataset, it may be highly anomalous for this user.

## Recommended model

Start with:

``` text
Isolation Forest
```

Optional later extension:

``` text
Autoencoder
```

## Features

``` text
amount_deviation
transaction_velocity
recipient_novelty
time_deviation
location_deviation
device_novelty
```

## Output

``` text
anomaly_score
```

Example:

``` text
anomaly_score = 0.91
```

Use anomaly detection as an additional signal, not as the sole fraud
decision-maker.

------------------------------------------------------------------------

# 41. Device Risk Model

Device risk does not need a separate neural network initially.

Use engineered features + rules.

Examples:

``` text
new_device
device_age
device_account_count
ip_novelty
location_change
impossible_travel
os_change
browser_change
```

Example:

``` text
new_device = true
device_age = 2 hours
location_change = high
```

This can produce:

``` text
device_risk = 0.82
```

Later, if sufficient labelled data exists, a dedicated device-risk model
can be introduced.

------------------------------------------------------------------------

# 42. Voice / Social-Engineering Model

Do not train a large audio model from scratch for the hackathon.

Use:

``` text
Audio
 ↓
Speech-to-Text
 ↓
Transcript
 ↓
Text classifier
 ↓
Social-engineering features
```

Recommended features:

``` text
urgency
threat
authority_impersonation
financial_request
coercion
credential_request
suspicious_payment_instruction
```

Example transcript:

> "Your bank account will be blocked in 10 minutes. Send the money to
> this account immediately."

Output:

``` json
{
  "urgency": 0.96,
  "threat": 0.91,
  "authority_impersonation": 0.84,
  "financial_request": 0.97,
  "coercion": 0.88,
  "voice_fraud_score": 0.94
}
```

For the prototype, a reliable pretrained speech-to-text model plus a
lightweight classifier/rule layer is preferable to training a large
audio model from scratch.

------------------------------------------------------------------------

# 43. Voice Model Training Data

Use TeleAntiFraud-28k for the initial voice component.

Training flow:

``` text
TeleAntiFraud
      ↓
Audio / Text
      ↓
Train / Validation / Test
      ↓
Text or multimodal features
      ↓
Classifier
      ↓
Voice fraud probability
```

Also create a small S40-specific set of scripted scenarios:

``` text
bank impersonation
KYC scam
account-block threat
refund scam
investment scam
authority/police impersonation
urgent payment instruction
credential/OTP request
```

The synthetic examples should be clearly labelled as synthetic and
should not be presented as real-world call recordings.

------------------------------------------------------------------------

# 44. Training Pipeline

``` text
                     PUBLIC DATASETS
                           │
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
       PaySim          IEEE-CIS       TeleAntiFraud
          │                │                │
          ↓                ↓                ↓
    Transaction       Device/Identity     Voice/NLP
      Features          Features          Features
          │                │                │
          └────────────────┼────────────────┘
                           ↓
                  Feature Engineering
                           │
              ┌────────────┴────────────┐
              ↓                         ↓
       Fraud Model                Anomaly Model
       XGBoost                    Isolation Forest
              │                         │
              └────────────┬────────────┘
                           ↓
                     Voice Model
                           │
                           ↓
                    Risk Fusion Model
                           │
                           ↓
                       S40 Score
```

------------------------------------------------------------------------

# 45. Train / Validation / Test Strategy

Avoid a naive random split for all fraud data.

Fraud is temporal, so the evaluation should mimic deployment as much as
practical.

Recommended:

``` text
Old transactions
      ↓
    TRAIN

Later transactions
      ↓
 VALIDATION

Newest transactions
      ↓
    TEST
```

Initial target:

``` text
70% → train
15% → validation
15% → test
```

Sort chronologically before splitting when timestamps are available.

For datasets with official train/test splits, respect the published
split rather than mixing them together.

------------------------------------------------------------------------

# 46. Class Imbalance

Fraud datasets are usually highly imbalanced.

Do not optimize only for accuracy.

Possible approaches:

``` text
class weights
oversampling
undersampling
threshold tuning
calibration
```

Be careful with synthetic oversampling: apply it only to the training
partition, never before splitting.

------------------------------------------------------------------------

# 47. Model Evaluation

Primary metrics:

``` text
Precision
Recall
F1
PR-AUC
ROC-AUC
```

Also report:

``` text
False Positive Rate
False Negative Rate
Confusion Matrix
```

For S40, prioritize:

``` text
Recall
Precision
PR-AUC
False Positive Rate
```

Why?

-   Missing fraud is costly.
-   Excessive false positives annoy legitimate users.
-   A highly imbalanced dataset can make accuracy misleading.

Example evaluation table:

``` text
Model                  Precision   Recall   F1   PR-AUC
--------------------------------------------------------
XGBoost                  0.xx       0.xx   0.xx   0.xx
Isolation Forest          -         0.xx   0.xx   0.xx
Voice Classifier         0.xx       0.xx   0.xx   0.xx
Fusion System            0.xx       0.xx   0.xx   0.xx
```

Do not invent the numbers. Generate them from your actual test results.

------------------------------------------------------------------------

# 48. Risk Fusion

The individual models should not directly block a transaction. Their outputs
become normalized inputs to the S40 Risk Fusion Engine.

Example:

``` text
Transaction model
fraud_probability = 0.72

Behaviour model
anomaly_score = 0.91

Device model
device_risk = 0.82

Voice model
voice_risk = 0.94
```

Then:

``` text
                 ┌────────────────┐
Fraud ──────────►│                │
Anomaly ────────►│                │
Device ─────────►│ CALIBRATION +  │
Voice ──────────►│ RISK FUSION    │
Rules ──────────►│                │
Context ────────►│                │
                 └───────┬────────┘
                         ↓
                     91 / 100
                         ↓
                       HIGH
```

### Fusion rules

1. Normalize model outputs onto compatible risk scales.
2. Keep weights configurable.
3. Calibrate against validation data.
4. Avoid counting the same feature twice where practical.
5. Preserve the top contributing factors for explainability.
6. Keep a versioned fusion configuration so demo results are reproducible.

Initial prototype formula:

``` text
final_risk = calibrated weighted combination of:
    transaction risk
    behaviour risk
    device risk
    voice/social-engineering risk
    rule risk
    contextual adjustment
```

The fusion layer produces both the numerical score and the evidence required
by the Explainability Engine.

------------------------------------------------------------------------

# 49. Why This Is Better Than One Model

A single model can miss important situations.

Example:

``` text
Known fraud pattern:
fraud model → HIGH
```

But:

``` text
Unusual behaviour:
fraud model → LOW
anomaly model → HIGH
```

Or:

``` text
Normal transaction
+
voice phishing
```

The transaction model may produce a low score while the voice model
detects strong social-engineering indicators.

The fusion layer lets S40 reason across modalities.

------------------------------------------------------------------------

# 50. ML Repository Structure

Recommended:

``` text
ml/
│
├── data/
│   ├── raw/
│   │   ├── paysim/
│   │   ├── ieee_cis/
│   │   └── teleantifraud/
│   │
│   ├── processed/
│   └── synthetic/
│
├── features/
│   ├── transaction_features.py
│   ├── behaviour_features.py
│   ├── device_features.py
│   └── voice_features.py
│
├── training/
│   ├── train_fraud.py
│   ├── train_anomaly.py
│   ├── train_voice.py
│   └── evaluate.py
│
├── models/
│   ├── fraud_xgb.json
│   ├── anomaly.pkl
│   └── voice_classifier/
│
├── explainability/
│   └── shap_explainer.py
│
└── inference/
    └── predict.py
```

------------------------------------------------------------------------

# 51. ML Development Checklist

## Dataset

-   [ ] Download PaySim.
-   [ ] Download IEEE-CIS.
-   [ ] Download TeleAntiFraud-28k.
-   [ ] Verify licenses/usage terms.
-   [ ] Document dataset versions.
-   [ ] Store raw data outside Git.
-   [ ] Create data loaders.
-   [ ] Create preprocessing pipelines.

## Transaction Model

-   [ ] Explore PaySim.
-   [ ] Build transaction features.
-   [ ] Create temporal train/validation/test split.
-   [ ] Train XGBoost baseline.
-   [ ] Tune class weighting.
-   [ ] Evaluate precision/recall/PR-AUC.
-   [ ] Add SHAP.
-   [ ] Test against IEEE-CIS.

## Behaviour Model

-   [ ] Build per-user historical features.
-   [ ] Train Isolation Forest.
-   [ ] Normalize anomaly scores.
-   [ ] Test legitimate high-value users.
-   [ ] Test sudden behavioural changes.

## Device Risk

-   [ ] Create device novelty features.
-   [ ] Create location anomaly features.
-   [ ] Create device/account relationship features.
-   [ ] Implement deterministic rules.
-   [ ] Add device-risk score.

## Voice Model

-   [ ] Prepare TeleAntiFraud data.
-   [ ] Build speech-to-text pipeline.
-   [ ] Extract social-engineering features.
-   [ ] Train/evaluate classifier.
-   [ ] Build S40-specific scripted examples.
-   [ ] Test false positives.

## Fusion

-   [ ] Define model output contracts.
-   [ ] Normalize model scores.
-   [ ] Implement fusion.
-   [ ] Tune thresholds using validation data.
-   [ ] Evaluate the complete system on held-out data.
-   [ ] Log all component scores.

------------------------------------------------------------------------

# 52. Important Data-Science Rules

## Never leak the label

Do not create features that directly reveal:

``` text
isFraud
fraud_label
post_transaction_outcome
```

before prediction.

## Never fit preprocessing on test data

Correct:

``` text
TRAIN
 ↓
fit preprocessing
 ↓
transform validation/test
```

Incorrect:

``` text
ALL DATA
 ↓
fit preprocessing
 ↓
split
```

## Never oversample before splitting

Correct:

``` text
raw data
 ↓
train/test split
 ↓
oversample TRAIN only
```

## Keep a completely untouched final test set

Use the final test set only after model selection and threshold tuning.

------------------------------------------------------------------------

# 53. Final ML Architecture

The final S40 ML stack should be:

``` text
                    ┌───────────────────┐
                    │  Payment Event    │
                    └─────────┬─────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
     Transaction            Device            Behaviour
       Features             Features           Features
          │                   │                   │
          ↓                   ↓                   ↓
      XGBoost             Rules/Score       Isolation Forest
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                         Voice Signals
                              │
                              ↓
                       Voice Classifier
                              │
                              ↓
                     ┌────────────────┐
                     │  Risk Fusion   │
                     └───────┬────────┘
                             ↓
                       Final Risk 0–100
                             ↓
                 ┌───────────┼───────────┐
                 ↓           ↓           ↓
                LOW        MEDIUM       HIGH
                 │           │           │
               ALLOW        WARN      CONFIRM/
                                      CANCEL
                             │
                             ↓
                      Explainability
                             │
                             ↓
                     User Feedback
                             │
                             ↓
                    Institution Review
```

------------------------------------------------------------------------

# 54. Dataset-to-Requirement Mapping

  S40 requirement                Primary data/model
  ------------------------------ -----------------------------------------
  Suspicious payment behaviour   PaySim + IEEE-CIS + synthetic S40
  Device changes                 IEEE-CIS + synthetic device profiles
  Behavioural anomalies          PaySim/IEEE-CIS + user-history features
  Voice phishing                 TeleAntiFraud-28k
  Coercive interaction           TeleAntiFraud + S40 scripted data
  Real-time risk                 Trained models + FastAPI inference
  Explainable warnings           SHAP + rule explanations
  User confirmation              Application decision layer
  False-positive review          Feedback + institution dashboard
  Privacy                        Pseudonymized/synthetic data
  Multimodal risk                Risk Fusion Engine

------------------------------------------------------------------------

# 55. Final Training Strategy

The practical order should be:

``` text
STEP 1
PaySim
  ↓
Build XGBoost baseline
  ↓
Evaluate

STEP 2
IEEE-CIS
  ↓
Add device/identity features
  ↓
Evaluate generalization

STEP 3
Build user-history features
  ↓
Train Isolation Forest
  ↓
Evaluate anomaly detection

STEP 4
TeleAntiFraud
  ↓
Build speech/text pipeline
  ↓
Train voice/social-engineering classifier

STEP 5
Generate S40 synthetic scenarios
  ↓
Combine transaction + device + behaviour + voice
  ↓
Test multimodal combinations

STEP 6
Build Risk Fusion
  ↓
Calibrate weights/thresholds on validation data

STEP 7
Run untouched final tests
  ↓
Generate metrics
  ↓
Export models

STEP 8
Integrate with FastAPI
  ↓
Real-time inference

STEP 9
Connect frontend
  ↓
Explainable warning

STEP 10
Connect institution dashboard
  ↓
False-positive review
```

The final claim should be based on your measured experiments:

> **S40 combines independently trained transaction, behavioural, device,
> and voice/social-engineering detectors with a configurable risk-fusion
> layer to provide explainable, real-time fraud intervention.**

Do not claim that the system is production banking-grade unless you
actually validate it to that standard.
