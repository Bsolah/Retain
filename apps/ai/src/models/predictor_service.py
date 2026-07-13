"""Load active models and run inference for contracts."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from src.db import get_pool
from src.features.engineer import FeatureEngineer
from src.models.churn import ChurnPredictor
from src.models.registry import get_active_model, get_model_by_version
from src.models.storage import load_model_artifact

logger = logging.getLogger(__name__)

_predictor_cache: dict[str, ChurnPredictor] = {}


async def load_predictor(version: str | None = None) -> ChurnPredictor:
    pool = await get_pool()
    if version:
        record = await get_model_by_version(pool, version)
    else:
        record = await get_active_model(pool)

    if record is None:
        predictor = ChurnPredictor()
        predictor.is_baseline = True
        predictor.model_version = "baseline-untrained"
        return predictor

    cached = _predictor_cache.get(record["version"])
    if cached is not None:
        return cached

    with tempfile.TemporaryDirectory() as tmp:
        local_path = Path(tmp) / f"{record['version']}.joblib"
        load_model_artifact(record["path"], local_path)
        predictor = ChurnPredictor(local_path)

    _predictor_cache[record["version"]] = predictor
    return predictor


def clear_predictor_cache() -> None:
    _predictor_cache.clear()


async def predict_contract(contract_id: str) -> dict[str, Any]:
    pool = await get_pool()
    engineer = FeatureEngineer(pool)
    features = await engineer.generate_features(contract_id)
    predictor = await load_predictor()
    prediction = predictor.predict(features)
    await _persist_prediction(contract_id, prediction, features)
    return {
        "contract_id": contract_id,
        **prediction,
        "features": {
            key: features.get(key)
            for key in (
                "payment_failure_count_30d",
                "cadence_drift_days",
                "skip_count_90d",
                "tenure_days",
            )
        },
    }


async def predict_contracts(contract_ids: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for contract_id in contract_ids:
        try:
            results.append(await predict_contract(contract_id))
        except Exception as exc:
            logger.exception("Prediction failed for %s", contract_id)
            results.append({"contract_id": contract_id, "error": str(exc)})
    return results


async def get_latest_prediction(contract_id: str) -> dict[str, Any] | None:
    pool = await get_pool()
    query = """
        SELECT
            contract_id,
            predicted_churn_30d,
            model_version,
            calculated_at
        FROM subscriber_signals
        WHERE contract_id = $1
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, contract_id)
    if row is None or row["predicted_churn_30d"] is None:
        return None

    probability = float(row["predicted_churn_30d"])
    return {
        "contract_id": row["contract_id"],
        "churn_probability": probability,
        "risk_level": ChurnPredictor._get_risk_level(probability),
        "model_version": row["model_version"],
        "prediction_date": row["calculated_at"].isoformat()
        if row["calculated_at"]
        else None,
    }


async def _persist_prediction(
    contract_id: str,
    prediction: dict[str, Any],
    features: dict[str, Any],
) -> None:
    pool = await get_pool()
    engineer = FeatureEngineer(pool)
    await engineer.upsert_features(features)

    health = prediction["risk_level"]
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE subscriber_signals
            SET predicted_churn_30d = $2,
                predicted_churn_14d = $3,
                model_version = $4,
                calculated_at = NOW()
            WHERE contract_id = $1
            """,
            contract_id,
            prediction["churn_probability"],
            min(1.0, float(prediction["churn_probability"]) * 0.85),
            prediction["model_version"],
        )
        await conn.execute(
            """
            UPDATE subscription_contracts
            SET predicted_churn_30d = $2,
                predicted_churn_14d = $3,
                churn_risk_score = $2,
                health_status = $4::"HealthStatus"
            WHERE id = $1
            """,
            contract_id,
            prediction["churn_probability"],
            min(1.0, float(prediction["churn_probability"]) * 0.85),
            health,
        )
