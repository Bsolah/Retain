"""Daily AI pipeline: features → score → intervene for all shops."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from src.db import get_pool
from src.features.engineer import ACTIVE_STATUSES
from src.interventions.engine import InterventionEngine
from src.jobs.daily_features import run_shop_feature_job
from src.models.predictor_service import predict_contracts
from src.redis_client import get_redis

logger = logging.getLogger(__name__)

PIPELINE_LAST_KEY = "ai:pipeline:last"


async def _shops_with_active_contracts() -> list[str]:
    pool = await get_pool()
    query = """
        SELECT DISTINCT shop_id
        FROM subscription_contracts
        WHERE status = ANY($1::text[])
        ORDER BY shop_id
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, list(ACTIVE_STATUSES))
    return [row["shop_id"] for row in rows]


async def _active_contract_ids(shop_id: str) -> list[str]:
    pool = await get_pool()
    query = """
        SELECT id
        FROM subscription_contracts
        WHERE shop_id = $1
          AND status = ANY($2::text[])
        ORDER BY created_at ASC
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, shop_id, list(ACTIVE_STATUSES))
    return [row["id"] for row in rows]


async def save_pipeline_last_run(summary: dict[str, Any]) -> None:
    try:
        redis = await get_redis()
        await redis.set(
            PIPELINE_LAST_KEY,
            json.dumps(summary, default=str),
            ex=7 * 24 * 3600,
        )
    except Exception:
        logger.exception("Failed to persist pipeline last-run summary to Redis")


async def load_pipeline_last_run() -> dict[str, Any] | None:
    try:
        redis = await get_redis()
        raw = await redis.get(PIPELINE_LAST_KEY)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        logger.exception("Failed to load pipeline last-run summary")
        return None


async def run_shop_pipeline(shop_id: str) -> dict[str, Any]:
    started = time.perf_counter()
    features = await run_shop_feature_job(shop_id)

    contract_ids = await _active_contract_ids(shop_id)
    predictions = await predict_contracts(contract_ids) if contract_ids else []
    scored = sum(1 for item in predictions if "error" not in item)

    engine = InterventionEngine(await get_pool())
    interventions = await engine.evaluate_batch(shop_id)

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    result = {
        "shop_id": shop_id,
        "features": features,
        "contracts_scored": scored,
        "predictions_count": len(predictions),
        "interventions": {
            "evaluated": interventions.get("evaluated", 0),
            "intervened": interventions.get("intervened", 0),
        },
        "processing_time_ms": elapsed_ms,
        "ran_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info(
        "Shop pipeline complete shop_id=%s scored=%s intervened=%s ms=%s",
        shop_id,
        scored,
        interventions.get("intervened", 0),
        elapsed_ms,
    )
    return result


async def run_daily_pipeline() -> dict[str, Any]:
    started = time.perf_counter()
    shop_ids = await _shops_with_active_contracts()
    shop_results: list[dict[str, Any]] = []
    total_scored = 0
    total_intervened = 0

    for shop_id in shop_ids:
        try:
            result = await run_shop_pipeline(shop_id)
            shop_results.append(result)
            total_scored += int(result.get("contracts_scored") or 0)
            total_intervened += int(
                (result.get("interventions") or {}).get("intervened") or 0
            )
        except Exception as exc:
            logger.exception("Daily pipeline failed for shop %s", shop_id)
            shop_results.append(
                {
                    "shop_id": shop_id,
                    "error": str(exc),
                    "contracts_scored": 0,
                    "interventions": {"evaluated": 0, "intervened": 0},
                }
            )

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    summary = {
        "shops_processed": len(shop_ids),
        "contracts_scored": total_scored,
        "interventions_created": total_intervened,
        "processing_time_ms": elapsed_ms,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "shops": shop_results,
    }
    await save_pipeline_last_run(summary)
    logger.info(
        "Daily pipeline complete shops=%s scored=%s intervened=%s ms=%s",
        summary["shops_processed"],
        total_scored,
        total_intervened,
        elapsed_ms,
    )
    return summary
