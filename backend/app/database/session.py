from __future__ import annotations

import logging
import ssl
from typing import Any, Dict, Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.core.config import settings

logger = logging.getLogger("blueberry.database")

connect_args: Dict[str, Any] = {}
if settings.MYSQL_SSL:
    if settings.MYSQL_SSL_CA:
        connect_args["ssl"] = {"ca": settings.MYSQL_SSL_CA}
    else:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ctx

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_size=settings.MYSQL_POOL_SIZE,
    max_overflow=settings.MYSQL_MAX_OVERFLOW,
    pool_recycle=settings.MYSQL_POOL_RECYCLE,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """Verify active MySQL connection and return connectivity metadata."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            res = conn.execute(text("SELECT VERSION() AS ver, DATABASE() AS db_name;")).fetchone()
            return {
                "connected": True,
                "version": res[0] if res else "Unknown",
                "database": res[1] if res else settings.MYSQL_DATABASE,
                "host": settings.MYSQL_HOST,
                "port": settings.MYSQL_PORT,
            }
    except Exception as e:
        logger.error("MySQL connection check failed: %s", e)
        return {
            "connected": False,
            "error": str(e),
            "host": settings.MYSQL_HOST,
            "port": settings.MYSQL_PORT,
        }

