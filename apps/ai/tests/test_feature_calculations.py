from datetime import date, datetime, timezone

from src.features.calculations import (
    ContractFeatureInput,
    avg_order_value,
    build_feature_dict,
    cadence_drift_days,
    days_since_last_engagement,
    email_rate,
    order_frequency_days,
    payment_failure_rate,
    product_category_diversity,
    support_ticket_sentiment,
    tenure_days,
)

AS_OF = date(2026, 7, 4)


def _dt(year: int, month: int, day: int) -> datetime:
    return datetime(year, month, day, tzinfo=timezone.utc)


def test_tenure_days() -> None:
    assert tenure_days(_dt(2026, 1, 1), AS_OF) == 184
    assert tenure_days(AS_OF, AS_OF) == 0


def test_days_since_last_engagement_none() -> None:
    assert days_since_last_engagement(None, AS_OF) is None
    assert days_since_last_engagement(_dt(2026, 6, 20), AS_OF) == 14


def test_cadence_drift_when_late() -> None:
    # Monthly cadence, last order 40 days ago -> expected next was 10 days ago.
    drift = cadence_drift_days(
        last_order_date=_dt(2026, 5, 25),
        billing_policy={"interval": "MONTH", "intervalCount": 1},
        as_of=AS_OF,
    )
    assert drift == 10


def test_cadence_drift_when_on_schedule() -> None:
    drift = cadence_drift_days(
        last_order_date=_dt(2026, 6, 20),
        billing_policy={"interval": "WEEK", "intervalCount": 2},
        as_of=AS_OF,
    )
    assert drift == 0


def test_cadence_drift_without_orders() -> None:
    assert (
        cadence_drift_days(
            last_order_date=None,
            billing_policy={"interval": "MONTH", "intervalCount": 1},
            as_of=AS_OF,
        )
        == 0
    )


def test_order_frequency_days() -> None:
    freq = order_frequency_days(
        [_dt(2026, 1, 1), _dt(2026, 1, 11), _dt(2026, 1, 21)]
    )
    assert freq == 10.0
    assert order_frequency_days([_dt(2026, 1, 1)]) is None


def test_avg_order_value_and_payment_failure_rate() -> None:
    assert avg_order_value([10.0, 30.0]) == 20.0
    assert avg_order_value([]) is None
    assert payment_failure_rate(2, 0) == 2.0
    assert payment_failure_rate(1, 4) == 0.25


def test_email_and_support_helpers() -> None:
    assert email_rate(2, 4) == 0.5
    assert email_rate(1, 0) is None
    assert support_ticket_sentiment([1.0, -1.0]) == 0.0
    assert support_ticket_sentiment([]) is None
    assert product_category_diversity(["a", "b", "a", ""]) == 2


def test_build_feature_dict_behavioral_and_order() -> None:
    data = ContractFeatureInput(
        contract_id="c1",
        shop_id="s1",
        customer_id="cu1",
        created_at=_dt(2026, 1, 4),
        billing_policy={"interval": "MONTH", "intervalCount": 1},
        line_items=[{"productId": "p1", "category": "coffee"}],
        sms_consent=True,
        subscription_count=2,
        orders=[
            {"total_price": 20.0, "created_at": _dt(2026, 4, 1), "payload": {}},
            {"total_price": 40.0, "created_at": _dt(2026, 5, 1), "payload": {}},
            {"total_price": 30.0, "created_at": _dt(2026, 6, 1), "payload": {}},
        ],
        events=[
            {"event_type": "portal.login", "created_at": _dt(2026, 6, 20)},
            {"event_type": "portal.login", "created_at": _dt(2026, 7, 1)},
            {
                "event_type": "subscription_contract.product_swapped",
                "created_at": _dt(2026, 6, 15),
            },
            {
                "event_type": "subscription_contract.skipped",
                "created_at": _dt(2026, 5, 10),
            },
            {
                "event_type": "subscription_contract.paused",
                "created_at": _dt(2025, 12, 1),
            },
            {
                "event_type": "subscription_contract.paused",
                "created_at": _dt(2026, 3, 1),
            },
        ],
        interventions=[],
        cohort_size=10,
        cohort_cancelled=2,
    )

    features = build_feature_dict(data, AS_OF)

    assert features["tenure_days"] == 181
    assert features["days_since_last_engagement"] == 3
    assert features["portal_login_count_30d"] == 2
    assert features["product_swap_count_30d"] == 1
    assert features["skip_count_90d"] == 1
    assert features["pause_count_lifetime"] == 2
    assert features["total_orders"] == 3
    assert features["avg_order_value"] == 30.0
    assert features["total_revenue"] == 90.0
    assert features["order_frequency_days"] == 30.5
    # last order June 1 + 30 days = July 1; as_of July 4 => drift 3
    assert features["cadence_drift_days"] == 3
    assert features["has_swapped_products"] is True
    assert features["product_category_diversity"] == 1
    assert features["cohort_size"] == 10
    assert features["cohort_avg_churn_rate"] == 0.2
    assert features["subscription_count"] == 2


