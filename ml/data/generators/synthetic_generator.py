"""
Deterministic S40 synthetic transaction generator.

WHAT THIS IS FOR
    Controlled scenario coverage, reproducible demos, and edge cases that
    no public dataset contains (spec §24, §37, §38) — in particular the
    India/UPI framing the product requires (docs/PRODUCT_DIRECTIVES.md §A)
    and the multi-signal combinations S40's fusion layer exists to reason
    about.

WHAT THIS IS NOT
    Evidence. Synthetic data must never be presented as real-world
    validation of S40's accuracy, and must never be described as
    representing real Indian banking behaviour. Every identifier here is
    fabricated; no real person, account, device or payment handle is used.
    (CLAUDE.md: never fabricate metrics; spec §43: synthetic examples must
    be clearly labelled as synthetic.)

DESIGN NOTES
    Each generated user gets a coherent *history* before their scenario
    transaction, because the deviation features S40 depends on (spec §6.3,
    §7) are meaningless without one. The scenario transaction is then
    perturbed along specific axes so a single signal can be isolated.

    Spec §38 warns explicitly against generating labels from a trivial
    rule such as `amount > X -> fraud`, which would just teach a model the
    generator. Two scenarios exist specifically to break that shortcut:
    LEGITIMATE_HIGH_VALUE (large amount, label 0) and FALSE_POSITIVE
    (suspicious-looking, label 0).

    Labels here describe the *scenario's ground truth*, not any model
    output. They are safe to use as targets for controlled testing and
    unsafe to pool with public-dataset labels (different generative
    process entirely) — see docs/DATA_STRATEGY.md.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum

import numpy as np
import pandas as pd

from ml.data.canonical import CANONICAL_COLUMNS, CANONICAL_DTYPES, CanonicalColumn as C

#: Fabricated names/cities for demo realism (product directive §A).
#: Common given names used generically — not references to real people.
_GIVEN_NAMES = (
    "Ananya", "Rohit", "Priya", "Vikram", "Meera", "Arjun",
    "Kavya", "Suresh", "Divya", "Rahul", "Lakshmi", "Imran",
)
_CITIES = (
    "Bhubaneswar", "Chennai", "Pune", "Jaipur", "Kochi",
    "Lucknow", "Guwahati", "Indore",
)


class Scenario(str, Enum):
    """Controlled scenarios. Names mirror spec §26 and §38 where they overlap."""

    LEGITIMATE_ROUTINE = "LEGITIMATE_ROUTINE"
    UNUSUAL_AMOUNT = "UNUSUAL_AMOUNT"
    NEW_RECIPIENT = "NEW_RECIPIENT"
    NEW_DEVICE = "NEW_DEVICE"
    UNUSUAL_TIME = "UNUSUAL_TIME"
    VELOCITY_SPIKE = "VELOCITY_SPIKE"
    WEAK_SIGNAL_COMBINATION = "WEAK_SIGNAL_COMBINATION"
    SOCIAL_ENGINEERING = "SOCIAL_ENGINEERING"
    FALSE_POSITIVE = "FALSE_POSITIVE"
    LEGITIMATE_HIGH_VALUE = "LEGITIMATE_HIGH_VALUE"


SCENARIOS: tuple[Scenario, ...] = tuple(Scenario)

#: Ground-truth label per scenario. Note the two deliberate
#: "looks suspicious but isn't" cases — see module docstring.
_SCENARIO_LABEL: dict[Scenario, int] = {
    Scenario.LEGITIMATE_ROUTINE: 0,
    Scenario.UNUSUAL_AMOUNT: 1,
    Scenario.NEW_RECIPIENT: 0,
    Scenario.NEW_DEVICE: 1,
    Scenario.UNUSUAL_TIME: 0,
    Scenario.VELOCITY_SPIKE: 1,
    Scenario.WEAK_SIGNAL_COMBINATION: 1,
    Scenario.SOCIAL_ENGINEERING: 1,
    Scenario.FALSE_POSITIVE: 0,
    Scenario.LEGITIMATE_HIGH_VALUE: 0,
}


@dataclass(frozen=True)
class SyntheticConfig:
    """Controlled parameters. Every knob is explicit and reproducible."""

    seed: int = 40
    users: int = 40
    #: Mean prior transactions generated per user before their scenario row.
    history_per_user: int = 25
    #: Fractional spread of history length across users (±this proportion).
    #:
    #: Must stay well above zero. With a FIXED history length, every user
    #: has exactly `history_per_user` prior transactions when their
    #: scenario row is generated, so the derived `user_transaction_count`
    #: feature becomes a near-perfect proxy for "this is the scenario row"
    #: — and scenario rows are the only rows that can carry a positive
    #: label. Measured in Phase 4, that single feature reached PR-AUC 0.80
    #: on its own purely as an artefact of generation.
    #:
    #: Varying history length breaks that proxy and is more realistic:
    #: real users have differing tenure.
    history_variation: float = 0.5
    #: Typical routine payment range in INR.
    routine_amount_range: tuple[float, float] = (150.0, 2500.0)
    #: Multiplier applied to a user's mean for "unusual amount".
    unusual_amount_multiplier: float = 12.0
    #: Multiplier for a legitimate-but-large payment (rent, fees, etc.).
    high_value_multiplier: float = 9.0
    #: Rapid-fire transactions in a velocity spike.
    velocity_burst: int = 6
    scenarios: tuple[Scenario, ...] = SCENARIOS
    start: datetime = field(
        default=datetime(2026, 1, 5, 9, 0, tzinfo=timezone.utc)
    )
    #: Window over which user timelines are staggered.
    #:
    #: This must be substantially LARGER than the span of one user's
    #: history, or every user's scenario row (the only row that can carry a
    #: positive label) lands at roughly the same point in the global
    #: timeline. That produces a dataset whose fraud rate climbs from 0% to
    #: >20% across the period, which makes the chronological split Phase 3
    #: mandates scientifically invalid: train ends up with almost no
    #: positives and test with a completely different class distribution.
    #:
    #: With the defaults, one user's history spans roughly 24 days, so a
    #: 150-day spread keeps the fraud rate broadly stationary over time —
    #: which is also how real fraud behaves.
    user_start_spread_days: int = 150


class SyntheticGenerator:
    """Generates canonical S40 transactions with scenario labels.

    Deterministic: the same `SyntheticConfig.seed` always yields an
    identical frame, which is what makes the scripted demo repeatable and
    the tests meaningful.
    """

    SOURCE = "s40_synthetic"

    def __init__(self, config: SyntheticConfig | None = None) -> None:
        self.config = config or SyntheticConfig()

    # -- helpers ---------------------------------------------------------

    def _rng(self) -> np.random.Generator:
        return np.random.default_rng(self.config.seed)

    def _user_id(self, index: int) -> str:
        name = _GIVEN_NAMES[index % len(_GIVEN_NAMES)]
        return f"SYNTH-USER-{index:04d}-{name}"

    @staticmethod
    def _recipient_id(user_index: int, slot: int) -> str:
        return f"SYNTH-UPI-{user_index:04d}-{slot:02d}@synthbank"

    @staticmethod
    def _device_id(user_index: int, slot: int) -> str:
        return f"SYNTH-DEVICE-{user_index:04d}-{slot:02d}"

    # -- generation ------------------------------------------------------

    def generate(self) -> pd.DataFrame:
        """Build the full synthetic dataset.

        Returns a canonical frame plus two extra columns:
          - `scenario`      the controlled scenario name
          - `is_history`    True for the baseline rows preceding a scenario
        Extra columns are additive; the canonical columns are unchanged, so
        the frame stays valid input for the shared validation/split code.
        """
        rng = self._rng()
        cfg = self.config
        rows: list[dict] = []

        for user_index in range(cfg.users):
            user = self._user_id(user_index)
            city = _CITIES[user_index % len(_CITIES)]
            scenario = cfg.scenarios[user_index % len(cfg.scenarios)]

            # Each user has a stable "home" device and a few known payees.
            home_device = self._device_id(user_index, 0)
            known_recipients = [self._recipient_id(user_index, s) for s in range(3)]

            # A per-user spending level, so "deviation" means something
            # different for each user rather than being globally fixed.
            base_mean = float(
                rng.uniform(cfg.routine_amount_range[0], cfg.routine_amount_range[1])
            )
            clock = cfg.start + timedelta(
                days=int(rng.integers(0, max(cfg.user_start_spread_days, 1)))
            )

            # Per-user history length. See SyntheticConfig.history_variation:
            # a fixed length turns user_transaction_count into a label proxy.
            # Floored at 6 so the User Risk Profile still warms past its
            # default min_history and deviation features stay meaningful.
            spread = int(round(cfg.history_per_user * cfg.history_variation))
            low = max(6, cfg.history_per_user - spread)
            high = max(low + 1, cfg.history_per_user + spread + 1)
            history_length = int(rng.integers(low, high))

            # Each user transacts within a narrow personal band of hours.
            # Without this every user looks active across the whole day, no
            # hour is characteristic, and time-of-day deviation degenerates
            # to ~1.0 for everyone — making the signal useless and the
            # UNUSUAL_TIME scenario indistinguishable from routine activity.
            active_start = int(rng.integers(8, 18))
            active_hours = tuple(range(active_start, min(active_start + 3, 24)))

            # Spec §38 Scenario F requires the legitimate high-value user to
            # have "user_has_history_of_large_transactions" — otherwise this
            # scenario is feature-identical to UNUSUAL_AMOUNT while carrying
            # the opposite label, which teaches a model that large amounts
            # are simply ambiguous. Giving this user occasional genuine large
            # payments is what makes the distinction learnable, and it is
            # precisely S40's thesis: size alone is not the signal,
            # inconsistency with the user's own history is.
            occasional_large = scenario is Scenario.LEGITIMATE_HIGH_VALUE

            # --- baseline history ---------------------------------------
            for history_index in range(history_length):
                clock += timedelta(hours=float(rng.uniform(6, 40)))
                clock = clock.replace(hour=int(rng.choice(active_hours)))
                amount = float(np.clip(rng.normal(base_mean, base_mean * 0.25), 20, None))
                if occasional_large and history_index % 5 == 4:
                    amount = float(
                        np.clip(
                            rng.normal(
                                base_mean * cfg.high_value_multiplier,
                                base_mean * cfg.high_value_multiplier * 0.15,
                            ),
                            20,
                            None,
                        )
                    )
                rows.append(
                    self._row(
                        user=user,
                        recipient=str(rng.choice(known_recipients)),
                        device=home_device,
                        amount=amount,
                        when=clock,
                        location=city,
                        label=0,
                        scenario=scenario,
                        is_history=True,
                    )
                )

            # --- scenario transaction(s) --------------------------------
            clock += timedelta(hours=float(rng.uniform(6, 30)))
            # Default the scenario row to one of the user's normal hours, so
            # that scenarios which are not *about* timing carry no accidental
            # time anomaly. UNUSUAL_TIME and the combination cases override it.
            clock = clock.replace(hour=int(rng.choice(active_hours)))
            rows.extend(
                self._scenario_rows(
                    scenario=scenario,
                    rng=rng,
                    user=user,
                    user_index=user_index,
                    city=city,
                    home_device=home_device,
                    known_recipients=known_recipients,
                    base_mean=base_mean,
                    clock=clock,
                )
            )

        frame = pd.DataFrame(rows)
        # Chronological order overall — the split utilities rely on a
        # meaningful ordering rather than row position.
        frame = frame.sort_values(C.TIMESTAMP.value, kind="stable").reset_index(drop=True)
        frame[C.SOURCE_ROW_ID.value] = [f"synth-{i}" for i in range(len(frame))]
        frame[C.TIME_INDEX.value] = range(len(frame))
        return self._finalize(frame)

    def _scenario_rows(
        self,
        *,
        scenario: Scenario,
        rng: np.random.Generator,
        user: str,
        user_index: int,
        city: str,
        home_device: str,
        known_recipients: list[str],
        base_mean: float,
        clock: datetime,
    ) -> list[dict]:
        cfg = self.config
        label = _SCENARIO_LABEL[scenario]
        known_recipient = str(rng.choice(known_recipients))
        new_recipient = self._recipient_id(user_index, 90)
        new_device = self._device_id(user_index, 90)
        routine_amount = float(np.clip(rng.normal(base_mean, base_mean * 0.2), 20, None))

        def row(**overrides) -> dict:
            base = dict(
                user=user,
                recipient=known_recipient,
                device=home_device,
                amount=routine_amount,
                when=clock,
                location=city,
                label=label,
                scenario=scenario,
                is_history=False,
            )
            base.update(overrides)
            return self._row(**base)

        if scenario is Scenario.LEGITIMATE_ROUTINE:
            return [row()]

        if scenario is Scenario.UNUSUAL_AMOUNT:
            return [row(amount=base_mean * cfg.unusual_amount_multiplier)]

        if scenario is Scenario.NEW_RECIPIENT:
            # A first-time payee alone is weak evidence — people pay new
            # people constantly. Labelled 0 on purpose.
            return [row(recipient=new_recipient)]

        if scenario is Scenario.NEW_DEVICE:
            return [row(device=new_device, amount=base_mean * 4.0)]

        if scenario is Scenario.UNUSUAL_TIME:
            # Odd hour, otherwise entirely normal. Also weak on its own.
            return [row(when=clock.replace(hour=3))]

        if scenario is Scenario.VELOCITY_SPIKE:
            burst = []
            moment = clock
            for _ in range(cfg.velocity_burst):
                moment += timedelta(minutes=float(rng.uniform(1, 4)))
                burst.append(row(when=moment, amount=base_mean * 1.5))
            return burst

        if scenario is Scenario.WEAK_SIGNAL_COMBINATION:
            # No single signal is damning; together they are. This is the
            # case that justifies having a fusion layer at all (spec §49).
            return [
                row(
                    recipient=new_recipient,
                    device=new_device,
                    when=clock.replace(hour=2),
                    amount=base_mean * 6.0,
                    location=_CITIES[(user_index + 3) % len(_CITIES)],
                )
            ]

        if scenario is Scenario.SOCIAL_ENGINEERING:
            # The transaction-side shadow of a voice-phishing call: a large
            # payment to a brand-new payee shortly after contact. The voice
            # signal itself lives in the voice pipeline, not here — the two
            # only meet at fusion (spec §26 Scenario 3).
            return [
                row(
                    recipient=new_recipient,
                    amount=base_mean * 10.0,
                    when=clock.replace(hour=int(rng.integers(19, 23))),
                )
            ]

        if scenario is Scenario.FALSE_POSITIVE:
            # Genuinely legitimate, but wearing several suspicious clothes:
            # new payee, new device, larger amount. Label 0. This is what
            # spec §26 Scenario 4 and the institution FP-review flow need.
            return [row(recipient=new_recipient, device=new_device, amount=base_mean * 5.0)]

        if scenario is Scenario.LEGITIMATE_HIGH_VALUE:
            # Spec §38 Scenario F: large, known payee, known device,
            # home city. Proves S40 is not "block expensive payments".
            return [row(amount=base_mean * cfg.high_value_multiplier)]

        raise ValueError(f"Unhandled scenario: {scenario}")

    def _row(
        self,
        *,
        user: str,
        recipient: str,
        device: str,
        amount: float,
        when: datetime,
        location: str,
        label: int,
        scenario: Scenario,
        is_history: bool,
    ) -> dict:
        return {
            C.SOURCE_DATASET.value: self.SOURCE,
            C.SOURCE_ROW_ID.value: pd.NA,  # assigned after sorting
            C.USER_ID.value: user,
            C.RECIPIENT_ID.value: recipient,
            C.DEVICE_ID.value: device,
            C.AMOUNT.value: round(float(amount), 2),
            C.TRANSACTION_TYPE.value: "UPI_P2P",
            C.TIMESTAMP.value: when.replace(tzinfo=None),
            C.TIME_INDEX.value: pd.NA,  # assigned after sorting
            C.SENDER_BALANCE_BEFORE.value: pd.NA,
            C.SENDER_BALANCE_AFTER.value: pd.NA,
            C.LOCATION.value: location,
            C.IS_FRAUD.value: label,
            "scenario": scenario.value,
            "is_history": is_history,
        }

    def _finalize(self, frame: pd.DataFrame) -> pd.DataFrame:
        for column in CANONICAL_COLUMNS:
            frame[column] = frame[column].astype(CANONICAL_DTYPES[column])
        frame["scenario"] = frame["scenario"].astype("string")
        frame["is_history"] = frame["is_history"].astype("boolean")
        return frame[list(CANONICAL_COLUMNS) + ["scenario", "is_history"]]
