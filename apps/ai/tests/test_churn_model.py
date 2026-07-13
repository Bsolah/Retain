from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from src.models.churn import FEATURE_COLUMNS, MIN_XGBOOST_SAMPLES, ChurnPredictor


def _xgboost_available() -> bool:
    try:
        from xgboost import XGBClassifier

        XGBClassifier(n_estimators=1)
        return True
    except Exception:
        return False


def _sample_row(**overrides: object) -> dict:
    row = {column: 0 for column in FEATURE_COLUMNS}
    row.update(
        {
            "tenure_days": 60,
            "avg_order_value": 25.0,
            "total_revenue": 50.0,
            "total_orders": 2,
            "cohort_size": 10,
            "cohort_avg_churn_rate": 0.2,
            "sms_opt_out": False,
            "has_swapped_products": False,
        }
    )
    row.update(overrides)
    return row


def test_risk_levels() -> None:
    assert ChurnPredictor._get_risk_level(0.7) == "critical"
    assert ChurnPredictor._get_risk_level(0.4) == "at_risk"
    assert ChurnPredictor._get_risk_level(0.39) == "healthy"


def test_baseline_rules() -> None:
    predictor = ChurnPredictor()
    assert predictor.predict(_sample_row(payment_failure_count_30d=1))[
        "churn_probability"
    ] == 0.8
    assert predictor.predict(_sample_row(cadence_drift_days=15))[
        "churn_probability"
    ] == 0.6
    assert predictor.predict(_sample_row(skip_count_90d=3))["churn_probability"] == 0.5
    assert predictor.predict(_sample_row())["churn_probability"] == 0.1


def test_train_uses_baseline_when_insufficient_samples() -> None:
    rows = [_sample_row(churned_30d=i % 2) for i in range(50)]
    df = pd.DataFrame(rows)
    predictor = ChurnPredictor()
    metrics = predictor.train(df)

    assert predictor.is_baseline is True
    assert metrics["training_samples"] == 50
    assert metrics["model_type"] == "baseline"
    assert "precision" in metrics
    assert "auc" in metrics
    assert isinstance(metrics["featureImportance"], list)
    assert len(metrics["featureImportance"]) > 0
    assert metrics["featureImportanceEstimated"] is True
    assert "feature" in metrics["featureImportance"][0]
    assert "importance" in metrics["featureImportance"][0]

@pytest.mark.skipif(not _xgboost_available(), reason="xgboost/libomp unavailable")
def test_train_xgboost_and_predict_batch(tmp_path: Path) -> None:
    rng = np.random.default_rng(42)
    rows: list[dict] = []
    for i in range(MIN_XGBOOST_SAMPLES + 50):
        payment_failures = int(rng.integers(0, 3))
        skips = int(rng.integers(0, 5))
        drift = int(rng.integers(0, 30))
        # Label correlates with risk signals.
        churned = int(payment_failures > 0 or drift > 14 or skips > 2)
        if rng.random() < 0.1:
            churned = 1 - churned
        rows.append(
            _sample_row(
                payment_failure_count_30d=payment_failures,
                payment_failure_count_90d=payment_failures,
                payment_failure_rate=payment_failures / 3,
                skip_count_90d=skips,
                cadence_drift_days=drift,
                tenure_days=int(rng.integers(30, 200)),
                total_orders=int(rng.integers(1, 10)),
                churned_30d=churned,
            )
        )

    df = pd.DataFrame(rows)
    # Ensure both classes exist.
    assert df["churned_30d"].nunique() == 2

    predictor = ChurnPredictor()
    metrics = predictor.train(df)
    assert predictor.is_baseline is False
    assert metrics["model_type"] == "xgboost"
    assert metrics["training_samples"] == len(df)
    assert 0.0 <= metrics["auc"] <= 1.0

    prediction = predictor.predict(rows[0])
    assert 0.0 <= prediction["churn_probability"] <= 1.0
    assert prediction["risk_level"] in {"healthy", "at_risk", "critical"}
    assert prediction["model_version"] == metrics["model_version"]

    batch = predictor.predict_batch(df.head(5))
    assert "predicted_churn_30d" in batch.columns
    assert "risk_level" in batch.columns

    path = tmp_path / "model.joblib"
    predictor.save(path)
    loaded = ChurnPredictor(path)
    assert loaded.model_version == predictor.model_version
    assert loaded.is_baseline is False
    assert loaded.predict(rows[0])["churn_probability"] >= 0


def test_feature_column_order() -> None:
    assert FEATURE_COLUMNS[0] == "tenure_days"
    assert FEATURE_COLUMNS[-1] == "interventions_accepted_30d"
    assert len(FEATURE_COLUMNS) == 26
