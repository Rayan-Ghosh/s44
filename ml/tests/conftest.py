"""Shared fixtures for the ML/data test suite.

Tests use only the tiny hand-authored fixtures in ml/tests/fixtures — never
a downloaded dataset. See that directory's README for why.
"""

from __future__ import annotations

from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def paysim_path() -> Path:
    return FIXTURES / "paysim_sample.csv"


@pytest.fixture
def ieee_cis_path() -> Path:
    return FIXTURES / "ieee_cis_sample.csv"


@pytest.fixture
def credit_card_path() -> Path:
    return FIXTURES / "credit_card_sample.csv"


@pytest.fixture
def teleantifraud_path() -> Path:
    return FIXTURES / "teleantifraud_sample.jsonl"
