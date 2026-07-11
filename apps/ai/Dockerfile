# syntax=docker/dockerfile:1
# Build context MUST be the repository root:
#   docker build -f apps/ai/Dockerfile .
#
# Railway: Root directory = / (repo root), config = /apps/ai/railway.toml

FROM python:3.11-slim AS builder
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*
COPY apps/ai/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runner
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV HOST=0.0.0.0
ENV MODELS_URI_PREFIX=/app/models/churn
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r retain && useradd -r -g retain retain
COPY --from=builder /install /usr/local
COPY apps/ai/src ./src
COPY apps/ai/pyproject.toml ./pyproject.toml
COPY apps/ai/models ./models
RUN chown -R retain:retain /app
USER retain
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
