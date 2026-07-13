"""Retention intervention engine — decide and execute strategies."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import asyncpg

from src.config import get_settings
from src.interventions.channels import send_email, send_sms
from src.interventions.selection import (
    calculate_offer_value,
    select_intervention,
    to_db_type,
)
from src.interventions.templates import get_template

logger = logging.getLogger(__name__)

MAX_INTERVENTIONS_30D = 3
PENDING_STATUSES = ("pending",)


class InterventionEngine:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def evaluate_and_intervene(
        self,
        contract_id: str,
        prediction: dict[str, Any],
    ) -> dict[str, Any]:
        context = await self._load_context(contract_id)
        if context is None:
            raise ValueError(f"Contract not found: {contract_id}")

        contract = context["contract"]
        shop = context["shop"]
        customer = context["customer"]
        signals = {**context["signals"], **prediction}

        settings = shop.get("settings") or {}
        if isinstance(settings, str):
            settings = json.loads(settings)
        if not settings.get("auto_interventions_enabled", True):
            return {
                "contract_id": contract_id,
                "action": "skipped",
                "reason": "auto_interventions_disabled",
            }

        if await self._has_pending_intervention(contract_id):
            return {
                "contract_id": contract_id,
                "action": "skipped",
                "reason": "pending_intervention_exists",
            }

        recent_count = await self._intervention_count_30d(contract_id)
        if recent_count >= MAX_INTERVENTIONS_30D:
            return {
                "contract_id": contract_id,
                "action": "skipped",
                "reason": "rate_limited",
                "interventions_30d": recent_count,
            }

        intervention_type = self._select_intervention(contract, customer, signals)
        if intervention_type is None:
            return {
                "contract_id": contract_id,
                "action": "skipped",
                "reason": "no_intervention_needed",
                "churn_probability": signals.get("churn_probability"),
            }

        record = await self._execute_intervention(
            contract=contract,
            customer=customer,
            intervention_type=intervention_type,
            prediction=signals,
        )
        return {
            "contract_id": contract_id,
            "action": "intervened",
            "intervention": record,
        }

    def _select_intervention(
        self,
        contract: dict[str, Any],
        customer: dict[str, Any],
        prediction: dict[str, Any],
    ) -> str | None:
        return select_intervention(contract, customer, prediction)

    def _calculate_offer_value(
        self,
        intervention_type: str,
        ltv_tier_or_value: float | str,
    ) -> dict[str, Any]:
        # Accept LTV amount (preferred) or tier name for flexibility.
        if isinstance(ltv_tier_or_value, str):
            tier_to_ltv = {"VIP": 500, "High": 200, "Medium": 100, "Low": 0}
            lifetime_value = float(tier_to_ltv.get(ltv_tier_or_value, 0))
        else:
            lifetime_value = float(ltv_tier_or_value)
        return calculate_offer_value(intervention_type, lifetime_value)

    async def _execute_intervention(
        self,
        *,
        contract: dict[str, Any],
        customer: dict[str, Any],
        intervention_type: str,
        prediction: dict[str, Any],
    ) -> dict[str, Any]:
        ltv = float(customer.get("lifetime_value") or 0)
        offer = self._calculate_offer_value(intervention_type, ltv)

        suggested_product = await self._get_suggested_product(contract)
        tenure_days = float(prediction.get("tenure_days") or 0)
        tenure_months = max(int(tenure_days // 30), 1)
        settings = get_settings()

        duration_raw = str(offer.get("duration") or "next_3_orders")
        duration_orders = (
            "3" if duration_raw == "next_3_orders" else duration_raw
        )
        variables = {
            "customer_name": (
                customer.get("first_name")
                or customer.get("email")
                or "there"
            ),
            "product_name": prediction.get("product_name") or "your plan",
            "discount": offer.get("value", ""),
            "points": offer.get("value", ""),
            "duration": duration_orders,
            "max_pause_days": offer.get("max_pause_days", 90),
            "tenure_months": tenure_months,
            "suggested_product": suggested_product,
            "update_link": settings.payment_update_url,
            "offer": (
                f"{offer.get('value')}% off"
                if offer.get("type") == "percentage"
                else "a special loyalty bonus"
            ),
        }

        template = get_template(intervention_type)
        subject = template["subject"].format(**variables)
        body = template["body"].format(**variables)

        intervention_id = str(uuid4())
        db_type = to_db_type(intervention_type)
        churn_probability = float(prediction.get("churn_probability") or 0)
        trigger_reason = (
            f"auto:{intervention_type.lower()}:"
            f"churn={churn_probability:.2f}"
        )

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO interventions (
                    id, shop_id, contract_id, intervention_type, trigger_reason,
                    message_subject, message_body, offer_value, status,
                    is_auto, created_by, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4::"InterventionType", $5,
                    $6, $7, $8::jsonb, 'pending'::"InterventionStatus",
                    true, 'intervention-engine', NOW(), NOW()
                )
                RETURNING id, shop_id, contract_id, intervention_type, status,
                          message_subject, message_body, offer_value, created_at
                """,
                intervention_id,
                contract["shop_id"],
                contract["id"],
                db_type,
                trigger_reason,
                subject,
                body,
                json.dumps(offer, default=str),
            )

        delivery: list[dict[str, Any]] = []
        email_result = await send_email(
            to_email=customer.get("email") or "",
            subject=subject,
            body=body,
        )
        delivery.append(email_result)

        if customer.get("sms_consent") and customer.get("phone"):
            sms_result = await send_sms(
                to_phone=customer.get("phone"),
                body=body,
            )
            delivery.append(sms_result)

        offer_with_delivery = {**offer, "delivery": delivery}
        async with self.pool.acquire() as conn:
            updated = await conn.fetchrow(
                """
                UPDATE interventions
                SET status = 'sent'::"InterventionStatus",
                    sent_at = NOW(),
                    offer_value = $2::jsonb,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, shop_id, contract_id, intervention_type, status,
                          message_subject, message_body, offer_value,
                          sent_at, created_at, trigger_reason
                """,
                intervention_id,
                json.dumps(offer_with_delivery, default=str),
            )

        await self._log_event(
            shop_id=contract["shop_id"],
            contract_id=contract["id"],
            event_type="intervention.sent",
            event_subtype=db_type,
            payload={
                "intervention_id": intervention_id,
                "delivery": delivery,
                "churn_probability": churn_probability,
            },
        )

        return self._row_to_dict(updated or row)

    async def _get_suggested_product(self, contract: dict[str, Any]) -> str:
        query = """
            SELECT
                COALESCE(
                    payload->>'newProductId',
                    payload->>'new_product_id',
                    payload->>'productId'
                ) AS product_key,
                COUNT(*)::int AS swap_count
            FROM events
            WHERE shop_id = $1
              AND event_type IN (
                'subscription_contract.product_swapped',
                'product_swap'
              )
              AND contract_id IS DISTINCT FROM $2
            GROUP BY 1
            HAVING COALESCE(
                payload->>'newProductId',
                payload->>'new_product_id',
                payload->>'productId'
            ) IS NOT NULL
            ORDER BY swap_count DESC
            LIMIT 1
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, contract["shop_id"], contract["id"])
        if row and row["product_key"]:
            key = str(row["product_key"])
            return key.split("/")[-1] if "/" in key else key
        return "our bestseller"

    async def get_intervention(self, intervention_id: str) -> dict[str, Any] | None:
        query = """
            SELECT id, shop_id, contract_id, intervention_type, trigger_reason,
                   message_subject, message_body, offer_value, status,
                   sent_at, opened_at, clicked_at, responded_at, outcome,
                   revenue_impact, is_auto, created_by, created_at, updated_at
            FROM interventions
            WHERE id = $1
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, intervention_id)
        return self._row_to_dict(row) if row else None

    async def accept_intervention(self, intervention_id: str) -> dict[str, Any]:
        return await self._respond(intervention_id, status="accepted", outcome="saved")

    async def decline_intervention(self, intervention_id: str) -> dict[str, Any]:
        return await self._respond(
            intervention_id,
            status="declined",
            outcome="no_action",
        )

    async def evaluate_batch(self, shop_id: str) -> dict[str, Any]:
        """Evaluate all at-risk / critical active contracts for a shop."""
        query = """
            SELECT c.id AS contract_id,
                   c.predicted_churn_30d,
                   c.churn_risk_score,
                   s.feature_vector,
                   s.payment_failure_count_30d,
                   s.product_swap_count_30d,
                   s.pause_count_lifetime,
                   s.cadence_drift_days,
                   s.support_ticket_sentiment,
                   s.tenure_days,
                   s.predicted_churn_30d AS signal_churn
            FROM subscription_contracts c
            LEFT JOIN subscriber_signals s ON s.contract_id = c.id
            WHERE c.shop_id = $1
              AND c.status IN ('active', 'paused', 'payment_failed')
              AND (
                c.health_status IN ('at_risk', 'critical')
                OR COALESCE(c.predicted_churn_30d, s.predicted_churn_30d, 0) >= 0.5
                OR COALESCE(s.payment_failure_count_30d, 0) > 0
              )
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, shop_id)

        results: list[dict[str, Any]] = []
        for row in rows:
            feature_vector = row["feature_vector"] or {}
            if isinstance(feature_vector, str):
                feature_vector = json.loads(feature_vector)
            prediction = {
                "churn_probability": float(
                    row["predicted_churn_30d"]
                    or row["signal_churn"]
                    or row["churn_risk_score"]
                    or 0
                ),
                "payment_failure_count_30d": row["payment_failure_count_30d"]
                or feature_vector.get("payment_failure_count_30d")
                or 0,
                "product_swap_count_30d": row["product_swap_count_30d"]
                or feature_vector.get("product_swap_count_30d")
                or 0,
                "pause_count_lifetime": row["pause_count_lifetime"]
                or feature_vector.get("pause_count_lifetime")
                or 0,
                "cadence_drift_days": row["cadence_drift_days"]
                or feature_vector.get("cadence_drift_days")
                or 0,
                "support_ticket_sentiment": row["support_ticket_sentiment"]
                if row["support_ticket_sentiment"] is not None
                else feature_vector.get("support_ticket_sentiment"),
                "tenure_days": row["tenure_days"]
                or feature_vector.get("tenure_days")
                or 0,
            }
            try:
                results.append(
                    await self.evaluate_and_intervene(row["contract_id"], prediction)
                )
            except Exception as exc:
                logger.exception("Batch intervention failed for %s", row["contract_id"])
                results.append(
                    {
                        "contract_id": row["contract_id"],
                        "action": "error",
                        "reason": str(exc),
                    }
                )

        intervened = sum(1 for item in results if item.get("action") == "intervened")
        return {
            "shop_id": shop_id,
            "evaluated": len(results),
            "intervened": intervened,
            "results": results,
        }

    async def _respond(
        self,
        intervention_id: str,
        *,
        status: str,
        outcome: str,
    ) -> dict[str, Any]:
        async with self.pool.acquire() as conn:
            revenue_impact = None
            if outcome == "saved":
                revenue_row = await conn.fetchrow(
                    """
                    SELECT COALESCE(c.total_revenue, cust.lifetime_value, 0) AS impact
                    FROM interventions i
                    JOIN subscription_contracts c ON c.id = i.contract_id
                    JOIN customers cust ON cust.id = c.customer_id
                    WHERE i.id = $1
                    """,
                    intervention_id,
                )
                if revenue_row is not None:
                    revenue_impact = float(revenue_row["impact"] or 0)

            row = await conn.fetchrow(
                """
                UPDATE interventions
                SET status = $2::"InterventionStatus",
                    outcome = $3::"InterventionOutcome",
                    revenue_impact = COALESCE($4, revenue_impact),
                    responded_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, shop_id, contract_id, intervention_type, status,
                          outcome, responded_at, offer_value, message_subject,
                          revenue_impact
                """,
                intervention_id,
                status,
                outcome,
                revenue_impact,
            )
        if row is None:
            raise ValueError(f"Intervention not found: {intervention_id}")

        await self._log_event(
            shop_id=row["shop_id"],
            contract_id=row["contract_id"],
            event_type=f"intervention.{status}",
            event_subtype=row["intervention_type"],
            payload={
                "intervention_id": intervention_id,
                "outcome": outcome,
                "revenue_impact": revenue_impact,
            },
        )
        return self._row_to_dict(row)

    async def _load_context(self, contract_id: str) -> dict[str, Any] | None:
        query = """
            SELECT
                c.id, c.shop_id, c.customer_id, c.status, c.created_at,
                c.predicted_churn_30d, c.churn_risk_score, c.health_status,
                c.line_items,
                s.settings AS shop_settings,
                s.shopify_domain,
                cust.email, cust.first_name, cust.last_name, cust.phone,
                cust.lifetime_value, cust.sms_consent,
                sig.feature_vector,
                sig.payment_failure_count_30d,
                sig.product_swap_count_30d,
                sig.pause_count_lifetime,
                sig.cadence_drift_days,
                sig.support_ticket_sentiment,
                sig.tenure_days,
                sig.predicted_churn_30d AS signal_churn
            FROM subscription_contracts c
            JOIN shops s ON s.id = c.shop_id
            JOIN customers cust ON cust.id = c.customer_id
            LEFT JOIN subscriber_signals sig ON sig.contract_id = c.id
            WHERE c.id = $1
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, contract_id)
        if row is None:
            return None

        settings = row["shop_settings"] or {}
        if isinstance(settings, str):
            settings = json.loads(settings)

        feature_vector = row["feature_vector"] or {}
        if isinstance(feature_vector, str):
            feature_vector = json.loads(feature_vector)

        signals = {
            **feature_vector,
            "payment_failure_count_30d": row["payment_failure_count_30d"]
            if row["payment_failure_count_30d"] is not None
            else feature_vector.get("payment_failure_count_30d", 0),
            "product_swap_count_30d": row["product_swap_count_30d"]
            if row["product_swap_count_30d"] is not None
            else feature_vector.get("product_swap_count_30d", 0),
            "pause_count_lifetime": row["pause_count_lifetime"]
            if row["pause_count_lifetime"] is not None
            else feature_vector.get("pause_count_lifetime", 0),
            "cadence_drift_days": row["cadence_drift_days"]
            if row["cadence_drift_days"] is not None
            else feature_vector.get("cadence_drift_days", 0),
            "support_ticket_sentiment": (
                row["support_ticket_sentiment"]
                if row["support_ticket_sentiment"] is not None
                else feature_vector.get("support_ticket_sentiment")
            ),
            "tenure_days": row["tenure_days"]
            if row["tenure_days"] is not None
            else feature_vector.get("tenure_days", 0),
            "churn_probability": float(
                row["predicted_churn_30d"]
                or row["signal_churn"]
                or row["churn_risk_score"]
                or feature_vector.get("churn_probability")
                or 0
            ),
        }

        return {
            "contract": {
                "id": row["id"],
                "shop_id": row["shop_id"],
                "customer_id": row["customer_id"],
                "status": row["status"],
                "created_at": row["created_at"],
                "line_items": row["line_items"],
            },
            "shop": {
                "settings": settings,
                "shopify_domain": row["shopify_domain"],
            },
            "customer": {
                "email": row["email"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "phone": row["phone"],
                "lifetime_value": float(row["lifetime_value"] or 0),
                "sms_consent": bool(row["sms_consent"]),
            },
            "signals": signals,
        }

    async def _has_pending_intervention(self, contract_id: str) -> bool:
        query = """
            SELECT 1
            FROM interventions
            WHERE contract_id = $1
              AND status = ANY($2::"InterventionStatus"[])
            LIMIT 1
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchval(query, contract_id, list(PENDING_STATUSES))
        return row is not None

    async def _intervention_count_30d(self, contract_id: str) -> int:
        query = """
            SELECT COUNT(*)::int
            FROM interventions
            WHERE contract_id = $1
              AND created_at >= NOW() - INTERVAL '30 days'
        """
        async with self.pool.acquire() as conn:
            return int(await conn.fetchval(query, contract_id) or 0)

    async def _log_event(
        self,
        *,
        shop_id: str,
        contract_id: str,
        event_type: str,
        event_subtype: str | None,
        payload: dict[str, Any],
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO events (
                    id, shop_id, contract_id, event_type, event_subtype,
                    payload, source, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6::jsonb, 'ai'::"EventSource", NOW()
                )
                """,
                str(uuid4()),
                shop_id,
                contract_id,
                event_type,
                event_subtype,
                json.dumps(payload, default=str),
            )

    @staticmethod
    def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
        payload = dict(row)
        offer = payload.get("offer_value")
        if isinstance(offer, str):
            payload["offer_value"] = json.loads(offer)
        for key in (
            "created_at",
            "updated_at",
            "sent_at",
            "opened_at",
            "clicked_at",
            "responded_at",
        ):
            value = payload.get(key)
            if isinstance(value, datetime):
                payload[key] = value.astimezone(timezone.utc).isoformat()
        if payload.get("revenue_impact") is not None:
            payload["revenue_impact"] = float(payload["revenue_impact"])
        return payload
