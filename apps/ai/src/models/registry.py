"""Persistence helpers for the model_registry table."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import asyncpg

_REGISTRY_COLUMNS = (
    "id, version, path, metrics, shop_id, is_active, "
    "rollout_percentage, created_at"
)


async def register_model(
    pool: asyncpg.Pool,
    *,
    version: str,
    path: str,
    metrics: dict[str, Any],
    shop_id: str | None = None,
    is_active: bool = False,
    rollout_percentage: int = 0,
) -> dict[str, Any]:
    query = f"""
        INSERT INTO model_registry (
            {_REGISTRY_COLUMNS}
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        RETURNING {_REGISTRY_COLUMNS}
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            query,
            str(uuid4()),
            version,
            path,
            json.dumps(metrics, default=str),
            shop_id,
            is_active,
            rollout_percentage,
            datetime.now(timezone.utc),
        )
    return _row_to_dict(row)


async def get_model_by_version(
    pool: asyncpg.Pool,
    version: str,
) -> dict[str, Any] | None:
    query = f"""
        SELECT {_REGISTRY_COLUMNS}
        FROM model_registry
        WHERE version = $1
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, version)
    return _row_to_dict(row) if row else None


async def get_active_model(
    pool: asyncpg.Pool,
    shop_id: str | None = None,
) -> dict[str, Any] | None:
    query = f"""
        SELECT {_REGISTRY_COLUMNS}
        FROM model_registry
        WHERE is_active = true
          AND ($1::text IS NULL OR shop_id IS NULL OR shop_id = $1)
        ORDER BY
          CASE WHEN shop_id = $1 THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, shop_id)
    return _row_to_dict(row) if row else None


async def deploy_model(
    pool: asyncpg.Pool,
    version: str,
    rollout_percentage: int = 100,
    shop_id: str | None = None,
) -> dict[str, Any]:
    if rollout_percentage < 0 or rollout_percentage > 100:
        raise ValueError("rollout_percentage must be between 0 and 100")

    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                "SELECT id FROM model_registry WHERE version = $1",
                version,
            )
            if existing is None:
                raise ValueError(f"Model version not found: {version}")

            await conn.execute(
                """
                UPDATE model_registry
                SET is_active = false, rollout_percentage = 0
                WHERE is_active = true
                  AND (
                    ($1::text IS NULL AND shop_id IS NULL)
                    OR shop_id = $1
                  )
                """,
                shop_id,
            )
            row = await conn.fetchrow(
                f"""
                UPDATE model_registry
                SET is_active = true, rollout_percentage = $2
                WHERE version = $1
                RETURNING {_REGISTRY_COLUMNS}
                """,
                version,
                rollout_percentage,
            )
    return _row_to_dict(row)


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    payload = dict(row)
    metrics = payload.get("metrics")
    if isinstance(metrics, str):
        payload["metrics"] = json.loads(metrics)
    created_at = payload.get("created_at")
    if isinstance(created_at, datetime):
        payload["created_at"] = created_at.isoformat()
    return payload
