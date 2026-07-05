from unittest.mock import AsyncMock, patch


def test_generate_features_endpoint(client) -> None:
    result = {
        "shop_id": "shop_1",
        "contract_count": 2,
        "upserted": 2,
        "error_count": 0,
        "errors": [],
        "processing_time_ms": 12.5,
    }
    with patch(
        "src.main.run_shop_feature_job",
        new_callable=AsyncMock,
        return_value=result,
    ):
        response = client.post("/features/generate", json={"shop_id": "shop_1"})

    assert response.status_code == 200
    assert response.json()["upserted"] == 2


def test_get_features_not_found(client) -> None:
    with (
        patch("src.main.get_pool", new_callable=AsyncMock, return_value=object()),
        patch("src.main.FeatureEngineer") as engineer_cls,
    ):
        engineer_cls.return_value.get_latest_signals = AsyncMock(return_value=None)
        response = client.get("/features/missing")

    assert response.status_code == 404


def test_get_features_ok(client) -> None:
    payload = {
        "id": "sig_1",
        "contract_id": "c1",
        "tenure_days": 10,
        "feature_vector": {"tenure_days": 10},
        "model_version": "features-v1",
    }
    with (
        patch("src.main.get_pool", new_callable=AsyncMock, return_value=object()),
        patch("src.main.FeatureEngineer") as engineer_cls,
    ):
        engineer_cls.return_value.get_latest_signals = AsyncMock(return_value=payload)
        response = client.get("/features/c1")

    assert response.status_code == 200
    assert response.json()["contract_id"] == "c1"


def test_features_health_ok(client) -> None:
    with (
        patch("src.main.check_db", new_callable=AsyncMock, return_value=True),
        patch("src.main.check_redis", new_callable=AsyncMock, return_value=True),
    ):
        response = client.get("/features/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "up"
    assert body["redis"] == "up"


def test_features_health_degraded(client) -> None:
    with (
        patch("src.main.check_db", new_callable=AsyncMock, return_value=False),
        patch("src.main.check_redis", new_callable=AsyncMock, return_value=True),
    ):
        response = client.get("/features/health")

    assert response.status_code == 503
