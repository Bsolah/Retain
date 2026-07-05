"""Outbound delivery channels (SendGrid email, Twilio SMS)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)


async def send_email(
    *,
    to_email: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.sendgrid_api_key or not to_email:
        logger.info("Email dry-run to=%s subject=%s", to_email, subject)
        return {"channel": "email", "status": "dry_run", "to": to_email}

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {
            "email": settings.sendgrid_from_email,
            "name": settings.sendgrid_from_name,
        },
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "authorization": f"Bearer {settings.sendgrid_api_key}",
                "content-type": "application/json",
            },
            json=payload,
        )
    if response.status_code >= 400:
        logger.error(
            "SendGrid error status=%s body=%s",
            response.status_code,
            response.text,
        )
        return {
            "channel": "email",
            "status": "failed",
            "to": to_email,
            "error": response.text,
        }
    return {"channel": "email", "status": "sent", "to": to_email}


async def send_sms(*, to_phone: str | None, body: str) -> dict[str, Any]:
    settings = get_settings()
    if (
        not settings.twilio_account_sid
        or not settings.twilio_auth_token
        or not settings.twilio_from_number
        or not to_phone
    ):
        logger.info("SMS dry-run to=%s", to_phone)
        return {"channel": "sms", "status": "dry_run", "to": to_phone}

    url = (
        f"https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.twilio_account_sid}/Messages.json"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            url,
            data={
                "To": to_phone,
                "From": settings.twilio_from_number,
                "Body": body,
            },
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
        )
    if response.status_code >= 400:
        logger.error(
            "Twilio error status=%s body=%s",
            response.status_code,
            response.text,
        )
        return {
            "channel": "sms",
            "status": "failed",
            "to": to_phone,
            "error": response.text,
        }
    return {"channel": "sms", "status": "sent", "to": to_phone}
