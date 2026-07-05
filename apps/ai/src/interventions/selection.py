"""Pure intervention selection and offer-value helpers (unit-testable)."""

from __future__ import annotations

from typing import Any

# Canonical intervention type names (map to DB enum via to_db_type).
DUNNING_RETRY = "DUNNING_RETRY"
PERSONAL_OUTREACH = "PERSONAL_OUTREACH"
LOYALTY_BONUS = "LOYALTY_BONUS"
DISCOUNT_OFFER = "DISCOUNT_OFFER"
SKIP_OFFER = "SKIP_OFFER"
SWAP_SUGGESTION = "SWAP_SUGGESTION"
PAUSE_OFFER = "PAUSE_OFFER"
CANCEL_SAVE = "CANCEL_SAVE"

LTV_TIERS = ("VIP", "High", "Medium", "Low")


def to_db_type(intervention_type: str) -> str:
    return intervention_type.lower()


def from_db_type(db_type: str) -> str:
    return db_type.upper()


def ltv_tier(lifetime_value: float) -> str:
    if lifetime_value >= 500:
        return "VIP"
    if lifetime_value >= 200:
        return "High"
    if lifetime_value >= 100:
        return "Medium"
    return "Low"


def _tier_index(tier: str) -> int:
    try:
        return LTV_TIERS.index(tier)
    except ValueError:
        return len(LTV_TIERS) - 1


def _signal(signals: dict[str, Any], key: str, default: Any = 0) -> Any:
    if key in signals and signals[key] is not None:
        return signals[key]
    features = signals.get("features")
    if isinstance(features, dict) and features.get(key) is not None:
        return features[key]
    return default


def select_intervention(
    contract: dict[str, Any],
    customer: dict[str, Any],
    prediction: dict[str, Any],
) -> str | None:
    """Priority-based intervention selection.

    Returns an UPPER_SNAKE intervention type, or None when no action is needed.
    """
    payment_failures = float(
        _signal(prediction, "payment_failure_count_30d", 0) or 0
    )
    if payment_failures > 0:
        return DUNNING_RETRY

    churn_probability = float(
        prediction.get("churn_probability")
        or prediction.get("predicted_churn_30d")
        or 0
    )
    sentiment = _signal(prediction, "support_ticket_sentiment", None)
    ltv = float(customer.get("lifetime_value") or 0)
    cadence_drift = float(_signal(prediction, "cadence_drift_days", 0) or 0)
    swap_count = float(_signal(prediction, "product_swap_count_30d", 0) or 0)
    pause_count = float(_signal(prediction, "pause_count_lifetime", 0) or 0)

    if churn_probability >= 0.8:
        if sentiment is not None and float(sentiment) < -0.3:
            return PERSONAL_OUTREACH
        if ltv > 500:
            return LOYALTY_BONUS
        return DISCOUNT_OFFER

    if churn_probability >= 0.5:
        if cadence_drift > 14:
            return SKIP_OFFER
        if swap_count > 2:
            return SWAP_SUGGESTION
        if pause_count > 0:
            return PAUSE_OFFER
        return DISCOUNT_OFFER

    return None


def calculate_offer_value(
    intervention_type: str,
    lifetime_value: float,
) -> dict[str, Any]:
    tier = ltv_tier(lifetime_value)
    index = _tier_index(tier)
    kind = intervention_type.upper()

    if kind == DISCOUNT_OFFER:
        values = [25, 20, 15, 10]
        return {
            "type": "percentage",
            "value": values[index],
            "duration": "next_3_orders",
            "max_discount": 50,
            "ltv_tier": tier,
        }

    if kind == SKIP_OFFER:
        values = [500, 300, 200, 100]
        return {
            "type": "loyalty_points",
            "value": values[index],
            "duration": "immediate",
            "ltv_tier": tier,
        }

    if kind == PAUSE_OFFER:
        return {
            "type": "pause_credit",
            "value": 10,
            "max_pause_days": 90,
            "ltv_tier": tier,
        }

    if kind == LOYALTY_BONUS:
        values = [500, 300, 200, 100]
        return {
            "type": "loyalty_points",
            "value": values[index],
            "duration": "immediate",
            "ltv_tier": tier,
        }

    if kind == SWAP_SUGGESTION:
        return {"type": "swap", "ltv_tier": tier}

    if kind == DUNNING_RETRY:
        return {"type": "dunning_retry", "ltv_tier": tier}

    if kind == PERSONAL_OUTREACH:
        return {"type": "outreach", "ltv_tier": tier}

    if kind == CANCEL_SAVE:
        return {"type": "cancel_save", "ltv_tier": tier}

    return {"type": "unknown", "ltv_tier": tier}
