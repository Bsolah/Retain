#!/bin/sh
set -eu

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

echo "Starting Retain AI on ${HOST}:${PORT} (ENABLE_SCHEDULER=${ENABLE_SCHEDULER:-false})"
exec uvicorn src.main:app --host "${HOST}" --port "${PORT}" --log-level info
