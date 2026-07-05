from unittest.mock import AsyncMock, patch

import pytest
from src.jobs.daily_features import run_daily_feature_job, run_shop_feature_job


@pytest.mark.asyncio
async def test_run_shop_feature_job_continues_on_error() -> None:
    engineer = AsyncMock()
    engineer.list_active_contract_ids = AsyncMock(return_value=["c1", "c2"])
    engineer.generate_features = AsyncMock(
        side_effect=[
            {"contract_id": "c1", "tenure_days": 1},
            RuntimeError("boom"),
        ]
    )
    engineer.upsert_features = AsyncMock(return_value="sig_1")

    with (
        patch(
            "src.jobs.daily_features.get_pool",
            new_callable=AsyncMock,
            return_value=object(),
        ),
        patch("src.jobs.daily_features.FeatureEngineer", return_value=engineer),
    ):
        result = await run_shop_feature_job("shop_1")

    assert result["contract_count"] == 2
    assert result["upserted"] == 1
    assert result["error_count"] == 1
    assert result["errors"][0]["contract_id"] == "c2"
    assert result["processing_time_ms"] >= 0


@pytest.mark.asyncio
async def test_run_daily_feature_job_aggregates_shops() -> None:
    with (
        patch(
            "src.jobs.daily_features._shops_with_active_contracts",
            new_callable=AsyncMock,
            return_value=["s1", "s2"],
        ),
        patch(
            "src.jobs.daily_features.run_shop_feature_job",
            new_callable=AsyncMock,
            side_effect=[
                {
                    "shop_id": "s1",
                    "contract_count": 1,
                    "upserted": 1,
                    "error_count": 0,
                    "errors": [],
                    "processing_time_ms": 5,
                },
                {
                    "shop_id": "s2",
                    "contract_count": 2,
                    "upserted": 2,
                    "error_count": 0,
                    "errors": [],
                    "processing_time_ms": 8,
                },
            ],
        ),
    ):
        summary = await run_daily_feature_job()

    assert summary["shops_processed"] == 2
    assert summary["contracts_upserted"] == 3
    assert len(summary["shops"]) == 2
