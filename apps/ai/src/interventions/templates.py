"""Message templates keyed by intervention type (UPPER_SNAKE and db snake_case)."""

from __future__ import annotations

TEMPLATES: dict[str, dict[str, str]] = {
    "SKIP_OFFER": {
        "subject": "Need a break? Skip your next delivery",
        "body": (
            "We noticed you might need a pause. Skip your next order and earn "
            "{points} bonus points."
        ),
    },
    "DISCOUNT_OFFER": {
        "subject": "A special offer just for you",
        "body": (
            "We value your subscription. Here is {discount}% off your next "
            "{duration} orders."
        ),
    },
    "PAUSE_OFFER": {
        "subject": "Going away? Pause instead of canceling",
        "body": (
            "Pause your subscription for up to {max_pause_days} days. "
            "We will hold your spot and pricing."
        ),
    },
    "SWAP_SUGGESTION": {
        "subject": "Try something new in your next box",
        "body": (
            "Based on your preferences, we think you will love "
            "{suggested_product}. Want to swap it in?"
        ),
    },
    "LOYALTY_BONUS": {
        "subject": "Thank you for being a loyal subscriber",
        "body": (
            "You have been with us for {tenure_months} months! "
            "Here are {points} bonus points as a thank you."
        ),
    },
    "PERSONAL_OUTREACH": {
        "subject": "We would love to hear from you",
        "body": (
            "Our team noticed you might be having some concerns. "
            "Can we schedule a quick call?"
        ),
    },
    "DUNNING_RETRY": {
        "subject": "Update your payment method",
        "body": (
            "We could not process your last payment. "
            "Update your card in one tap: {update_link}"
        ),
    },
    "CANCEL_SAVE": {
        "subject": "Before you go...",
        "body": (
            "We are sorry to see you go. Would {offer} change your mind?"
        ),
    },
}

# Alias DB enum values to the same templates.
for _key in list(TEMPLATES):
    TEMPLATES[_key.lower()] = TEMPLATES[_key]


def get_template(intervention_type: str) -> dict[str, str]:
    key = intervention_type.upper()
    template = TEMPLATES.get(key) or TEMPLATES.get(intervention_type.lower())
    if template is None:
        raise KeyError(f"Unknown intervention template: {intervention_type}")
    return template
