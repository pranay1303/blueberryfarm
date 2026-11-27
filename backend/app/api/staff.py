from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.authentication.security import (
    hash_password,
    require_owner,
    revoke_all_user_sessions,
    sanitize_user_public,
)
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity, log_security
from app.models.sql_models import Role, User
from app.schemas.requests import CreateStaffRequest, ResetPasswordRequest, UpdateStaffRequest
from app.validations.validators import clean_str

router = APIRouter(prefix="/api/staff", tags=["Staff Management"])


@router.get("")
def list_staff(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, List[Dict[str, Any]]]:
    users = db.query(User).order_by(User.created_at.asc()).all()
    return {"items": [sanitize_user_public(u) for u in users]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_staff(
    payload: CreateStaffRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    username = (clean_str(payload.username) or "").lower()
    if not username or " " in username:
        raise HTTPException(status_code=422, detail="Username cannot contain spaces.")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{username}' is already in use.",
        )

    role_val = payload.role.value if hasattr(payload.role, "value") else str(payload.role)
    role_obj = db.query(Role).filter(Role.name == role_val).first()
    email_val = clean_str(payload.email) or f"{username}@blueberryfarmandresort.com"

    if db.query(User).filter(User.email == email_val).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Email '{email_val}' is already in use.",
        )

    new_user = User(
        username=username,
        email=email_val,
        full_name=clean_str(payload.full_name) or username,
        password_hash=hash_password(payload.password),
        role=role_val,
        role_id=role_obj.id if role_obj else None,
        is_active=payload.is_active,
    )
    db.add(new_user)
    db.commit()

    log_activity(
        action="staff_created",
        module="staff",
        record_id=new_user.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"created_username": username, "role": role_val},
    )

    return {"user": sanitize_user_public(new_user)}


@router.put("/{user_id}")
def update_staff(
    user_id: str,
    payload: UpdateStaffRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.username == "admin" and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate primary owner account.")

    # Prevent deactivating or demoting the last active OWNER_ADMIN
    if user.role == "OWNER_ADMIN":
        new_role = payload.role.value if hasattr(payload.role, "value") else (str(payload.role) if payload.role is not None else user.role)
        new_active = payload.is_active if payload.is_active is not None else user.is_active
        if new_role != "OWNER_ADMIN" or not new_active:
            other_owners = (
                db.query(User)
                .filter(User.role == "OWNER_ADMIN", User.is_active == True, User.id != user.id)
                .count()
            )
            if other_owners == 0:
                raise HTTPException(status_code=400, detail="Cannot deactivate or demote the last active Owner Admin.")

    if payload.full_name is not None:
        user.full_name = clean_str(payload.full_name) or user.full_name
    if payload.email is not None:
        new_email = clean_str(payload.email)
        if new_email and new_email != user.email:
            if db.query(User).filter(User.email == new_email, User.id != user.id).first():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Email '{new_email}' is already in use.")
            user.email = new_email
    if payload.role is not None:
        role_val = payload.role.value if hasattr(payload.role, "value") else str(payload.role)
        user.role = role_val
        role_obj = db.query(Role).filter(Role.name == role_val).first()
        if role_obj:
            user.role_id = role_obj.id
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not payload.is_active:
            revoke_all_user_sessions(user.id)

    user.updated_at = ist_now()
    db.commit()

    log_activity(
        action="staff_updated",
        module="staff",
        record_id=user.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"target_username": user.username},
    )

    return {"user": sanitize_user_public(user)}


@router.post("/{user_id}/reset-password")
def reset_staff_password(
    user_id: str,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, str]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = ist_now()
    db.commit()

    revoke_all_user_sessions(user.id)

    log_security(
        action="staff_password_reset_by_admin",
        module="staff",
        user_id=current_user["id"],
        username=current_user["username"],
        record_id=user.id,
        metadata={"target_username": user.username},
    )
    return {"message": f"Password reset successfully for {user.username}."}
