import os
import sys
from pathlib import Path

import pytest

# Ensure backend/ is importable
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data_dir = tmp_path / "data"
    logs_dir = tmp_path / "logs"
    storage_dir = tmp_path / "storage"

    from app.core.config import settings
    from app.authentication import security

    monkeypatch.setattr(settings, "DATA_DIR", data_dir)
    monkeypatch.setattr(settings, "LOGS_DIR", logs_dir)
    monkeypatch.setattr(settings, "STORAGE_DIR", storage_dir)
    monkeypatch.setattr(settings, "QUOTATIONS_DIR", storage_dir / "quotations")
    monkeypatch.setattr(settings, "INVOICES_DIR", storage_dir / "invoices")
    monkeypatch.setattr(settings, "RECEIPTS_DIR", storage_dir / "receipts")
    monkeypatch.setattr(settings, "ATTACHMENTS_DIR", storage_dir / "attachments")
    monkeypatch.setattr(settings, "BACKUPS_DIR", storage_dir / "backups")
    monkeypatch.setattr(settings, "_jwt_secret", "test-secret-key-at-least-32-characters-long-12345")

    settings.ensure_directories()
    security._failed_attempts.clear()

    from app.services.seed_service import ensure_initial_data
    ensure_initial_data()
    return tmp_path

