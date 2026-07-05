"""Predictor service unit tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.churn import ChurnPredictor
from src.models import predictor_service


@pytest.mark.asyncio
async def test_load_predictor_returns_baseline_when_no_model() -> None:
    mock_pool = MagicMock()

    with (
        patch("src.models.predictor_service.get_pool", AsyncMock(return_value=mock_pool)),
        patch("src.models.predictor_service.get_active_model", AsyncMock(return_value=None)),
    ):
        predictor = await predictor_service.load_predictor()

    assert predictor.is_baseline is True
    assert predictor.model_version == "baseline-untrained"


@pytest.mark.asyncio
async def test_predict_contract_returns_prediction() -> None:
    mock_pool = MagicMock()
    features = {
        "payment_failure_count_30d": 0,
        "cadence_drift_days": 2,
        "skip_count_90d": 1,
        "tenure_days": 90,
        "churn_probability": 0.42,
    }
    mock_engineer = MagicMock()
    mock_engineer.generate_features = AsyncMock(return_value=features)

    mock_predictor = ChurnPredictor()
    prediction = mock_predictor.predict(features)

    with (
        patch("src.models.predictor_service.get_pool", AsyncMock(return_value=mock_pool)),
        patch("src.models.predictor_service.FeatureEngineer", return_value=mock_engineer),
        patch("src.models.predictor_service.load_predictor", AsyncMock(return_value=mock_predictor)),
        patch("src.models.predictor_service._persist_prediction", AsyncMock()),
    ):
        result = await predictor_service.predict_contract("contract-1")

    assert result["contract_id"] == "contract-1"
    assert "risk_level" in result
    assert result["features"]["tenure_days"] == 90


@pytest.mark.asyncio
async def test_predict_contracts_batch_handles_errors() -> None:
    async def side_effect(contract_id: str) -> dict:
        if contract_id == "bad":
            raise ValueError("not found")
        return {"contract_id": contract_id, "risk_level": "low"}

    with patch(
        "src.models.predictor_service.predict_contract",
        side_effect=side_effect,
    ):
        results = await predictor_service.predict_contracts(["good", "bad"])

    assert len(results) == 2
    assert results[0]["contract_id"] == "good"
    assert "error" in results[1]
