# Profile & Device Contact Info — Schema Decision

**Status: IMPLEMENTED (Option A, 2026-08-30).** Flagged during the
backend↔mobile wiring pass when `PATCH /api/v1/users/{id}` and
`GET /api/v1/users/{id}/devices` were found to fabricate demo values
("Rahul Sharma", "Google Pixel 8 Pro") for fields the schema had nowhere to
actually store. The project owner chose Option A (§3) and it has been
built per the plan in §6 — see §7 for exactly what shipped and how it was
verified. §1–§6 are kept as-written below as the record of the decision;
they describe the plan, not a still-open question.

Same labeling convention as the other `docs/` files: **CONFIRMED** /
**PROPOSED** / **UNDECIDED**.

---

## 1. The gap

**CONFIRMED** (current code, spec §18, `docs/SECURITY.md` §2): the `users`
table stores only `id`, `name`, `phone_hash`, `created_at`, `risk_profile`.
The `devices` table stores only `id`, `user_id`, `device_hash`, timestamps,
`risk_score`. Neither table has a column for plaintext email, plaintext
phone, or a human-readable device name/type.

This is not an oversight — it directly implements `docs/SECURITY.md` §2's
data-minimization principle: *"only retain information required for risk
evaluation and auditing"*, with phone numbers specifically required to be
stored only as `hash(phone_number)`.

**The conflict this creates:** a profile screen that displays and edits a
user's actual email/phone, and a devices list that shows real device names,
both need *reversible* contact/display data. A one-way hash can never be
shown back to the user or used to send them anything. As written, the spec's
security principle and the product's UX requirement (`PRODUCT_DIRECTIVES.md`
§C — clear, non-jargon information the user can actually read) point in
different directions until someone decides how contact info is stored.

## 2. What's already fixed (no decision needed)

**CONFIRMED** (implemented 2026-08-30): the *fabrication* is gone regardless
of which option below gets picked.
- `PATCH /api/v1/users/{id}` no longer invents `"Rahul Sharma"` /
  `"rahul@example.com"` / `"+91 98765 43210"` when a user isn't found — it
  404s. When a user *is* found, it persists the real `name` and echoes back
  whatever email/phone the client sent (still not persisted — see §3).
- `GET /api/v1/users/{id}/devices` no longer labels every device
  `"Google Pixel 8 Pro"` — it returns a generic `"Device {hash prefix}"`
  label derived from the real `device_hash`.
- The mobile app's `EditProfileModal`/`ProfileScreen` no longer pre-fill or
  fall back to a fake identity; they show the real session or an empty
  state.

These changes are safe under either option in §3 and don't need to be
revisited.

## 3. Options for persisting real contact info

### Option A — Encrypted contact-info table, decoupled from the hash identity system (recommended)

Add a new table, e.g. `user_contact_info`:

```
user_contact_info
  user_id        FK -> users.id, unique
  email          encrypted at rest (app-layer field encryption or a KMS-backed column)
  phone_number   encrypted at rest
  updated_at
```

- `users.phone_hash` stays exactly as-is and keeps doing what it already
  does: uniqueness/lookup at login, and the anonymized identifier used
  everywhere else in the system (ML features, audit logs, institution
  dashboard).
- The new table is the *only* place raw contact info lives, it's encrypted,
  and nothing outside the profile-edit and notification code paths ever
  reads it. This keeps `docs/SECURITY.md` §2's minimization principle intact
  for every other subsystem — the fraud engine, audit logs, and institution
  console never see plaintext contact info, only the hash.
- `devices` gets two plain nullable columns, `device_name` and
  `device_type`, populated from what the *client* reports at registration
  (the backend has no way to know real hardware info — it has to come from
  the app, e.g. `expo-device`). No encryption needed here; a device model
  name isn't sensitive the way a phone number is.

**Tradeoff:** most engineering work of the three options (new table, a real
encryption-at-rest decision, a migration). Correct long-term shape.

### Option B — Add plaintext columns directly to `users`/`devices`

Simplest possible fix: add `email`, `phone_number`, `device_name`,
`device_type` as plain columns, no encryption.

**Tradeoff:** fastest to ship, but it quietly reverses `docs/SECURITY.md`
§2's explicit "only ever store `hash(phone_number)`" rule. Fine for a
hackathon demo using synthetic data (which this project already commits to
per §10 of that doc); wrong for anything presented as production-track.

### Option C — Don't persist it; keep contact info client-side only

Store nothing server-side beyond `phone_hash`. The mobile app keeps
email/phone in `expo-secure-store` alongside the session token (already
wired up as of the auth-hardening pass), and `PATCH /api/v1/users/{id}`
becomes name-only.

**Tradeoff:** zero schema change, strongest privacy posture, but breaks
multi-device: log in on a second phone and the display name/email/phone are
gone because nothing survived server-side. Also doesn't help the *devices*
list, which is inherently server-side data.

## 4. Recommendation

