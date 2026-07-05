from __future__ import annotations

from redis.asyncio import Redis

from src.config import get_settings

_redis: Redis | None = None


async def init_redis() -> Redis:
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def get_redis() -> Redis:
    return await init_redis()


async def check_redis() -> bool:
    client = await get_redis()
    return bool(await client.ping())
