from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.authentication.security import get_current_user
from app.database.session import get_db
from app.models.sql_models import Notification

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    notifs = (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    unread_count = db.query(Notification).filter(Notification.is_read == False).count()
    return {
        "unread_count": unread_count,
        "items": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifs
        ],
    }


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")
    n.is_read = True
    db.commit()
    unread_count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"success": True, "unread_count": unread_count}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db.query(Notification).filter(Notification.is_read == False).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"success": True, "unread_count": 0}


@router.delete("")
@router.post("/clear-all")
def clear_all_notifications(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    cleared = db.query(Notification).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "cleared_count": cleared, "unread_count": 0}


@router.delete("/{notification_id}")
def delete_single_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        db.delete(n)
        db.commit()
    unread_count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"success": True, "unread_count": unread_count}

