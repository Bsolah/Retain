"""Integration tests for AI HTTP API."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch


def test_train_model_endpoint(client) -> None:
    mock_result = {
        "version": "churn-v1",
        "metrics": {"auc": 0.82},
        "deployed": True,
    }

    with patch(
        "src.main.run_training",
        AsyncMock(return_value=mock_result),
    ):
        response = client.post(
            "/models/train",
            json={"shop_id": "shop-1", "retrain_all": False, "deploy": True},
        )

    assert response.status_code == 200
    assert response.json()["version"] == "churn-v1"


def test_get_prediction_endpoint(client) -> None:
    mock_prediction = {
        "contract_id": "contract-1",
        "churn_probability": 0.72,
        "risk_level": "high",
        "model_version": "baseline-untrained",
    }

    with patch(
        "src.main.get_latest_prediction",
        AsyncMock(return_value=None),
    ), patch(
        "src.main.predict_contract",
        AsyncMock(return_value=mock_prediction),
    ):
        response = client.get("/predictions/contract-1")

    assert response.status_code == 200
    assert response.json()["risk_level"] == "high"


def test_batch_predictions_endpoint(client) -> None:
    mock_batch = [
        {"contract_id": "c1", "risk_level": "low"},
        {"contract_id": "c2", "risk_level": "medium"},
    ]

    with patch(
        "src.main.predict_contracts",
        AsyncMock(return_value=mock_batch),
    ):
        response = client.post(
            "/predictions/batch",
            json={"contract_ids": ["c1", "c2"]},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert len(body["predictions"]) == 2


def test_evaluate_intervention_endpoint(client) -> None:
    mock_result = {
        "contract_id": "contract-1",
        "action": "intervened",
        "intervention_id": "int-1",
    }

    with patch(
        "src.main.get_pool",
        AsyncMock(return_value=object()),
    ), patch(
        "src.main.InterventionEngine"
    ) as engine_cls:
        engine_cls.return_value.evaluate_and_intervene = AsyncMock(
            return_value=mock_result,
        )
        response = client.post(
            "/interventions/evaluate",
            json={
                "contract_id": "contract-1",
                "prediction": {"churn_probability": 0.85},
            },
        )

    assert response.status_code == 200
    assert response.json()["action"] == "intervened"
