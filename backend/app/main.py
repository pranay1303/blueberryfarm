from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import (
    addons,
    admin_ops,
    analytics_reports,
    auth,
    bookings,
    customers,
    dashboard,
    enquiry_ops,
    expenses,
    invoices,
    meals,
    notifications,
    packages,
    payments,
    public_portal,
    quotations,
    rooms,
    staff,
    vehicle_ops,
    website_cms,
)
from app.core.config import ist_now, settings
from app.database.seed import seed_database
from app.database.session import SessionLocal, check_database_connection
from app.logging.audit_logger import log_application, log_error


async def _auto_backup_loop() -> None:
    while True:
        try:
            if settings.AUTO_BACKUP_ENABLED:
                db = SessionLocal()
                try:
                    from app.models.sql_models import BackupRecord
                    cutoff = ist_now() - timedelta(hours=settings.BACKUP_INTERVAL_HOURS)
                    recent = (
                        db.query(BackupRecord)
                        .filter(BackupRecord.created_at >= cutoff)
                        .order_by(BackupRecord.created_at.desc())
                        .first()
                    )
                    if not recent:
                        admin_ops.create_mysql_backup_file(reason="auto_daily", username="scheduler", db=db)
                        log_application(
                            action="auto_backup_completed",
                            module="backups",
                            metadata={"type": "mysql_dump"},
                        )
                finally:
                    db.close()
        except Exception as exc:
            log_error(action="auto_backup_failed", module="backups", error_message=str(exc))

        await asyncio.sleep(settings.BACKUP_INTERVAL_HOURS * 3600)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Ensure MySQL database is connected & seeded
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    log_application(action="server_started", module="system", metadata={"env": settings.APP_ENV, "db": "mysql"})
    import os
    task = None if os.getenv("VERCEL") else asyncio.create_task(_auto_backup_loop())
    try:
        yield
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Blueberry Farm and Resort Management API",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log_error(
        action="unhandled_exception",
        module="api",
        error_message=str(exc),
        metadata={"path": request.url.path, "method": request.method},
    )
    detail = "An internal server error occurred." if settings.APP_ENV == "production" else f"An internal server error occurred: {str(exc)}"
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/api/health")
def health_check() -> dict[str, Any]:
    db_status = check_database_connection()
    return {
        "status": "ok" if db_status.get("connected") else "degraded",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": db_status,
        "storage": {
            "quotations_dir": settings.QUOTATIONS_DIR.exists(),
            "invoices_dir": settings.INVOICES_DIR.exists(),
            "receipts_dir": settings.RECEIPTS_DIR.exists(),
            "backups_dir": settings.BACKUPS_DIR.exists(),
        },
    }


# Include Public Customer Portal Routers
app.include_router(public_portal.router)
app.include_router(website_cms.router)

# Include Admin Portal Routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(enquiry_ops.router)
app.include_router(vehicle_ops.router)
app.include_router(rooms.router)
app.include_router(meals.router)
app.include_router(addons.router)
app.include_router(staff.router)
app.include_router(customers.router)
app.include_router(packages.router)
app.include_router(bookings.router)
app.include_router(quotations.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(expenses.router)
app.include_router(analytics_reports.router)
app.include_router(analytics_reports.reports_router)
app.include_router(admin_ops.router)
app.include_router(notifications.router)

# Serve built frontend SPA in production if frontend/dist exists
FRONTEND_DIST = settings.BASE_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "API endpoint not found."})  # type: ignore[return-value]
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_relative_to(FRONTEND_DIST.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
