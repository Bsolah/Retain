"""Model artifact storage (S3 with local filesystem fallback)."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from urllib.parse import urlparse

from src.config import get_settings

logger = logging.getLogger(__name__)


def model_uri(version: str) -> str:
    settings = get_settings()
    prefix = settings.models_uri_prefix.rstrip("/")
    return f"{prefix}/{version}.joblib"


def save_model_artifact(local_path: Path, version: str) -> str:
    """Persist a local joblib file to S3 or the local models directory.

    Returns the canonical path/URI stored in the registry.
    """
    uri = model_uri(version)
    parsed = urlparse(uri)
    if parsed.scheme == "s3":
        return _upload_s3(local_path, parsed.netloc, parsed.path.lstrip("/"))
    # file:// or plain path
    destination = Path(parsed.path if parsed.scheme == "file" else uri)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(local_path.read_bytes())
    return str(destination)


def load_model_artifact(path_or_uri: str, destination: Path) -> Path:
    parsed = urlparse(path_or_uri)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if parsed.scheme == "s3":
        _download_s3(parsed.netloc, parsed.path.lstrip("/"), destination)
        return destination

    source = Path(parsed.path if parsed.scheme == "file" else path_or_uri)
    if not source.exists():
        raise FileNotFoundError(f"Model artifact not found: {path_or_uri}")
    destination.write_bytes(source.read_bytes())
    return destination


def _upload_s3(local_path: Path, bucket: str, key: str) -> str:
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is required for S3 model storage") from exc

    settings = get_settings()
    client = boto3.client(
        "s3",
        endpoint_url=settings.aws_endpoint_url or None,
        region_name=settings.aws_region,
    )
    client.upload_file(str(local_path), bucket, key)
    uri = f"s3://{bucket}/{key}"
    logger.info("Uploaded model artifact to %s", uri)
    return uri


def _download_s3(bucket: str, key: str, destination: Path) -> None:
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is required for S3 model storage") from exc

    settings = get_settings()
    client = boto3.client(
        "s3",
        endpoint_url=settings.aws_endpoint_url or None,
        region_name=settings.aws_region,
    )
    client.download_file(bucket, key, str(destination))


def safe_version(version: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "-", version)
