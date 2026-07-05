"""Tests for intervention engine orchestration."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.interventions.engine import InterventionEngine, MAX_INTERVENTIONS_30D


@pytest.fixture
def mock_pool() -> MagicMock:
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__.return_value = conn
    return pool


def _context(
    *,
    auto_enabled: bool = True,
    churn_probability: float = 0.85,
) -> dict:
    return {
        "contract": {
            "id": "contract-1",
            "shop_id": "shop-1",
            "customer_id": "cust-1",
            "status": "active",
            "currency_code": "USD",
            "total_revenue": 120.0,
        },
        "shop": {
            "id": "shop-1",
            "settings": {"auto_interventions_enabled": auto_enabled},
        },
        "customer": {
            "id": "cust-1",
            "email": "test@example.com",
            "first_name": "Test",
            "lifetime_value": 200.0,
        },
        "signals": {
            "churn_probability": churn_probability,
            "payment_failure_count_30d": 0,
            "skip_count_90d": 0,
        },
    }


@pytest.mark.asyncio
async def test_skips_when_auto_interventions_disabled(mock_pool: MagicMock) -> None:
    engine = InterventionEngine(mock_pool)
    ctx = _context(auto_enabled=False)

    with patch.object(engine, "_load_context", AsyncMock(return_value=ctx)):
        result = await engine.evaluate_and_intervene(
            "contract-1",
            {"churn_probability": 0.9},
        )

    assert result["action"] == "skipped"
    assert result["reason"] == "auto_interventions_disabled"


@pytest.mark.asyncio
async def test_skips_when_rate_limited(mock_pool: MagicMock) -> None:
    engine = InterventionEngine(mock_pool)
    ctx = _context()

    with (
        patch.object(engine, "_load_context", AsyncMock(return_value=ctx)),
        patch.object(engine, "_has_pending_intervention", AsyncMock(return_value=False)),
        patch.object(
            engine,
            "_intervention_count_30d",
            AsyncMock(return_value=MAX_INTERVENTIONS_30D),
        ),
    ):
        result = await engine.evaluate_and_intervene(
            "contract-1",
            {"churn_probability": 0.9},
        )

    assert result["action"] == "skipped"
    assert result["reason"] == "rate_limited"


@pytest.mark.asyncio
async def test_skips_when_no_intervention_needed(mock_pool: MagicMock) -> None:
    engine = InterventionEngine(mock_pool)
    ctx = _context(churn_probability=0.1)

    with (
        patch.object(engine, "_load_context", AsyncMock(return_value=ctx)),
        patch.object(engine, "_has_pending_intervention", AsyncMock(return_value=False)),
        patch.object(engine, "_intervention_count_30d", AsyncMock(return_value=0)),
    ):
        result = await engine.evaluate_and_intervene(
            "contract-1",
            {"churn_probability": 0.1},
        )

    assert result["action"] == "skipped"
    assert result["reason"] == "no_intervention_needed"


@pytest.mark.asyncio
async def test_creates_intervention_for_high_churn(mock_pool: MagicMock) -> None:
    engine = InterventionEngine(mock_pool)
    ctx = _context(churn_probability=0.85)

    with (
        patch.object(engine, "_load_context", AsyncMock(return_value=ctx)),
        patch.object(engine, "_has_pending_intervention", AsyncMock(return_value=False)),
        patch.object(engine, "_intervention_count_30d", AsyncMock(return_value=0)),
        patch.object(
            engine,
            "_execute_intervention",
            AsyncMock(return_value={"id": "int-1", "type": "discount_offer"}),
        ),
    ):
        result = await engine.evaluate_and_intervene(
            "contract-1",
            {"churn_probability": 0.85},
        )

    assert result["action"] == "intervened"
    assert result["intervention"]["id"] == "int-1"
