from __future__ import annotations

import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.authentication.security import (
    check_login_rate_limit,
    clear_failed_logins,
    clear_refresh_cookie,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    record_failed_login,
    revoke_all_user_sessions,
    revoke_session,
    sanitize_user_public,
    set_refresh_cookie,
    verify_password,
)
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_security
from app.models.sql_models import Role, User
from app.schemas.requests import (
    ChangeOwnPasswordRequest,
    LoginRequest,
    RefreshRequest,
    SetupOwnerRequest,
)
from app.validations.validators import clean_str

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.get("/setup-status")
def get_setup_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    count = db.query(User).count()
    return {"needs_initial_setup": count == 0}


@router.post("/setup-owner", status_code=status.HTTP_201_CREATED)
def setup_initial_owner(
    payload: SetupOwnerRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    username = (clean_str(payload.username) or "").lower()
    full_name = clean_str(payload.full_name) or ""
    if not username or len(username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters.")

    existing_count = db.query(User).count()
    if existing_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Initial owner account already exists. Please log in.",
        )

    owner_role = db.query(Role).filter(Role.name == "OWNER_ADMIN").first()
    new_user = User(
        username=username,
        email=clean_str(payload.email) or f"{username}@blueberryfarmandresort.com",
        full_name=full_name,
        password_hash=hash_password(payload.password),
        role="OWNER_ADMIN",
        role_id=owner_role.id if owner_role else None,
        is_active=True,
    )
    db.add(new_user)
    db.commit()

    user_dict = {
        "id": new_user.id,
        "username": new_user.username,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "role": new_user.role,
        "is_active": new_user.is_active,
    }

    session_id = uuid.uuid4().hex
    access_token = create_access_token(user_dict, session_id)
    refresh_token = create_refresh_token(user_dict, session_id)
    set_refresh_cookie(response, refresh_token)

    log_security(
        action="initial_owner_setup",
        module="auth",
        user_id=new_user.id,
        username=new_user.username,
        record_id=new_user.id,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": sanitize_user_public(user_dict),
    }


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    username = (clean_str(payload.username) or "").lower()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{username}"
    check_login_rate_limit(rate_key)

    # Allow login by username, email, full_name, or slug (e.g. pranit-dabhade)
    slug_input = username.replace(" ", "-")
    users = db.query(User).all()
    user = next(
        (
            u
            for u in users
            if u.username.lower() == username
            or (u.email or "").strip().lower() == username
            or (u.full_name or "").strip().lower() == username
            or (u.full_name or "").strip().lower().replace(" ", "-") == slug_input
        ),
        None,
    )

    if not user or not verify_password(payload.password, user.password_hash):
        record_failed_login(rate_key)
        log_security(
            action="login_failed",
            module="auth",
            username=username or "unknown",
            result="failure",
            metadata={"ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    if not user.is_active:
        log_security(
            action="login_blocked_inactive",
            module="auth",
            user_id=user.id,
            username=user.username,
            result="denied",
            metadata={"ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is deactivated. Contact the resort owner.",
        )

    clear_failed_logins(rate_key)
    user.updated_at = ist_now()
    db.commit()

    user_dict = {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
    }

    session_id = uuid.uuid4().hex
    access_token = create_access_token(user_dict, session_id)
    refresh_token = create_refresh_token(user_dict, session_id)
    set_refresh_cookie(response, refresh_token)

    log_security(
        action="login_success",
        module="auth",
        user_id=user.id,
        username=user.username,
        record_id=session_id,
        metadata={"ip": client_ip, "role": user.role},
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": sanitize_user_public(user_dict),
    }


@router.post("/refresh")
def refresh_session(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    token = request.cookies.get("blueberry_refresh") or (body.refresh_token if body else None)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh session found.")

    payload = decode_token(token, expected_type="refresh")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account inactive or missing.")

    old_sid = payload.get("sid")
    old_jti = payload.get("jti")
    revoke_session(session_id=old_sid, jti=old_jti)

    user_dict = {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
    }

    new_sid = uuid.uuid4().hex
    access_token = create_access_token(user_dict, new_sid)
    new_refresh = create_refresh_token(user_dict, new_sid)
    set_refresh_cookie(response, new_refresh)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": sanitize_user_public(user_dict),
    }


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    sid = current_user.get("_session_id")
    refresh_tok = request.cookies.get("blueberry_refresh")
    jti = None
    if refresh_tok:
        try:
            decoded = decode_token(refresh_tok, expected_type="refresh")
            jti = decoded.get("jti")
        except HTTPException:
            pass
    revoke_session(session_id=sid, jti=jti)
    clear_refresh_cookie(response)

    log_security(
        action="logout",
        module="auth",
        user_id=current_user["id"],
        username=current_user["username"],
        record_id=sid,
    )
    return {"message": "Logged out successfully."}


@router.get("/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"user": sanitize_user_public(current_user)}


@router.post("/change-password")
def change_own_password(
    payload: ChangeOwnPasswordRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = ist_now()
    db.commit()

    revoke_all_user_sessions(user.id)
    clear_refresh_cookie(response)

    log_security(
        action="password_changed",
        module="auth",
        user_id=user.id,
        username=user.username,
    )
    return {"message": "Password changed successfully. Please log in again."}
