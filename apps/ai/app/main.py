"""Backward-compatible entrypoint. Prefer `src.main:app`. """

from src.main import app

__all__ = ["app"]
