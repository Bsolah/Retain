from collections.abc import Iterator
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> Iterator[TestClient]:
    mock_settings = MagicMock()
    mock_settings.enable_scheduler = False

    with patch("src.main.get_settings", return_value=mock_settings):
        from src.main import app

        with TestClient(app) as test_client:
            yield test_client
