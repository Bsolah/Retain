from __future__ import annotations

import asyncpg

from src.config import get_settings

_pool: asyncpg.Pool | None = None


def _normalize_dsn(url: str) -> str:
    """asyncpg accepts postgresql://; strip Prisma-only query params."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if "?" in url:
        base, query = url.split("?", 1)
        parts = [
            part
            for part in query.split("&")
            if not part.startswith("schema=")
            and not part.startswith("connection_limit=")
        ]
        return f"{base}?{'&'.join(parts)}" if parts else base
    return url


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            dsn=_normalize_dsn(settings.database_url),
            min_size=1,
            max_size=10,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_pool() -> asyncpg.Pool:
    return await init_pool()


async def check_db() -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        value = await conn.fetchval("SELECT 1")
        return value == 1
