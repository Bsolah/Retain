"""Feature engineering for churn prediction signals."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

import asyncpg
import pandas as pd

from src.config import get_settings
from src.features.calculations import (
    ContractFeatureInput,
    as_date,
    build_feature_dict,
    ensure_utc,
)

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("active", "paused", "payment_failed")


class FeatureEngineer:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool
        self.model_version = get_settings().feature_model_version

    async def generate_features(
        self,
        contract_id: str,
        as_of_date: date | datetime | None = None,
    ) -> dict[str, Any]:
        as_of = as_date(as_of_date, default=datetime.now(timezone.utc).date())
        context = await self._load_contract_context(contract_id)
        if context is None:
            raise ValueError(f"Contract not found: {contract_id}")
        return build_feature_dict(context, as_of)

    async def list_active_contract_ids(self, shop_id: str) -> list[str]:
        return await self._active_contract_ids(shop_id)

    async def generate_batch_features(
        self,
        shop_id: str,
        as_of_date: date | datetime | None = None,
    ) -> pd.DataFrame:
        as_of = as_date(as_of_date, default=datetime.now(timezone.utc).date())
        contract_ids = await self.list_active_contract_ids(shop_id)
        rows: list[dict[str, Any]] = []
        for contract_id in contract_ids:
            try:
                features = await self.generate_features(contract_id, as_of)
                rows.append(features)
            except Exception:
                logger.exception(
                    "Failed to generate features for contract %s",
                    contract_id,
                )
        if not rows:
            return pd.DataFrame()
        return pd.DataFrame(rows)

    async def upsert_features(self, features: dict[str, Any]) -> str:
        """Upsert a feature vector into subscriber_signals (unique on contract_id)."""
        contract_id = features["contract_id"]
        calculated_at = datetime.now(timezone.utc)
        signal_id = str(uuid4())

        query = """
            INSERT INTO subscriber_signals (
                id,
                contract_id,
                days_since_last_engagement,
                portal_login_count_30d,
                product_swap_count_30d,
                skip_count_90d,
                pause_count_lifetime,
                cadence_drift_days,
                avg_order_value,
                order_frequency_days,
                payment_failure_count_30d,
                payment_failure_count_90d,
                days_since_last_payment_failure,
                support_ticket_count_30d,
                support_ticket_sentiment,
                email_open_rate_30d,
                email_click_rate_30d,
                sms_opt_out,
                tenure_days,
                total_revenue,
                subscription_count,
                feature_vector,
                model_version,
                calculated_at,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22::jsonb, $23, $24, $24
            )
            ON CONFLICT (contract_id) DO UPDATE SET
                days_since_last_engagement = EXCLUDED.days_since_last_engagement,
                portal_login_count_30d = EXCLUDED.portal_login_count_30d,
                product_swap_count_30d = EXCLUDED.product_swap_count_30d,
                skip_count_90d = EXCLUDED.skip_count_90d,
                pause_count_lifetime = EXCLUDED.pause_count_lifetime,
                cadence_drift_days = EXCLUDED.cadence_drift_days,
                avg_order_value = EXCLUDED.avg_order_value,
                order_frequency_days = EXCLUDED.order_frequency_days,
                payment_failure_count_30d = EXCLUDED.payment_failure_count_30d,
                payment_failure_count_90d = EXCLUDED.payment_failure_count_90d,
                days_since_last_payment_failure =
                    EXCLUDED.days_since_last_payment_failure,
                support_ticket_count_30d = EXCLUDED.support_ticket_count_30d,
                support_ticket_sentiment = EXCLUDED.support_ticket_sentiment,
                email_open_rate_30d = EXCLUDED.email_open_rate_30d,
                email_click_rate_30d = EXCLUDED.email_click_rate_30d,
                sms_opt_out = EXCLUDED.sms_opt_out,
                tenure_days = EXCLUDED.tenure_days,
                total_revenue = EXCLUDED.total_revenue,
                subscription_count = EXCLUDED.subscription_count,
                feature_vector = EXCLUDED.feature_vector,
                model_version = EXCLUDED.model_version,
                calculated_at = EXCLUDED.calculated_at
            RETURNING id
        """

        async with self.pool.acquire() as conn:
            row_id = await conn.fetchval(
                query,
                signal_id,
                contract_id,
                features.get("days_since_last_engagement"),
                int(features.get("portal_login_count_30d") or 0),
                int(features.get("product_swap_count_30d") or 0),
                int(features.get("skip_count_90d") or 0),
                int(features.get("pause_count_lifetime") or 0),
                features.get("cadence_drift_days"),
                features.get("avg_order_value"),
                features.get("order_frequency_days"),
                int(features.get("payment_failure_count_30d") or 0),
                int(features.get("payment_failure_count_90d") or 0),
                features.get("days_since_last_payment_failure"),
                int(features.get("support_ticket_count_30d") or 0),
                features.get("support_ticket_sentiment"),
                features.get("email_open_rate_30d"),
                features.get("email_click_rate_30d"),
                bool(features.get("sms_opt_out")),
                int(features.get("tenure_days") or 0),
                float(features.get("total_revenue") or 0),
                int(features.get("subscription_count") or 1),
                json.dumps(features, default=str),
                self.model_version,
                calculated_at,
            )
        return str(row_id)

    async def get_latest_signals(self, contract_id: str) -> dict[str, Any] | None:
        query = """
            SELECT
                id,
                contract_id,
                days_since_last_engagement,
                portal_login_count_30d,
                product_swap_count_30d,
                skip_count_90d,
                pause_count_lifetime,
                cadence_drift_days,
                avg_order_value,
                order_frequency_days,
                payment_failure_count_30d,
                payment_failure_count_90d,
                days_since_last_payment_failure,
                support_ticket_count_30d,
                support_ticket_sentiment,
                email_open_rate_30d,
                email_click_rate_30d,
                sms_opt_out,
                tenure_days,
                total_revenue,
                subscription_count,
                feature_vector,
                predicted_churn_14d,
                predicted_churn_30d,
                model_version,
                calculated_at,
                created_at
            FROM subscriber_signals
            WHERE contract_id = $1
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, contract_id)
        if row is None:
            return None
        payload = dict(row)
        for key in ("avg_order_value", "total_revenue"):
            if payload.get(key) is not None:
                payload[key] = float(payload[key])
        feature_vector = payload.get("feature_vector")
        if isinstance(feature_vector, str):
            payload["feature_vector"] = json.loads(feature_vector)
        for key in ("calculated_at", "created_at"):
            value = payload.get(key)
            if isinstance(value, datetime):
                payload[key] = ensure_utc(value).isoformat()
        return payload

    async def _active_contract_ids(self, shop_id: str) -> list[str]:
        query = """
            SELECT id
            FROM subscription_contracts
            WHERE shop_id = $1
              AND status = ANY($2::text[])
            ORDER BY created_at ASC
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, shop_id, list(ACTIVE_STATUSES))
        return [row["id"] for row in rows]

    async def _load_contract_context(
        self,
        contract_id: str,
    ) -> ContractFeatureInput | None:
        contract_query = """
            SELECT
                c.id,
                c.shop_id,
                c.customer_id,
                c.created_at,
                c.billing_policy,
                c.line_items,
                cust.sms_consent,
                (
                    SELECT COUNT(*)::int
                    FROM subscription_contracts sc
                    WHERE sc.customer_id = c.customer_id
                ) AS subscription_count
            FROM subscription_contracts c
            JOIN customers cust ON cust.id = c.customer_id
            WHERE c.id = $1
        """
        orders_query = """
            SELECT id, total_price, created_at, status
            FROM subscription_orders
            WHERE contract_id = $1
            ORDER BY created_at ASC
        """
        events_query = """
            SELECT event_type, event_subtype, payload, created_at
            FROM events
            WHERE contract_id = $1
            ORDER BY created_at ASC
        """
        interventions_query = """
            SELECT status, sent_at, responded_at, created_at
            FROM interventions
            WHERE contract_id = $1
        """
        cohort_query = """
            SELECT
                COUNT(*)::int AS cohort_size,
                COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cohort_cancelled
            FROM subscription_contracts
            WHERE shop_id = $1
              AND date_trunc('month', created_at) = date_trunc('month', $2::timestamptz)
        """

        async with self.pool.acquire() as conn:
            contract = await conn.fetchrow(contract_query, contract_id)
            if contract is None:
                return None

            orders = await conn.fetch(orders_query, contract_id)
            events = await conn.fetch(events_query, contract_id)
            interventions = await conn.fetch(interventions_query, contract_id)
            cohort = await conn.fetchrow(
                cohort_query,
                contract["shop_id"],
                ensure_utc(contract["created_at"]),
            )

        billing_policy = contract["billing_policy"]
        if isinstance(billing_policy, str):
            billing_policy = json.loads(billing_policy)
        if not isinstance(billing_policy, dict):
            billing_policy = {}

        line_items = contract["line_items"]
        if isinstance(line_items, str):
            line_items = json.loads(line_items)
        if not isinstance(line_items, list):
            line_items = []

        event_rows: list[dict[str, Any]] = []
        for event in events:
            payload = event["payload"]
            if isinstance(payload, str):
                payload = json.loads(payload)
            event_rows.append(
                {
                    "event_type": event["event_type"],
                    "event_subtype": event["event_subtype"],
                    "payload": payload if isinstance(payload, dict) else {},
                    "created_at": event["created_at"],
                }
            )

        return ContractFeatureInput(
            contract_id=contract["id"],
            shop_id=contract["shop_id"],
            customer_id=contract["customer_id"],
            created_at=ensure_utc(contract["created_at"]),
            billing_policy=billing_policy,
            line_items=[item for item in line_items if isinstance(item, dict)],
            sms_consent=bool(contract["sms_consent"]),
            subscription_count=int(contract["subscription_count"] or 1),
            orders=[
                {
                    "id": order["id"],
                    "total_price": float(order["total_price"]),
                    "created_at": order["created_at"],
                    "status": order["status"],
                    "payload": {},
                }
                for order in orders
            ],
            events=event_rows,
            interventions=[
                {
                    "status": item["status"],
                    "sent_at": item["sent_at"],
                    "responded_at": item["responded_at"],
                    "created_at": item["created_at"],
                }
                for item in interventions
            ],
            cohort_size=int(cohort["cohort_size"] if cohort else 1),
            cohort_cancelled=int(cohort["cohort_cancelled"] if cohort else 0),
        )