**Option A for anything beyond the hackathon demo.** It's the only one of
the three that doesn't force a choice between "profile screen actually
works" and "the security doc means what it says." For the demo itself,
Option C is defensible if the judges only ever see one device/session — it's
already partially in place (secure-store session persistence exists) and
needs no backend change at all.

## 5. Open items (resolved 2026-08-30 — see §7)

- ~~Which option (A/B/C)~~ — **Option A**, chosen by the project owner.
- ~~Which encryption mechanism~~ — **Fernet** (`cryptography` package),
  key from `CONTACT_INFO_ENCRYPTION_KEY`. Simplest thing that's still
  authenticated encryption, not a KMS-backed setup — appropriate for this
  project's current stage; revisit if it ever needs real key rotation.
- ~~Device name/type reporting~~ — **`expo-device`**, sent alongside
  `device_identifier` on every transaction-creation call (the only place a
  device gets registered right now).

## 6. Concrete implementation plan (if Option A is chosen)

This section exists so "Option A" isn't just a paragraph — it's exactly what
to build, in order, if/when the decision in §5 is made. Nothing in this
section is implemented yet.

### 6.1 Encryption mechanism

Use Python's `cryptography` library, `Fernet` symmetric encryption —
already a `cryptography` dependency likely exists transitively (FastAPI's
ecosystem); if not, `pip install cryptography` is one line. Fernet is the
right amount of machinery here: authenticated encryption (tamper-evident,
not just obfuscated), one key, no external KMS needed for a prototype.

```python
# app/core/contact_encryption.py
from cryptography.fernet import Fernet
from app.core.config import settings

_fernet = Fernet(settings.CONTACT_INFO_ENCRYPTION_KEY.encode())

def encrypt_field(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()

def decrypt_field(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()
```

New env var, same pattern as the existing `HASH_PEPPER`:

```bash
# .env.example
CONTACT_INFO_ENCRYPTION_KEY=  # generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Generate a real key per environment — never reuse the checked-in dev
placeholder in anything beyond local dev, same caveat `HASH_PEPPER` already
carries.

### 6.2 New table — `user_contact_info`

```python
# app/models/user_contact_info.py
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class UserContactInfo(Base):
    __tablename__ = "user_contact_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False, index=True)
    email_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    phone_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="contact_info")
```

Add the mirror relationship to `User` (`app/models/user.py`):
```python
contact_info: Mapped[Optional["UserContactInfo"]] = relationship(
    back_populates="user", uselist=False, cascade="all, delete-orphan"
)
```

Alembic migration:
```bash
cd apps/api
alembic revision --autogenerate -m "add user_contact_info table"
alembic upgrade head
```

### 6.3 `devices` table — two new plain columns

```python
# app/models/device.py — add to the existing Device class
device_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
device_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
```
```bash
alembic revision --autogenerate -m "add device_name/device_type to devices"
alembic upgrade head
```
No encryption needed — a device model string isn't a sensitive identifier
the way phone/email are.

### 6.4 Backend endpoint changes

**`PATCH /api/v1/users/{user_id}`** (`app/api/routers/users.py`) — after
updating `user.name`, upsert the contact row:

```python
from app.core.contact_encryption import encrypt_field, decrypt_field
from app.models.user_contact_info import UserContactInfo

contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user_id).first()
if not contact:
    contact = UserContactInfo(user_id=user_id)
    db.add(contact)
if "email" in payload and payload["email"]:
    contact.email_encrypted = encrypt_field(payload["email"].strip())
if "phone" in payload and payload["phone"]:
    contact.phone_encrypted = encrypt_field(payload["phone"].strip())
db.commit()

