from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.config import get_settings
from src.db import check_db, close_pool, get_pool, init_pool
from src.features.engineer import FeatureEngineer
from src.interventions.engine import InterventionEngine
from src.jobs.daily_features import run_shop_feature_job
from src.jobs.train_model import run_training
from src.models.predictor_service import (
    clear_predictor_cache,
    get_latest_prediction,
    predict_contract,
    predict_contracts,
)
from src.models.registry import deploy_model, get_model_by_version
from src.redis_client import check_redis, close_redis, init_redis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


class GenerateFeaturesRequest(BaseModel):
    shop_id: str = Field(..., min_length=1)


class TrainModelRequest(BaseModel):
    shop_id: str | None = None
    retrain_all: bool = False
    deploy: bool = True
    rollout_percentage: int = Field(default=100, ge=0, le=100)


class DeployModelRequest(BaseModel):
    rollout_percentage: int = Field(default=100, ge=0, le=100)
    shop_id: str | None = None


class BatchPredictRequest(BaseModel):
    contract_ids: list[str] = Field(..., min_length=1)


class EvaluateInterventionRequest(BaseModel):
    contract_id: str = Field(..., min_length=1)
    prediction: dict[str, Any] | None = None


class EvaluateBatchRequest(BaseModel):
    shop_id: str = Field(..., min_length=1)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    scheduler_task: asyncio.Task[None] | None = None

    async def boot_scheduler() -> None:
        if not settings.enable_scheduler:
            logger.info("APScheduler disabled (ENABLE_SCHEDULER=false)")
            return

        try:
            await init_pool()
            await init_redis()
            scheduler.add_job(
                run_daily_features_safe,
                trigger="cron",
                hour=2,
                minute=0,
                id="daily_features",
                replace_existing=True,
            )
            scheduler.start()
            logger.info("APScheduler started (daily features at 02:00 UTC)")
        except Exception:
            logger.exception(
                "Scheduler startup failed; liveness /health remains available",
            )

    # Do not block HTTP startup on Postgres/Redis — Railway healthchecks /health first.
    scheduler_task = asyncio.create_task(boot_scheduler())

    try:
        yield
    finally:
        if scheduler_task is not None:
            scheduler_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await scheduler_task
        if scheduler.running:
            scheduler.shutdown(wait=False)
        await close_redis()
        await close_pool()


async def run_daily_features_safe() -> None:
    from src.jobs.daily_features import run_daily_feature_job

    try:
        await run_daily_feature_job()
    except Exception:
        logger.exception("Scheduled daily feature job failed")


app = FastAPI(
    title="Retain AI",
    description="AI service for Retain: Revenue Multiplier",
    version="0.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "service": "ai",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.get("/features/health")
async def features_health() -> dict[str, Any]:
    db_ok = False
    redis_ok = False
    errors: list[str] = []

    try:
        db_ok = await check_db()
    except Exception as exc:
        errors.append(f"database: {exc}")

    try:
        redis_ok = await check_redis()
    except Exception as exc:
        errors.append(f"redis: {exc}")

    status = "ok" if db_ok and redis_ok else "degraded"
    payload: dict[str, Any] = {
        "status": status,
        "database": "up" if db_ok else "down",
        "redis": "up" if redis_ok else "down",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if errors:
        payload["errors"] = errors
    if status != "ok":
        raise HTTPException(status_code=503, detail=payload)
    return payload


@app.post("/features/generate")
async def generate_features(body: GenerateFeaturesRequest) -> dict[str, Any]:
    try:
        return await run_shop_feature_job(body.shop_id)
    except Exception as exc:
        logger.exception("Manual feature generation failed for shop %s", body.shop_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/features/{contract_id}")
async def get_features(contract_id: str) -> dict[str, Any]:
    pool = await get_pool()
    engineer = FeatureEngineer(pool)
    signals = await engineer.get_latest_signals(contract_id)
    if signals is None:
        raise HTTPException(status_code=404, detail="Signals not found")
    return signals


@app.post("/models/train")
async def train_model(body: TrainModelRequest) -> dict[str, Any]:
    try:
        result = await run_training(
            shop_id=body.shop_id,
            retrain_all=body.retrain_all,
            deploy=body.deploy,
            rollout_percentage=body.rollout_percentage,
        )
        clear_predictor_cache()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Training failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/models/{version}/metrics")
async def model_metrics(version: str) -> dict[str, Any]:
    pool = await get_pool()
    record = await get_model_by_version(pool, version)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    return {
        "version": record["version"],
        "metrics": record["metrics"],
        "path": record["path"],
        "is_active": record["is_active"],
        "rollout_percentage": record["rollout_percentage"],
        "shop_id": record["shop_id"],
        "created_at": record["created_at"],
    }


@app.post("/models/{version}/deploy")
async def deploy_model_endpoint(
    version: str,
    body: DeployModelRequest,
) -> dict[str, Any]:
    pool = await get_pool()
    try:
        record = await deploy_model(
            pool,
            version=version,
            rollout_percentage=body.rollout_percentage,
            shop_id=body.shop_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    clear_predictor_cache()
    return record


@app.get("/predictions/{contract_id}")
async def get_prediction(contract_id: str) -> dict[str, Any]:
    latest = await get_latest_prediction(contract_id)
    if latest is not None:
        return latest
    try:
        return await predict_contract(contract_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Prediction failed for %s", contract_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/predictions/batch")
async def batch_predictions(body: BatchPredictRequest) -> dict[str, Any]:
    results = await predict_contracts(body.contract_ids)
    return {
        "count": len(results),
        "predictions": results,
    }


@app.post("/interventions/evaluate")
async def evaluate_intervention(
    body: EvaluateInterventionRequest,
) -> dict[str, Any]:
    pool = await get_pool()
    engine = InterventionEngine(pool)
    prediction = body.prediction
    if prediction is None:
        prediction = await predict_contract(body.contract_id)
    try:
        return await engine.evaluate_and_intervene(body.contract_id, prediction)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Intervention evaluate failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/interventions/evaluate-batch")
async def evaluate_interventions_batch(
    body: EvaluateBatchRequest,
) -> dict[str, Any]:
    pool = await get_pool()
    engine = InterventionEngine(pool)
    try:
        return await engine.evaluate_batch(body.shop_id)
    except Exception as exc:
        logger.exception("Batch intervention evaluate failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/interventions/{intervention_id}/status")
async def intervention_status(intervention_id: str) -> dict[str, Any]:
    pool = await get_pool()
    engine = InterventionEngine(pool)
    record = await engine.get_intervention(intervention_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Intervention not found")
    return record


@app.post("/interventions/{intervention_id}/accept")
async def accept_intervention(intervention_id: str) -> dict[str, Any]:
    pool = await get_pool()
    engine = InterventionEngine(pool)
    try:
        return await engine.accept_intervention(intervention_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/interventions/{intervention_id}/decline")
async def decline_intervention(intervention_id: str) -> dict[str, Any]:
    pool = await get_pool()
    engine = InterventionEngine(pool)
    try:
        return await engine.decline_intervention(intervention_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
