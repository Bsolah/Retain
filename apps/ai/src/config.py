from __future__ import annotations

import logging
import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_DEFAULT_REDIS_URL = "redis://localhost:6380"
_DEFAULT_DATABASE_URL = "postgresql://retain:retain@localhost:5433/retain"


def _resolve_railway_env() -> None:
    """Map Railway reference vars before Settings loads."""
    if not os.getenv("REDIS_URL", "").strip():
        for key in ("REDIS_PRIVATE_URL", "REDIS_PUBLIC_URL"):
            value = os.getenv(key, "").strip()
            if value:
                os.environ["REDIS_URL"] = value
                break

    if not os.getenv("DATABASE_URL", "").strip():
        for key in ("DATABASE_PRIVATE_URL", "DATABASE_PUBLIC_URL"):
            value = os.getenv(key, "").strip()
            if value:
                os.environ["DATABASE_URL"] = value
                break


_resolve_railway_env()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    port: int = 8000
    host: str = "0.0.0.0"
    environment: str = "development"
    database_url: str = _DEFAULT_DATABASE_URL
    redis_url: str = _DEFAULT_REDIS_URL
    feature_model_version: str = "features-v1"
    enable_scheduler: bool = False
    # Use s3://models/churn in production; local path works without AWS.
    models_uri_prefix: str = "models/churn"
    aws_region: str = "us-east-1"
    aws_endpoint_url: str = ""
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@retain.app"
    sendgrid_from_name: str = "Retain"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    payment_update_url: str = "https://shopify.com/account"

    @field_validator("redis_url", mode="before")
    @classmethod
    def coerce_redis_url(cls, value: object) -> str:
        # Never crash process startup over Redis — /health must stay reachable.
        if value is None:
            return _DEFAULT_REDIS_URL
        text = str(value).strip().strip("'\"")
        if not text:
            return _DEFAULT_REDIS_URL
        if not text.startswith(("redis://", "rediss://")):
            logger.warning(
                "Ignoring invalid REDIS_URL %r; using default for process start",
                text[:48],
            )
            return _DEFAULT_REDIS_URL
        return text

    @field_validator("database_url", mode="before")
    @classmethod
    def coerce_database_url(cls, value: object) -> str:
        if value is None:
            return _DEFAULT_DATABASE_URL
        text = str(value).strip().strip("'\"")
        return text or _DEFAULT_DATABASE_URL


@lru_cache
def get_settings() -> Settings:
    return Settings()