return {
    "success": True,
    "user": {
        "id": user.id,
        "name": user.name,
        "email": decrypt_field(contact.email_encrypted) if contact.email_encrypted else "",
        "phone": decrypt_field(contact.phone_encrypted) if contact.phone_encrypted else "",
    },
}
```

**`GET /api/v1/users/{user_id}`** — currently returns `UserRead` (id, name,
phone_hash, created_at only, per `app/schemas/user.py`). Needs a decision of
its own: either extend `UserRead` with decrypted `email`/`phone` (changes a
public response contract other code may depend on) or add a dedicated
`GET /api/v1/users/{user_id}/contact-info` endpoint instead. The plan above
doesn't pick one — flag it when this gets built.

**`GET /api/v1/users/{user_id}/devices`** — accept `device_name`/
`device_type` wherever a device row gets created (there's currently no
explicit "register device" endpoint — devices are implicitly created via
`device_identifier` on `POST /api/v1/transactions`; that creation path is
where these two fields would need to be threaded through from the client).

### 6.5 Mobile changes

- Add `expo-device` (`npx expo install expo-device`) — gives real
  `Device.modelName`, `Device.osName` + `Device.osVersion` on-device.
- Wherever the app currently sends `device_identifier` (the UPI-flow
  transaction creation in `payment-link-service.ts`, and anywhere else a
  device fingerprint gets sent), also send `device_name`/`device_type`
  alongside it once the backend accepts them per §6.4.
- No change needed to `auth-service.ts`'s secure-store session persistence —
  that part is already done and orthogonal to this.

### 6.6 Order of work

1. Decide the option (§5) and the encryption mechanism (§6.1) — human call.
2. Migration: `user_contact_info` table (§6.2).
3. Migration: `devices.device_name` / `devices.device_type` (§6.3).
4. Backend: `PATCH /api/v1/users/{id}` upserts contact info (§6.4).
5. Backend: decide + implement how `GET` exposes decrypted contact info.
6. Backend: thread `device_name`/`device_type` through wherever devices get
   created.
7. Mobile: `expo-device` integration, send real device info.
8. Re-run `apps/api/tests` and `apps/mobile` `tsc --noEmit` — this touches
   `UserRead`'s shape if §6.4's `GET` extension path is chosen, so expect at
   least one schema/test update.

## 7. What actually shipped (2026-08-30)

Followed the §6.6 order exactly, with `GET /api/v1/users/{id}` extended to
carry `email`/`phone` directly on `UserRead` (rather than a separate
`/contact-info` endpoint — simplest option, one round trip for the mobile
profile screen).

**Backend**
- `alembic/versions/62c167040c8b_contact_info_and_device_metadata.py` —
  autogenerated migration: `user_contact_info` table + `devices.device_name`
  / `devices.device_type` columns. Generated by running `alembic upgrade
  head` against a throwaway DB and diffing against the new models, not
  hand-written, so it's checked against the real prior schema.
- `app/core/contact_encryption.py` (new) — Fernet `encrypt_field`/
  `decrypt_field`.
- `app/core/config.py` — `contact_info_encryption_key` setting.
- `app/models/user_contact_info.py` (new), `app/models/user.py` (relationship),
  `app/models/device.py` (`device_name`/`device_type` columns),
  `app/models/__init__.py` (registration).
- `app/schemas/user.py` — `UserRead.email`/`.phone`, default `""`.
- `app/schemas/transaction.py` — `TransactionCreate.device_name`/`.device_type`.
- `app/repositories/device_repository.py` — `create_device`/`touch_last_seen`
  accept and persist the new fields (never overwriting a known name with a
  blank one on a later `touch`).
- `app/services/transaction_service.py` — threads the new fields through.
- `app/api/routers/users.py` — `GET /{id}` returns decrypted contact info;
  `PATCH /{id}` upserts `user_contact_info` (encrypted) instead of just
  echoing the request back; `GET /{id}/devices` uses real
  `device_name`/`device_type` when present, generic fallback otherwise.
- `app/api/routers/auth.py` — `login`/`signup` now read/write real saved
  contact info instead of deriving a guess from the login identifier every
  time.
- `requirements.txt` — added `cryptography==50.0.1`.

**Two bugs fixed in passing, found while touching this code:**
- `users.py`'s `DELETE /{user_id}/trusted-contacts/{contact_id}` imported
  from `app.models.guardian`, a module that doesn't exist (`TrustedContact`
  actually lives in `app.models.trusted_contact`) — this endpoint would
  have thrown `ImportError` on first real use. Fixed the import.
- The mobile app was sending the literal string `"mobile-app-session"` as
  every install's `device_identifier`. Since the backend hashes that value
  to detect "new device" risk, every user was sharing the same device
  fingerprint — the device-risk signal was silently non-functional for
  everyone. Replaced with a real per-install UUID
  (`apps/mobile/src/services/device-info-service.ts`, persisted via
  `expo-secure-store`).

**Mobile**
- `apps/mobile/src/services/device-info-service.ts` (new) — per-install
  device identifier + real `device_name`/`device_type` via `expo-device`.
- `apps/mobile/src/services/payment-link-service.ts` — sends real device
  identifier/name/type instead of the shared literal.
- `apps/mobile/src/services/auth-service.ts` — new `refreshProfile()`.
- `apps/mobile/src/context/AuthContext.tsx` — calls `refreshProfile()` in
  the background after restoring a cached session, so a profile edited
  elsewhere shows up without waiting for the next login.
- `package.json` — added `expo-secure-store` (already present from the
  auth-hardening pass) and `expo-device`.
- `ProfileScreen.tsx` / `EditProfileModal.tsx` needed **no changes** — they
  were already calling the right `updateProfile()`/`session.email`/
  `session.phone` plumbing; it simply had nothing real to talk to until now.

**Verified for real, not inferred from the diff:**
- `apps/api/tests/test_profile_contact_info.py` (new, 7 tests): encrypt/
  decrypt round-trip; `PATCH` → fresh `GET` (not the `PATCH` echo) sees the
  same real values; no-email-saved returns `""` not a fabricated address;
  unknown user `PATCH` → 404; `device_name`/`device_type` persist on the
  device row via a real transaction-creation call; a device with no
  reported name falls back to a generic label, never `"Google Pixel"`;
  `login` returns a previously-`PATCH`-saved email.
- Full backend suite: **53/53 passing** (46 pre-existing + 7 new).
- `apps/mobile`: `tsc --noEmit` clean after every change in this pass.
