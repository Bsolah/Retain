from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(
    title="Retain AI",
    description="AI service for Retain: Revenue Multiplier",
    version="0.0.0",
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
