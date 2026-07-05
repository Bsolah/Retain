"""Pure feature calculation helpers (unit-testable without a database)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

INTERVAL_DAYS = {
    "DAY": 1,
    "DAYS": 1,
    "WEEK": 7,
    "WEEKS": 7,
    "MONTH": 30,
    "MONTHS": 30,
    "YEAR": 365,
    "YEARS": 365,
}


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def as_date(value: date | datetime | None, default: date | None = None) -> date:
    if value is None:
        if default is None:
            raise ValueError("date value is required")
        return default
    if isinstance(value, datetime):
        return ensure_utc(value).date()
    return value


def days_between(start: date | datetime, end: date | datetime) -> int:
    return (as_date(end) - as_date(start)).days


def interval_unit_days(billing_policy: dict[str, Any] | None) -> int:
    policy = billing_policy or {}
    interval = str(policy.get("interval") or policy.get("Interval") or "MONTH")
    count = int(policy.get("intervalCount") or policy.get("interval_count") or 1)
    unit = INTERVAL_DAYS.get(interval.upper(), 30)
    return max(unit * max(count, 1), 1)


def tenure_days(created_at: date | datetime, as_of: date | datetime) -> int:
    return max(days_between(created_at, as_of), 0)


def days_since_last_engagement(
    last_portal_login: date | datetime | None,
    as_of: date | datetime,
) -> int | None:
    if last_portal_login is None:
        return None
    return max(days_between(last_portal_login, as_of), 0)


def count_events_in_window(
    events: list[dict[str, Any]],
    *,
    event_types: set[str],
    as_of: date,
    window_days: int | None = None,
    subtypes: set[str] | None = None,
) -> int:
    start = (
        as_of - timedelta(days=window_days) if window_days is not None else date.min
    )
    total = 0
    for event in events:
        if event.get("event_type") not in event_types:
            continue
        if subtypes is not None:
            subtype = event.get("event_subtype")
            if subtype not in subtypes:
                continue
        created = as_date(event["created_at"])
        if start <= created <= as_of:
            total += 1
    return total


def cadence_drift_days(
    *,
    last_order_date: date | datetime | None,
    billing_policy: dict[str, Any] | None,
    as_of: date | datetime,
) -> int:
    if last_order_date is None:
        return 0
    unit_days = interval_unit_days(billing_policy)
    expected_next = as_date(last_order_date) + timedelta(days=unit_days)
    today = as_date(as_of)
    if today > expected_next:
        return (today - expected_next).days
    return 0


def order_frequency_days(order_dates: list[date | datetime]) -> float | None:
    dates = sorted({as_date(value) for value in order_dates})
    if len(dates) < 2:
        return None
    gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    return sum(gaps) / len(gaps)


def avg_order_value(prices: list[float]) -> float | None:
    if not prices:
        return None
    return sum(prices) / len(prices)


def payment_failure_rate(failures_90d: int, total_orders: int) -> float:
    return failures_90d / max(total_orders, 1)


def email_rate(numerator: int, sends: int) -> float | None:
    if sends <= 0:
        return None
    return numerator / sends


def support_ticket_sentiment(sentiments: list[float]) -> float | None:
    if not sentiments:
        return None
    return sum(sentiments) / len(sentiments)


def product_category_diversity(categories: list[str]) -> int:
    return len({category for category in categories if category})


@dataclass
class ContractFeatureInput:
    contract_id: str
    shop_id: str
    customer_id: str
    created_at: datetime
    billing_policy: dict[str, Any]
    line_items: list[dict[str, Any]] = field(default_factory=list)
    sms_consent: bool = True
    subscription_count: int = 1
    orders: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    interventions: list[dict[str, Any]] = field(default_factory=list)
    cohort_size: int = 1
    cohort_cancelled: int = 0


def build_feature_dict(
    data: ContractFeatureInput,
    as_of: date,
) -> dict[str, Any]:
    portal_logins = [
        event
        for event in data.events
        if event.get("event_type") in {"portal.login", "portal_login"}
    ]
    last_login = max(
        (as_date(event["created_at"]) for event in portal_logins),
        default=None,
    )

    order_prices = [float(order["total_price"]) for order in data.orders]
    order_dates = [order["created_at"] for order in data.orders]
    last_order_date = max((as_date(value) for value in order_dates), default=None)

    payment_failures = [
        event
        for event in data.events
        if (
            event.get("event_type") == "subscription_contract.billed"
            and event.get("event_subtype") == "payment_failed"
        )
        or event.get("event_type")
        in {
            "subscription_contract.payment_failed",
            "payment_failed",
        }
    ]
    last_failure = max(
        (as_date(event["created_at"]) for event in payment_failures),
        default=None,
    )

    support_events = [
        event
        for event in data.events
        if event.get("event_type") in {"support.ticket", "support_ticket"}
        and as_of - timedelta(days=30)
        <= as_date(event["created_at"])
        <= as_of
    ]
    sentiments: list[float] = []
    for event in support_events:
        payload = event.get("payload") or {}
        if isinstance(payload, dict) and payload.get("sentiment") is not None:
            sentiments.append(float(payload["sentiment"]))

    email_sends = count_events_in_window(
        data.events,
        event_types={"email.sent", "email_sent"},
        as_of=as_of,
        window_days=30,
    )
    email_opens = count_events_in_window(
        data.events,
        event_types={"email.opened", "email_opened", "email.open"},
        as_of=as_of,
        window_days=30,
    )
    email_clicks = count_events_in_window(
        data.events,
        event_types={"email.clicked", "email_clicked", "email.click"},
        as_of=as_of,
        window_days=30,
    )

    sms_opt_out_events = count_events_in_window(
        data.events,
        event_types={"sms.opt_out", "sms_opt_out"},
        as_of=as_of,
    )
    sms_opt_out = sms_opt_out_events > 0 or data.sms_consent is False

    categories: list[str] = []
    for order in data.orders:
        payload = order.get("payload") or {}
        if isinstance(payload, dict):
            for category in payload.get("categories") or []:
                categories.append(str(category))
    for item in data.line_items:
        category = (
            item.get("category")
            or item.get("productId")
            or item.get("product_id")
        )
        if category:
            categories.append(str(category))

    swap_count_30d = count_events_in_window(
        data.events,
        event_types={
            "subscription_contract.product_swapped",
            "product_swap",
        },
        as_of=as_of,
        window_days=30,
    )
    swap_count_lifetime = count_events_in_window(
        data.events,
        event_types={
            "subscription_contract.product_swapped",
            "product_swap",
        },
        as_of=as_of,
    )

    failures_30d = sum(
        1
        for event in payment_failures
        if as_of - timedelta(days=30) <= as_date(event["created_at"]) <= as_of
    )
    failures_90d = sum(
        1
        for event in payment_failures
        if as_of - timedelta(days=90) <= as_date(event["created_at"]) <= as_of
    )

    interventions_sent_30d = sum(
        1
        for item in data.interventions
        if item.get("status") in {"sent", "opened", "clicked", "accepted", "declined"}
        and item.get("sent_at") is not None
        and as_of - timedelta(days=30) <= as_date(item["sent_at"]) <= as_of
    )
    interventions_accepted_30d = sum(
        1
        for item in data.interventions
        if item.get("status") == "accepted"
        and as_of - timedelta(days=30)
        <= as_date(
            item.get("responded_at") or item.get("sent_at") or item["created_at"]
        )
        <= as_of
    )

    total_orders = len(data.orders)
    cohort_size = max(data.cohort_size, 1)
    cohort_avg_churn_rate = data.cohort_cancelled / cohort_size

    return {
        # Behavioral
        "tenure_days": tenure_days(data.created_at, as_of),
        "days_since_last_engagement": days_since_last_engagement(last_login, as_of),
        "portal_login_count_30d": sum(
            1
            for event in portal_logins
            if as_of - timedelta(days=30) <= as_date(event["created_at"]) <= as_of
        ),
        "product_swap_count_30d": swap_count_30d,
        "skip_count_90d": count_events_in_window(
            data.events,
            event_types={"subscription_contract.skipped", "skip"},
            as_of=as_of,
            window_days=90,
        ),
        "pause_count_lifetime": count_events_in_window(
            data.events,
            event_types={"subscription_contract.paused", "pause"},
            as_of=as_of,
        ),
        # Order
        "total_orders": total_orders,
        "avg_order_value": avg_order_value(order_prices),
        "total_revenue": float(sum(order_prices)),
        "cadence_drift_days": cadence_drift_days(
            last_order_date=last_order_date,
            billing_policy=data.billing_policy,
            as_of=as_of,
        ),
        "order_frequency_days": order_frequency_days(order_dates),
        # Payment
        "payment_failure_count_30d": failures_30d,
        "payment_failure_count_90d": failures_90d,
        "days_since_last_payment_failure": (
            days_between(last_failure, as_of) if last_failure is not None else None
        ),
        "payment_failure_rate": payment_failure_rate(failures_90d, total_orders),
        # Support
        "support_ticket_count_30d": len(support_events),
        "support_ticket_sentiment": support_ticket_sentiment(sentiments),
        # Marketing
        "email_open_rate_30d": email_rate(email_opens, email_sends),
        "email_click_rate_30d": email_rate(email_clicks, email_sends),
        "sms_opt_out": sms_opt_out,
        # Product
        "product_category_diversity": product_category_diversity(categories),
        "has_swapped_products": swap_count_lifetime > 0,
        # Cohort
        "cohort_avg_churn_rate": cohort_avg_churn_rate,
        "cohort_size": cohort_size,
        # Interaction
        "interventions_sent_30d": interventions_sent_30d,
        "interventions_accepted_30d": interventions_accepted_30d,
        # Metadata
        "contract_id": data.contract_id,
        "shop_id": data.shop_id,
        "subscription_count": data.subscription_count,
    }
