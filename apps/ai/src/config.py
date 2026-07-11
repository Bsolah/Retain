from __future__ import annotations

import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    database_url: str = "postgresql://retain:retain@localhost:5433/retain"
    redis_url: str = "redis://localhost:6380"
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

    @field_validator("redis_url")
    @classmethod
    def validate_redis_url(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed.startswith(("redis://", "rediss://")):
            raise ValueError("REDIS_URL must start with redis:// or rediss://")
        return trimmed


@lru_cache
def get_settings() -> Settings:
    return Settings()
