"""Training pipeline for churn prediction models."""

from __future__ import annotations

import logging
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.db import get_pool
from src.features.engineer import FeatureEngineer
from src.models.churn import FEATURE_COLUMNS, ChurnPredictor
from src.models.registry import deploy_model, register_model
from src.models.storage import save_model_artifact

logger = logging.getLogger(__name__)

MIN_PRECISION = 0.65
MIN_RECALL = 0.55
MIN_AUC = 0.70


async def extract_training_data(
    shop_id: str | None = None,
    retrain_all: bool = False,
) -> pd.DataFrame:
    """Load labeled contracts for churn training.

    Cohort: contracts created 60–120 days ago (or all fully-labeled history
    when ``retrain_all`` is true). Label ``churned_30d`` is 1 when the
    contract was cancelled within 90 days of creation.
    """
    pool = await get_pool()
    now = datetime.now(timezone.utc)

    if retrain_all:
        # Fully observed labels only (age >= 90 days).
        upper = now - timedelta(days=90)
        lower = now - timedelta(days=3650)
    else:
        upper = now - timedelta(days=60)
        lower = now - timedelta(days=120)

    query = """
        SELECT
            id AS contract_id,
            shop_id,
            created_at,
            cancelled_at,
            status,
            CASE
                WHEN cancelled_at IS NOT NULL
                     AND cancelled_at <= created_at + INTERVAL '90 days'
                THEN 1
                ELSE 0
            END AS churned_30d
        FROM subscription_contracts
        WHERE created_at <= $1
          AND created_at >= $2
          AND ($3::text IS NULL OR shop_id = $3)
        ORDER BY created_at ASC
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, upper, lower, shop_id)

    if not rows:
        return pd.DataFrame(columns=["contract_id", "shop_id", "churned_30d"])

    return pd.DataFrame([dict(row) for row in rows])


async def _engineer_training_features(labels: pd.DataFrame) -> pd.DataFrame:
    pool = await get_pool()
    engineer = FeatureEngineer(pool)
    feature_rows: list[dict[str, Any]] = []

    for row in labels.itertuples(index=False):
        contract_id = row.contract_id
        created_at = row.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        # Features as of day 60 — start of the 30-day prediction window.
        as_of = (created_at + timedelta(days=60)).date()
        try:
            features = await engineer.generate_features(contract_id, as_of)
            features["churned_30d"] = int(row.churned_30d)
            feature_rows.append(features)
        except Exception:
            logger.exception(
                "Failed to engineer training features for %s",
                contract_id,
            )

    if not feature_rows:
        return pd.DataFrame(columns=[*FEATURE_COLUMNS, "churned_30d"])
    return pd.DataFrame(feature_rows)


def _validate_metrics(metrics: dict[str, Any], *, is_baseline: bool) -> None:
    if is_baseline:
        logger.warning(
            "Baseline model trained (insufficient samples); skipping XGBoost gates"
        )
        return

    precision = float(metrics.get("precision") or 0)
    recall = float(metrics.get("recall") or 0)
    auc = float(metrics.get("auc") or 0)
    failures: list[str] = []
    if precision < MIN_PRECISION:
        failures.append(f"precision {precision:.3f} < {MIN_PRECISION}")
    if recall < MIN_RECALL:
        failures.append(f"recall {recall:.3f} < {MIN_RECALL}")
    if auc < MIN_AUC:
        failures.append(f"auc {auc:.3f} < {MIN_AUC}")
    if failures:
        raise ValueError("Model failed validation: " + "; ".join(failures))


async def run_training(
    shop_id: str | None = None,
    retrain_all: bool = False,
    deploy: bool = True,
    rollout_percentage: int = 100,
) -> dict[str, Any]:
    labels = await extract_training_data(shop_id=shop_id, retrain_all=retrain_all)
    if labels.empty:
        raise ValueError("No training contracts found for the requested window")

    training_df = await _engineer_training_features(labels)
    if training_df.empty:
        raise ValueError("Feature engineering produced no training rows")

    predictor = ChurnPredictor()
    metrics = predictor.train(training_df, target_col="churned_30d")
    _validate_metrics(metrics, is_baseline=predictor.is_baseline)

    version = predictor.model_version
    with tempfile.TemporaryDirectory() as tmp:
        local_path = Path(tmp) / f"{version}.joblib"
        predictor.save(local_path)
        artifact_path = save_model_artifact(local_path, version)

    pool = await get_pool()
    registry_row = await register_model(
        pool,
        version=version,
        path=artifact_path,
        metrics=metrics,
        shop_id=shop_id,
        is_active=False,
        rollout_percentage=0,
    )

    deployed = None
    if deploy:
        deployed = await deploy_model(
            pool,
            version=version,
            rollout_percentage=rollout_percentage,
            shop_id=shop_id,
        )

    result = {
        "version": version,
        "path": artifact_path,
        "metrics": metrics,
        "is_baseline": predictor.is_baseline,
        "registry": registry_row,
        "deployed": deployed,
        "training_rows": int(len(training_df)),
    }
    logger.info(
        "Training complete version=%s baseline=%s samples=%s",
        version,
        predictor.is_baseline,
        len(training_df),
    )
    return result