def test_build_feature_dict_payment_support_marketing() -> None:
    data = ContractFeatureInput(
        contract_id="c2",
        shop_id="s1",
        customer_id="cu1",
        created_at=_dt(2026, 1, 1),
        billing_policy={"interval": "MONTH", "intervalCount": 1},
        sms_consent=False,
        orders=[
            {"total_price": 10.0, "created_at": _dt(2026, 6, 1), "payload": {}},
            {"total_price": 10.0, "created_at": _dt(2026, 7, 1), "payload": {}},
        ],
        events=[
            {
                "event_type": "subscription_contract.billed",
                "event_subtype": "payment_failed",
                "created_at": _dt(2026, 6, 10),
            },
            {
                "event_type": "subscription_contract.billed",
                "event_subtype": "payment_failed",
                "created_at": _dt(2026, 7, 1),
            },
            {
                "event_type": "support.ticket",
                "payload": {"sentiment": 0.5},
                "created_at": _dt(2026, 6, 20),
            },
            {
                "event_type": "support.ticket",
                "payload": {"sentiment": -0.5},
                "created_at": _dt(2026, 7, 2),
            },
            {"event_type": "email.sent", "created_at": _dt(2026, 6, 20)},
            {"event_type": "email.sent", "created_at": _dt(2026, 6, 25)},
            {"event_type": "email.opened", "created_at": _dt(2026, 6, 21)},
            {"event_type": "email.clicked", "created_at": _dt(2026, 6, 21)},
        ],
        interventions=[
            {
                "status": "sent",
                "sent_at": _dt(2026, 6, 15),
                "responded_at": None,
                "created_at": _dt(2026, 6, 15),
            },
            {
                "status": "accepted",
                "sent_at": _dt(2026, 6, 20),
                "responded_at": _dt(2026, 6, 21),
                "created_at": _dt(2026, 6, 20),
            },
        ],
        cohort_size=5,
        cohort_cancelled=1,
    )

    features = build_feature_dict(data, AS_OF)

    assert features["payment_failure_count_30d"] == 2
    assert features["payment_failure_count_90d"] == 2
    assert features["days_since_last_payment_failure"] == 3
    assert features["payment_failure_rate"] == 1.0
    assert features["support_ticket_count_30d"] == 2
    assert features["support_ticket_sentiment"] == 0.0
    assert features["email_open_rate_30d"] == 0.5
    assert features["email_click_rate_30d"] == 0.5
    assert features["sms_opt_out"] is True
    assert features["interventions_sent_30d"] == 2
    assert features["interventions_accepted_30d"] == 1


def test_build_feature_dict_empty_history() -> None:
    data = ContractFeatureInput(
        contract_id="c3",
        shop_id="s1",
        customer_id="cu1",
        created_at=_dt(2026, 7, 1),
        billing_policy={},
        sms_consent=True,
    )
    features = build_feature_dict(data, AS_OF)

    assert features["tenure_days"] == 3
    assert features["days_since_last_engagement"] is None
    assert features["portal_login_count_30d"] == 0
    assert features["total_orders"] == 0
    assert features["avg_order_value"] is None
    assert features["total_revenue"] == 0.0
    assert features["cadence_drift_days"] == 0
    assert features["order_frequency_days"] is None
    assert features["payment_failure_rate"] == 0.0
    assert features["has_swapped_products"] is False
    assert features["email_open_rate_30d"] is None
    assert features["sms_opt_out"] is False
