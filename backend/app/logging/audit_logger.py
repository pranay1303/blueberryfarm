from __future__ import annotations

import json
import logging
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import ist_now_iso, settings
from app.database.session import SessionLocal
from app.models.sql_models import AuditLog

SENSITIVE_KEY_FRAGMENTS = (
    "password",
    "token",
    "secret",
    "jwt",
    "authorization",
    "cookie",
    "hash",
    "credential",
    "api_key",
)

_log_lock = threading.RLock()


def sanitize_metadata(data: Any) -> Any:
    """Recursively strip sensitive keys before logging."""
    if isinstance(data, dict):
        cleaned: Dict[str, Any] = {}
        for k, v in data.items():
            kl = str(k).lower()
            if any(frag in kl for frag in SENSITIVE_KEY_FRAGMENTS):
                cleaned[k] = "[REDACTED]"
            else:
                cleaned[k] = sanitize_metadata(v)
        return cleaned
    if isinstance(data, list):
        return [sanitize_metadata(item) for item in data]
    return data


def _append_jsonl(log_file: Path, record: Dict[str, Any]) -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
    with _log_lock:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line)
            f.flush()


def log_event(
    log_type: str,
    *,
    action: str,
    module: str,
    result: str = "success",
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    record_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Append an audit/log event both to logs/{log_type}.jsonl AND persist into MySQL audit_logs table.
    log_type must be one of: application, activity, security, error
    """
    if log_type not in {"application", "activity", "security", "error"}:
        log_type = "application"

    evt_id = f"EVT-{uuid.uuid4().hex[:12].upper()}"
    ts = ist_now_iso()
    clean_meta = sanitize_metadata(metadata or {})

    event = {
        "event_id": evt_id,
        "timestamp": ts,
        "user_id": user_id or "system",
        "username": username or "system",
        "action": action,
        "module": module,
        "record_id": record_id or "",
        "result": result,
        "metadata": clean_meta,
    }
    _append_jsonl(settings.LOGS_DIR / f"{log_type}.jsonl", event)

    # Persist in MySQL audit_logs
    try:
        db = SessionLocal()
        try:
            audit_entry = AuditLog(
                id=evt_id,
                user_id=user_id if user_id and user_id != "system" else None,
                username=username or "system",
                action=action,
                module=module,
                record_id=str(record_id) if record_id else None,
                result=result.upper(),
                metadata_json=clean_meta,
            )
            db.add(audit_entry)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    except Exception:
        pass

    return event


def log_activity(
    *,
    action: str,
    module: str,
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    record_id: Optional[str] = None,
    result: str = "success",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return log_event(
        "activity",
        action=action,
        module=module,
        result=result,
        user_id=user_id,
        username=username,
        record_id=record_id,
        metadata=metadata,
    )


def log_security(
    *,
    action: str,
    module: str = "auth",
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    record_id: Optional[str] = None,
    result: str = "success",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return log_event(
        "security",
        action=action,
        module=module,
        result=result,
        user_id=user_id,
        username=username,
        record_id=record_id,
        metadata=metadata,
    )


def log_error(
    *,
    action: str,
    module: str,
    error_message: str,
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    record_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    meta = dict(metadata or {})
    meta["error"] = error_message
    return log_event(
        "error",
        action=action,
        module=module,
        result="error",
        user_id=user_id,
        username=username,
        record_id=record_id,
        metadata=meta,
    )


def log_application(
    *,
    action: str,
    module: str = "system",
    result: str = "info",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return log_event(
        "application",
        action=action,
        module=module,
        result=result,
        metadata=metadata,
    )


def query_logs(
    log_type: str = "activity",
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    module: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    # Query directly from MySQL audit_logs table with fallback to jsonl
    try:
        db = SessionLocal()
        try:
            q = db.query(AuditLog)
            if username:
                q = q.filter(AuditLog.username.ilike(f"%{username}%"))
            if module:
                q = q.filter(AuditLog.module == module)
            if action:
                q = q.filter(AuditLog.action.ilike(f"%{action}%"))
            if user_id:
                q = q.filter(AuditLog.user_id == user_id)
            if date_from:
                q = q.filter(AuditLog.timestamp >= f"{date_from} 00:00:00")
            if date_to:
                q = q.filter(AuditLog.timestamp <= f"{date_to} 23:59:59")

            total = q.count()
            rows = q.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
            items = [
                {
                    "event_id": r.id,
                    "timestamp": r.timestamp.isoformat() if r.timestamp else "",
                    "user_id": r.user_id or "system",
                    "username": r.username or "system",
                    "action": r.action,
                    "module": r.module,
                    "record_id": r.record_id or "",
                    "result": r.result,
                    "metadata": r.metadata_json or {},
                }
                for r in rows
            ]
            if total > 0 or not (settings.LOGS_DIR / f"{log_type}.jsonl").exists():
                return {"items": items, "total": total}
        finally:
            db.close()
    except Exception:
        pass

    # JSONL Fallback (whitelist log_type to prevent path traversal)
    safe_log_type = log_type if log_type in {"application", "activity", "security", "error"} else "activity"
    log_file = settings.LOGS_DIR / f"{safe_log_type}.jsonl"
    if not log_file.exists():
        return {"items": [], "total": 0}

    matched: List[Dict[str, Any]] = []
    with _log_lock:
        lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()

    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue

        ts = str(item.get("timestamp", ""))
        date_part = ts[:10]
        if date_from and date_part < date_from:
            continue
        if date_to and date_part > date_to:
            continue
        if user_id and item.get("user_id") != user_id:
            continue
        if username and username.lower() not in str(item.get("username", "")).lower():
            continue
        if module and item.get("module") != module:
            continue
        if action and action.lower() not in str(item.get("action", "")).lower():
            continue
        matched.append(item)

    total = len(matched)
    return {"items": matched[offset : offset + limit], "total": total}


def configure_python_logging() -> logging.Logger:
    logger = logging.getLogger("blueberry")
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        logger.addHandler(handler)
    return logger


app_logger = configure_python_logging()
