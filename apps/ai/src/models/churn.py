"""XGBoost churn prediction with rule-based baseline fallback."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

FEATURE_COLUMNS: list[str] = [
    "tenure_days",
    "days_since_last_engagement",
    "portal_login_count_30d",
    "product_swap_count_30d",
    "skip_count_90d",
    "pause_count_lifetime",
    "total_orders",
    "avg_order_value",
    "total_revenue",
    "cadence_drift_days",
    "order_frequency_days",
    "payment_failure_count_30d",
    "payment_failure_count_90d",
    "days_since_last_payment_failure",
    "payment_failure_rate",
    "support_ticket_count_30d",
    "support_ticket_sentiment",
    "email_open_rate_30d",
    "email_click_rate_30d",
    "sms_opt_out",
    "product_category_diversity",
    "has_swapped_products",
    "cohort_avg_churn_rate",
    "cohort_size",
    "interventions_sent_30d",
    "interventions_accepted_30d",
]

MIN_XGBOOST_SAMPLES = 1000
RiskLevel = Literal["healthy", "at_risk", "critical"]


def _xgb_classifier_cls() -> Any:
    """Lazy import so baseline inference works without OpenMP/libomp."""
    from xgboost import XGBClassifier

    return XGBClassifier


class ChurnPredictor:
    def __init__(self, model_path: str | Path | None = None) -> None:
        self.model: Any | None = None
        self.is_baseline = True
        self.model_version = "baseline-v1"
        self.metrics: dict[str, Any] = {}
        if model_path is not None:
            self.load(model_path)

    def train(
        self,
        df: pd.DataFrame,
        target_col: str = "churned_30d",
    ) -> dict[str, Any]:
        if target_col not in df.columns:
            raise ValueError(f"Missing target column: {target_col}")

        frame = df.copy()
        for column in FEATURE_COLUMNS:
            if column not in frame.columns:
                frame[column] = 0
        frame = frame[FEATURE_COLUMNS + [target_col]].copy()
        frame = self._prepare_frame(frame)

        y = frame[target_col].astype(int)
        x = frame[FEATURE_COLUMNS]
        training_samples = int(len(frame))
        positive_samples = int(y.sum())
        training_date = datetime.now(timezone.utc).isoformat()

        if training_samples < MIN_XGBOOST_SAMPLES:
            self.is_baseline = True
            self.model = None
            self.model_version = f"baseline-{training_date[:10]}"
            probs = self._baseline_probabilities(x)
            metrics = self._score_predictions(y.to_numpy(), probs)
            metrics.update(
                {
                    "training_date": training_date,
                    "training_samples": training_samples,
                    "positive_samples": positive_samples,
                    "model_type": "baseline",
                    "model_version": self.model_version,
                }
            )
            self.metrics = metrics
            return metrics

        if positive_samples == 0 or positive_samples == training_samples:
            raise ValueError(
                "Training data must include both positive and negative labels"
            )

        x_train, x_test, y_train, y_test = train_test_split(
            x,
            y,
            test_size=0.2,
            stratify=y,
            random_state=42,
        )

        neg = int((y_train == 0).sum())
        pos = int((y_train == 1).sum())
        scale_pos_weight = neg / max(pos, 1)

        model = _xgb_classifier_cls()(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_pos_weight,
            eval_metric="auc",
            early_stopping_rounds=20,
            random_state=42,
            n_jobs=2,
        )
        model.fit(
            x_train,
            y_train,
            eval_set=[(x_test, y_test)],
            verbose=False,
        )

        probs = model.predict_proba(x_test)[:, 1]
        metrics = self._score_predictions(y_test.to_numpy(), probs)
        version = f"churn-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        metrics.update(
            {
                "training_date": training_date,
                "training_samples": training_samples,
                "positive_samples": positive_samples,
                "model_type": "xgboost",
                "model_version": version,
                "scale_pos_weight": scale_pos_weight,
            }
        )

        self.model = model
        self.is_baseline = False
        self.model_version = version
        self.metrics = metrics
        return metrics

    def predict(self, features_dict: dict[str, Any]) -> dict[str, Any]:
        frame = pd.DataFrame([features_dict])
        for column in FEATURE_COLUMNS:
            if column not in frame.columns:
                frame[column] = 0
        frame = self._prepare_frame(frame[FEATURE_COLUMNS])
        probability = float(self._predict_proba(frame)[0])
        return {
            "churn_probability": probability,
            "risk_level": self._get_risk_level(probability),
            "model_version": self.model_version,
            "prediction_date": datetime.now(timezone.utc).isoformat(),
        }

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        frame = df.copy()
        for column in FEATURE_COLUMNS:
            if column not in frame.columns:
                frame[column] = 0
        prepared = self._prepare_frame(frame[FEATURE_COLUMNS])
        probs = self._predict_proba(prepared)
        result = frame.copy()
        result["predicted_churn_30d"] = probs
        result["risk_level"] = [self._get_risk_level(float(p)) for p in probs]
        return result

    def save(self, path: str | Path) -> None:
        payload = {
            "model": self.model,
            "is_baseline": self.is_baseline,
            "model_version": self.model_version,
            "metrics": self.metrics,
            "feature_columns": FEATURE_COLUMNS,
        }
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(payload, path)

    def load(self, path: str | Path) -> None:
        payload = joblib.load(path)
        self.model = payload.get("model")
        self.is_baseline = bool(payload.get("is_baseline", self.model is None))
        self.model_version = str(payload.get("model_version", "unknown"))
        self.metrics = dict(payload.get("metrics") or {})

    @staticmethod
    def _get_risk_level(probability: float) -> RiskLevel:
        if probability >= 0.7:
            return "critical"
        if probability >= 0.4:
            return "at_risk"
        return "healthy"

    def _predict_proba(self, frame: pd.DataFrame) -> np.ndarray:
        if self.is_baseline or self.model is None:
            return self._baseline_probabilities(frame)
        return self.model.predict_proba(frame[FEATURE_COLUMNS])[:, 1]

    @staticmethod
    def _baseline_probabilities(frame: pd.DataFrame) -> np.ndarray:
        probs: list[float] = []
        for _, row in frame.iterrows():
            payment_failures = float(row.get("payment_failure_count_30d") or 0)
            cadence_drift = float(row.get("cadence_drift_days") or 0)
            skips = float(row.get("skip_count_90d") or 0)
            if payment_failures > 0:
                probs.append(0.8)
            elif cadence_drift > 14:
                probs.append(0.6)
            elif skips > 2:
                probs.append(0.5)
            else:
                probs.append(0.1)
        return np.asarray(probs, dtype=float)

    @staticmethod
    def _prepare_frame(frame: pd.DataFrame) -> pd.DataFrame:
        prepared = frame.copy()
        bool_cols = ["sms_opt_out", "has_swapped_products"]
        for column in FEATURE_COLUMNS:
            if column in bool_cols:
                prepared[column] = prepared[column].fillna(False).astype(int)
            else:
                prepared[column] = pd.to_numeric(
                    prepared[column],
                    errors="coerce",
                ).fillna(0.0)
        return prepared

    @staticmethod
    def _score_predictions(y_true: np.ndarray, probs: np.ndarray) -> dict[str, float]:
        preds = (probs >= 0.5).astype(int)
        # Guard single-class AUC.
        if len(np.unique(y_true)) < 2:
            auc = 0.0
        else:
            auc = float(roc_auc_score(y_true, probs))
        return {
            "precision": float(precision_score(y_true, preds, zero_division=0)),
            "recall": float(recall_score(y_true, preds, zero_division=0)),
            "f1": float(f1_score(y_true, preds, zero_division=0)),
            "auc": auc,
        }
