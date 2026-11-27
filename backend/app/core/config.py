from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

try:
    from zoneinfo import ZoneInfo

    IST_TZ = ZoneInfo("Asia/Kolkata")
except Exception:
    IST_TZ = timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")


def ist_now() -> datetime:
    """Return current datetime in Asia/Kolkata (+05:30) timezone."""
    return datetime.now(timezone.utc).astimezone(IST_TZ)


def ist_now_iso() -> str:
    """Return ISO 8601 timestamp string in Asia/Kolkata timezone."""
    return ist_now().isoformat()


def today_ist_str() -> str:
    """Return YYYY-MM-DD in IST."""
    return ist_now().strftime("%Y-%m-%d")


def _load_dotenv(env_path: Path) -> None:
    if not env_path.exists():
        return
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


DEFAULT_ROOT_DIR = Path(__file__).resolve().parents[3]
_load_dotenv(DEFAULT_ROOT_DIR / ".env")


class Settings:
    def __init__(self) -> None:
        self.APP_NAME: str = os.getenv("APP_NAME", "Blueberry Farm and Resort")
        self.APP_VERSION: str = "2.0.0"
        self.APP_ENV: str = os.getenv("APP_ENV", "development")
        self.APP_TIMEZONE: str = os.getenv("APP_TIMEZONE", "Asia/Kolkata")

        self.BASE_DIR: Path = Path(os.getenv("BLUEBERRY_BASE_DIR", str(DEFAULT_ROOT_DIR))).resolve()
        is_vercel = bool(os.getenv("VERCEL"))
        default_data = "/tmp/blueberry/data" if is_vercel else "data"
        default_logs = "/tmp/blueberry/logs" if is_vercel else "logs"
        default_storage = "/tmp/blueberry/storage" if is_vercel else "storage"
        default_attach = "/tmp/blueberry/storage/attachments" if is_vercel else "storage/attachments"
        default_backups = "/tmp/blueberry/storage/backups" if is_vercel else "storage/backups"

        self.DATA_DIR: Path = self._resolve_dir(os.getenv("DATA_DIR", default_data))
        self.LOGS_DIR: Path = self._resolve_dir(os.getenv("LOGS_DIR", default_logs))
        self.STORAGE_DIR: Path = self._resolve_dir(os.getenv("STORAGE_DIR", default_storage))

        self.QUOTATIONS_DIR: Path = self.STORAGE_DIR / "quotations"
        self.INVOICES_DIR: Path = self.STORAGE_DIR / "invoices"
        self.RECEIPTS_DIR: Path = self.STORAGE_DIR / "receipts"
        self.ATTACHMENTS_DIR: Path = self._resolve_dir(os.getenv("ATTACHMENTS_DIR", default_attach))
        self.BACKUPS_DIR: Path = self._resolve_dir(os.getenv("BACKUPS_DIR", default_backups))

        self.PDF_ASSETS_DIR: Path = Path(__file__).resolve().parents[1] / "pdf" / "assets"
        self.BRANDING_DIR: Path = self.BASE_DIR / "assets" / "branding"

        # MySQL Configuration
        self.MYSQL_HOST: str = os.getenv("MYSQL_HOST", "127.0.0.1")
        self.MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3306"))
        self.MYSQL_DATABASE: str = os.getenv("MYSQL_DATABASE", "blueberry_resort")
        self.MYSQL_USER: str = os.getenv("MYSQL_USER", "blueberry_app")
        self.MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "Blueberry@Secure2026")
        self.MYSQL_SSL: bool = os.getenv("MYSQL_SSL", "false").lower() == "true"
        self.MYSQL_SSL_CA: str = os.getenv("MYSQL_SSL_CA", "")
        self.MYSQL_POOL_SIZE: int = int(os.getenv("MYSQL_POOL_SIZE", "10"))
        self.MYSQL_MAX_OVERFLOW: int = int(os.getenv("MYSQL_MAX_OVERFLOW", "20"))
        self.MYSQL_POOL_RECYCLE: int = int(os.getenv("MYSQL_POOL_RECYCLE", "3600"))

        self.ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
        self.REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
        self.COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"

        cors_raw = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
        )
        self.CORS_ORIGINS: List[str] = [o.strip() for o in cors_raw.split(",") if o.strip()]

        self.AUTO_BACKUP_ENABLED: bool = os.getenv("AUTO_BACKUP_ENABLED", "true").lower() == "true"
        self.BACKUP_INTERVAL_HOURS: int = int(os.getenv("BACKUP_INTERVAL_HOURS", "24"))

        self.LOGIN_RATE_LIMIT_MAX_ATTEMPTS: int = int(os.getenv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "5"))
        self.LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "300"))

        self._jwt_secret: str | None = os.getenv("JWT_SECRET_KEY")

    @property
    def DATABASE_URL(self) -> str:
        # Standard SQLAlchemy pymysql connection URL with utf8mb4 encoding
        import urllib.parse
        encoded_password = urllib.parse.quote_plus(self.MYSQL_PASSWORD)
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{encoded_password}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
            "?charset=utf8mb4"
        )

    def _resolve_dir(self, value: str) -> Path:
        p = Path(value)
        if p.is_absolute():
            return p
        return (self.BASE_DIR / p).resolve()

    def ensure_directories(self) -> None:
        for d in [
            self.DATA_DIR,
            self.LOGS_DIR,
            self.STORAGE_DIR,
            self.QUOTATIONS_DIR,
            self.INVOICES_DIR,
            self.RECEIPTS_DIR,
            self.ATTACHMENTS_DIR,
            self.BACKUPS_DIR,
            self.PDF_ASSETS_DIR,
            self.BRANDING_DIR,
        ]:
            try:
                d.mkdir(parents=True, exist_ok=True)
            except OSError:
                pass

    @property
    def JWT_SECRET_KEY(self) -> str:
        if self._jwt_secret and self._jwt_secret != "change-this-to-a-long-random-secret-key-at-least-32-chars":
            return self._jwt_secret
        secret_file = self.STORAGE_DIR / ".jwt_secret"
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        if secret_file.exists():
            val = secret_file.read_text(encoding="utf-8").strip()
            if len(val) >= 32:
                self._jwt_secret = val
                return val
        generated = secrets.token_urlsafe(48)
        secret_file.write_text(generated, encoding="utf-8")
        self._jwt_secret = generated
        return generated


settings = Settings()
settings.ensure_directories()
