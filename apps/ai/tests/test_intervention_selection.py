from src.interventions.selection import (
    DISCOUNT_OFFER,
    DUNNING_RETRY,
    LOYALTY_BONUS,
    PAUSE_OFFER,
    PERSONAL_OUTREACH,
    SKIP_OFFER,
    SWAP_SUGGESTION,
    calculate_offer_value,
    ltv_tier,
    select_intervention,
)
from src.interventions.templates import get_template


def _contract() -> dict:
    return {"id": "c1", "shop_id": "s1"}


def _customer(**overrides: object) -> dict:
    base = {"lifetime_value": 50.0, "email": "a@b.com", "first_name": "Ada"}
    base.update(overrides)
    return base


def test_payment_failure_always_dunning() -> None:
    result = select_intervention(
        _contract(),
        _customer(lifetime_value=1000),
        {
            "churn_probability": 0.9,
            "payment_failure_count_30d": 1,
            "support_ticket_sentiment": -0.9,
        },
    )
    assert result == DUNNING_RETRY


def test_high_churn_negative_sentiment_personal_outreach() -> None:
    result = select_intervention(
        _contract(),
        _customer(lifetime_value=50),
        {
            "churn_probability": 0.85,
            "payment_failure_count_30d": 0,
            "support_ticket_sentiment": -0.5,
        },
    )
    assert result == PERSONAL_OUTREACH


def test_high_churn_vip_loyalty_bonus() -> None:
    result = select_intervention(
        _contract(),
        _customer(lifetime_value=501),
        {
            "churn_probability": 0.85,
            "payment_failure_count_30d": 0,
            "support_ticket_sentiment": 0.1,
        },
    )
    assert result == LOYALTY_BONUS


def test_high_churn_default_discount() -> None:
    result = select_intervention(
        _contract(),
        _customer(lifetime_value=100),
        {
            "churn_probability": 0.8,
            "payment_failure_count_30d": 0,
            "support_ticket_sentiment": None,
        },
    )
    assert result == DISCOUNT_OFFER


def test_medium_churn_cadence_drift_skip_offer() -> None:
    result = select_intervention(
        _contract(),
        _customer(),
        {
            "churn_probability": 0.6,
            "payment_failure_count_30d": 0,
            "cadence_drift_days": 15,
        },
    )
    assert result == SKIP_OFFER


def test_medium_churn_swap_suggestion() -> None:
    result = select_intervention(
        _contract(),
        _customer(),
        {
            "churn_probability": 0.55,
            "payment_failure_count_30d": 0,
            "cadence_drift_days": 2,
            "product_swap_count_30d": 3,
        },
    )
    assert result == SWAP_SUGGESTION


def test_medium_churn_pause_offer() -> None:
    result = select_intervention(
        _contract(),
        _customer(),
        {
            "churn_probability": 0.5,
            "payment_failure_count_30d": 0,
            "cadence_drift_days": 0,
            "product_swap_count_30d": 0,
            "pause_count_lifetime": 1,
        },
    )
    assert result == PAUSE_OFFER


def test_medium_churn_default_discount() -> None:
    result = select_intervention(
        _contract(),
        _customer(),
        {
            "churn_probability": 0.5,
            "payment_failure_count_30d": 0,
            "cadence_drift_days": 0,
            "product_swap_count_30d": 0,
            "pause_count_lifetime": 0,
        },
    )
    assert result == DISCOUNT_OFFER


def test_low_churn_no_intervention() -> None:
    result = select_intervention(
        _contract(),
        _customer(),
        {"churn_probability": 0.49, "payment_failure_count_30d": 0},
    )
    assert result is None


def test_nested_features_dict() -> None:
    result = select_intervention(
        _contract(),
        _customer(),
        {
            "churn_probability": 0.6,
            "features": {
                "payment_failure_count_30d": 0,
                "cadence_drift_days": 20,
            },
        },
    )
    assert result == SKIP_OFFER


def test_ltv_tiers() -> None:
    assert ltv_tier(500) == "VIP"
    assert ltv_tier(200) == "High"
    assert ltv_tier(100) == "Medium"
    assert ltv_tier(99) == "Low"


def test_offer_values_by_tier() -> None:
    vip_discount = calculate_offer_value(DISCOUNT_OFFER, 500)
    assert vip_discount == {
        "type": "percentage",
        "value": 25,
        "duration": "next_3_orders",
        "max_discount": 50,
        "ltv_tier": "VIP",
    }

    low_skip = calculate_offer_value(SKIP_OFFER, 50)
    assert low_skip["type"] == "loyalty_points"
    assert low_skip["value"] == 100
    assert low_skip["duration"] == "immediate"

    pause = calculate_offer_value(PAUSE_OFFER, 250)
    assert pause == {
        "type": "pause_credit",
        "value": 10,
        "max_pause_days": 90,
        "ltv_tier": "High",
    }


def test_templates_personalize() -> None:
    template = get_template("DISCOUNT_OFFER")
    body = template["body"].format(discount=20, duration="3")
    assert "20%" in body
    assert "3 orders" in body

    dunning = get_template("dunning_retry")
    assert "Update your payment method" in dunning["subject"]
