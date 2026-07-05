from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    enable_scheduler: bool = True
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



@lru_cache
def get_settings() -> Settings:
    return Settings()
