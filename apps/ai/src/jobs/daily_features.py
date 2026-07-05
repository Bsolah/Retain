"""Daily batch job: generate and upsert churn features for all shops."""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timezone
from typing import Any

from src.db import get_pool
from src.features.engineer import ACTIVE_STATUSES, FeatureEngineer

logger = logging.getLogger(__name__)


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


async def run_shop_feature_job(
    shop_id: str,
    as_of_date: date | datetime | None = None,
) -> dict[str, Any]:
    engineer = FeatureEngineer(await get_pool())
    started = time.perf_counter()
    errors: list[dict[str, str]] = []
    upserted = 0

    as_of = as_of_date
    contract_ids = await engineer.list_active_contract_ids(shop_id)
    for contract_id in contract_ids:
        try:
            features = await engineer.generate_features(contract_id, as_of)
            await engineer.upsert_features(features)
            upserted += 1
        except Exception as exc:
            logger.exception(
                "Feature job failed for contract %s in shop %s",
                contract_id,
                shop_id,
            )
            errors.append({"contract_id": contract_id, "error": str(exc)})

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    result = {
        "shop_id": shop_id,
        "contract_count": len(contract_ids),
        "upserted": upserted,
        "error_count": len(errors),
        "errors": errors,
        "processing_time_ms": elapsed_ms,
    }
    logger.info(
        "Shop feature job complete shop_id=%s contracts=%s upserted=%s errors=%s ms=%s",
        shop_id,
        len(contract_ids),
        upserted,
        len(errors),
        elapsed_ms,
    )
    return result


async def run_daily_feature_job(
    as_of_date: date | datetime | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    shop_ids = await _shops_with_active_contracts()
    shop_results: list[dict[str, Any]] = []

    for shop_id in shop_ids:
        try:
            shop_results.append(await run_shop_feature_job(shop_id, as_of_date))
        except Exception as exc:
            logger.exception("Feature job failed for shop %s", shop_id)
            shop_results.append(
                {
                    "shop_id": shop_id,
                    "contract_count": 0,
                    "upserted": 0,
                    "error_count": 1,
                    "errors": [{"contract_id": "*", "error": str(exc)}],
                    "processing_time_ms": 0,
                }
            )

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    summary = {
        "shops_processed": len(shop_ids),
        "contracts_upserted": sum(item["upserted"] for item in shop_results),
        "processing_time_ms": elapsed_ms,
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "shops": shop_results,
    }
    logger.info(
        "Daily feature job complete shops=%s upserted=%s ms=%s",
        summary["shops_processed"],
        summary["contracts_upserted"],
        elapsed_ms,
    )
    return summary
