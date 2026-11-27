from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import ist_now_iso, settings
from app.database.session import SessionLocal, get_db
from app.models.sql_models import BusinessSetting, User

logger = logging.getLogger("blueberry.security")

ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)
bearer_scheme = HTTPBearer(auto_error=False)

ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "OWNER_ADMIN": {"*"},
    "MANAGER": {
        "dashboard:view",
        "customers:read",
        "customers:write",
        "vehicles:read",
        "vehicles:write",
        "enquiries:read",
        "enquiries:write",
        "bookings:read",
        "bookings:write",
        "bookings:cancel",
        "packages:read",
        "packages:write",
        "quotations:read",
        "quotations:write",
        "invoices:read",
        "payments:read",
        "expenses:read",
        "reports:view",
        "analytics:view",
    },
    "RECEPTION_STAFF": {
        "dashboard:view",
        "customers:read",
        "customers:write",
        "vehicles:read",
        "vehicles:write",
        "enquiries:read",
        "enquiries:write",
        "bookings:read",
        "bookings:write",
        "packages:read",
        "quotations:read",
        "quotations:write",
        "invoices:read",
    },
    "ACCOUNTS_STAFF": {
        "dashboard:view",
        "reports:view",
        "invoices:read",
        "invoices:write",
        "payments:read",
        "payments:write",
        "expenses:read",
        "expenses:write",
    },
}

_rate_limit_lock = threading.Lock()
_login_attempts: Dict[str, List[float]] = {}


def hash_password(plain: str) -> str:
    return ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def check_login_rate_limit(client_ip: str) -> None:
    now = time.time()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    max_attempts = settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS

    with _rate_limit_lock:
        timestamps = _login_attempts.get(client_ip, [])
        timestamps = [t for t in timestamps if now - t < window]
        if len(timestamps) >= max_attempts:
            retry_after = int(window - (now - timestamps[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Please retry after {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
        _login_attempts[client_ip] = timestamps


def record_failed_login(client_ip: str) -> None:
    with _rate_limit_lock:
        _login_attempts.setdefault(client_ip, []).append(time.time())


def clear_failed_logins(client_ip: str) -> None:
    with _rate_limit_lock:
        _login_attempts.pop(client_ip, None)


def has_permission(role: str, permission: str) -> bool:
    perms = ROLE_PERMISSIONS.get(role, set())
    if "*" in perms:
        return True
    if permission in perms:
        return True
    mod = permission.split(":")[0] + ":*"
    return mod in perms


def create_access_token(user: Dict[str, Any], session_id: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "full_name": user.get("full_name"),
        "role": user["role"],
        "sid": session_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def _get_active_sessions_doc(db: Session) -> Dict[str, Any]:
    import copy
    setting = db.query(BusinessSetting).filter(BusinessSetting.key == "active_sessions_meta").first()
    if not setting:
        setting = BusinessSetting(key="active_sessions_meta", value_json={"active_sessions": {}, "revoked_jtis": []})
        db.add(setting)
        db.commit()
    return copy.deepcopy(setting.value_json) if setting.value_json else {"active_sessions": {}, "revoked_jtis": []}


def _save_active_sessions_doc(db: Session, data: Dict[str, Any]) -> None:
    import copy
    from sqlalchemy.orm.attributes import flag_modified
    setting = db.query(BusinessSetting).filter(BusinessSetting.key == "active_sessions_meta").first()
    if setting:
        setting.value_json = copy.deepcopy(data)
        flag_modified(setting, "value_json")
        db.commit()


def create_refresh_token(user: Dict[str, Any], session_id: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = uuid.uuid4().hex
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "sid": session_id,
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }

    db = SessionLocal()
    try:
        data = _get_active_sessions_doc(db)
        sessions = data.setdefault("active_sessions", {})
        sessions[session_id] = {
            "user_id": user["id"],
            "username": user["username"],
            "jti": jti,
            "created_at": ist_now_iso(),
            "expires_at": exp.isoformat(),
        }
        _save_active_sessions_doc(db, data)
    finally:
        db.close()

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def revoke_session(session_id: Optional[str] = None, jti: Optional[str] = None) -> None:
    if not session_id and not jti:
        return

    db = SessionLocal()
    try:
        data = _get_active_sessions_doc(db)
        sessions = data.setdefault("active_sessions", {})
        revoked = data.setdefault("revoked_jtis", [])
        if session_id and session_id in sessions:
            sess = sessions.pop(session_id)
            if sess.get("jti") and sess["jti"] not in revoked:
                revoked.append(sess["jti"])
        if jti and jti not in revoked:
            revoked.append(jti)
        if len(revoked) > 2000:
            data["revoked_jtis"] = revoked[-2000:]
        _save_active_sessions_doc(db, data)
    finally:
        db.close()


def revoke_all_user_sessions(user_id: str) -> None:
    db = SessionLocal()
    try:
        data = _get_active_sessions_doc(db)
        sessions = data.setdefault("active_sessions", {})
        revoked = data.setdefault("revoked_jtis", [])
        to_remove = [sid for sid, s in sessions.items() if s.get("user_id") == user_id]
        for sid in to_remove:
            sess = sessions.pop(sid)
            if sess.get("jti") and sess["jti"] not in revoked:
                revoked.append(sess["jti"])
        _save_active_sessions_doc(db, data)
    finally:
        db.close()


def is_session_valid(session_id: Optional[str], jti: Optional[str] = None) -> bool:
    if not session_id and not jti:
        return False
    db = SessionLocal()
    try:
        data = _get_active_sessions_doc(db)
        revoked = set(data.get("revoked_jtis", []))
        if jti and jti in revoked:
            return False
        sessions = data.get("active_sessions", {})
        if session_id and session_id not in sessions:
            return False
        return True
    finally:
        db.close()


def decode_token(token: str, expected_type: str = "access") -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        ) from exc

    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
        )

    if not is_session_valid(payload.get("sid"), payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please log in again.",
        )
    return payload


def sanitize_user_public(user: Any) -> Dict[str, Any]:
    """Never expose password hashes."""
    if isinstance(user, dict):
        uid = user.get("id")
        uname = user.get("username")
        email = user.get("email")
        fname = user.get("full_name")
        role = user.get("role", "RECEPTION_STAFF")
        active = user.get("is_active", True)
    else:
        uid = str(user.id)
        uname = str(user.username)
        email = getattr(user, "email", None)
        fname = str(user.full_name)
        role = str(user.role)
        active = bool(user.is_active)

    return {
        "id": uid,
        "username": uname,
        "email": email,
        "full_name": fname,
        "role": role,
        "is_active": active,
        "permissions": sorted(ROLE_PERMISSIONS.get(role, set())),
    }


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="blueberry_refresh",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key="blueberry_refresh", path="/")


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    token: Optional[str] = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    elif request.cookies.get("blueberry_access"):
        token = request.cookies.get("blueberry_access")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    payload = decode_token(token, expected_type="access")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or no longer exists.",
        )

    return {
        "id": str(user.id),
        "username": str(user.username),
        "email": str(user.email),
        "full_name": str(user.full_name),
        "role": str(user.role),
        "is_active": bool(user.is_active),
        "_session_id": payload.get("sid"),
    }


def require_permission(permission: str) -> Callable[..., Dict[str, Any]]:
    def _dep(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if not has_permission(current_user["role"], permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires '{permission}'.",
            )
        return current_user

    return _dep


def require_owner(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "OWNER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Owner / Super Admin only.",
        )
    return current_user
