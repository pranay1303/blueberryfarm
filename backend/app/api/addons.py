from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Addon, Booking, BookingAddon, BookingEnquiry
from app.validations.validators import clean_str

logger = logging.getLogger("blueberry.addons")
router = APIRouter(prefix="/api/addons", tags=["Add-on Services Management"])


# ==============================================================================
# SCHEMAS
# ==============================================================================

class AddonCreate(BaseModel):
    addon_code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    category: str = Field(default="Celebration")  # Celebration, Dining, Activities, Logistics, Other
    pricing_type: str = Field(default="Fixed")    # Fixed, Per Person, Per Room, Per Unit, Custom
    price: float = Field(default=500.0, ge=0)
    description: Optional[str] = None
    requires_admin_approval: bool = True
    is_public: bool = True
    is_active: bool = True


class AddonUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    pricing_type: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    requires_admin_approval: Optional[bool] = None
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None


class BookingAddonRequest(BaseModel):
    booking_id: Optional[str] = None
    enquiry_id: Optional[str] = None
    addon_id: Optional[str] = None
    name: str = Field(min_length=2, max_length=100)
    quantity: int = Field(default=1, ge=1)
    unit_price: float = Field(default=0.0, ge=0)


class BookingAddonReview(BaseModel):
    status: str = Field(..., pattern="^(APPROVED|REJECTED|COMPLETED)$")
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    approval_remarks: Optional[str] = None


def serialize_addon(a: Addon) -> Dict[str, Any]:
    return {
        "id": a.id,
        "addon_code": a.addon_code,
        "name": a.name,
        "category": a.category,
        "pricing_type": a.pricing_type,
        "price": float(a.price),
        "description": a.description,
        "requires_admin_approval": a.requires_admin_approval,
        "is_public": a.is_public,
        "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def serialize_booking_addon(ba: BookingAddon) -> Dict[str, Any]:
    return {
        "id": ba.id,
        "booking_id": ba.booking_id,
        "booking_reference": ba.booking.booking_reference if ba.booking else None,
        "enquiry_id": ba.enquiry_id,
        "addon_id": ba.addon_id,
        "name": ba.name,
        "quantity": ba.quantity,
        "unit_price": float(ba.unit_price),
        "total_price": float(ba.total_price),
        "status": ba.status,
        "approval_remarks": ba.approval_remarks,
        "created_at": ba.created_at.isoformat() if ba.created_at else None,
    }


# ==============================================================================
# ENDPOINTS
# ==============================================================================

@router.get("")
def list_addons(
    category: Optional[str] = Query(default=None),
    public_only: bool = Query(default=False),
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    q = db.query(Addon)
    if active_only:
        q = q.filter(Addon.is_active == True)
    if public_only:
        q = q.filter(Addon.is_public == True)
    if category and category != "ALL":
        q = q.filter(Addon.category == category)

    addons = q.order_by(Addon.category.asc(), Addon.name.asc()).all()
    return {"items": [serialize_addon(a) for a in addons], "total": len(addons)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_addon(
    payload: AddonCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:write")),
) -> Dict[str, Any]:
    code = (clean_str(payload.addon_code) or "").upper()
    if not code:
        raise HTTPException(status_code=422, detail="Add-on code is required.")
    existing = db.query(Addon).filter(Addon.addon_code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Add-on with code '{code}' already exists.")

    addon = Addon(
        addon_code=code,
        name=clean_str(payload.name),
        category=payload.category,
        pricing_type=payload.pricing_type,
        price=Decimal(str(payload.price)),
        description=clean_str(payload.description),
        requires_admin_approval=payload.requires_admin_approval,
        is_public=payload.is_public,
        is_active=payload.is_active,
    )
    db.add(addon)
    db.commit()
    db.refresh(addon)

    log_activity(
        action="ADDON_CREATED",
        module="addons",
        record_id=addon.addon_code,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"name": addon.name, "price": float(addon.price)},
    )

    return {"addon": serialize_addon(addon), "message": "Add-on created successfully."}


@router.put("/{addon_id}")
def update_addon(
    addon_id: str,
    payload: AddonUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:write")),
) -> Dict[str, Any]:
    addon = db.query(Addon).filter(Addon.id == addon_id).first()
    if not addon:
        raise HTTPException(status_code=404, detail="Add-on service not found.")

    if payload.name is not None:
        addon.name = clean_str(payload.name)
    if payload.category is not None:
        addon.category = payload.category
    if payload.pricing_type is not None:
        addon.pricing_type = payload.pricing_type
    if payload.price is not None:
        addon.price = Decimal(str(payload.price))
    if payload.description is not None:
        addon.description = clean_str(payload.description)
    if payload.requires_admin_approval is not None:
        addon.requires_admin_approval = payload.requires_admin_approval
    if payload.is_public is not None:
        addon.is_public = payload.is_public
    if payload.is_active is not None:
        addon.is_active = payload.is_active

    db.commit()
    db.refresh(addon)
    return {"addon": serialize_addon(addon), "message": "Add-on updated successfully."}


@router.post("/booking-request", status_code=status.HTTP_201_CREATED)
def request_addon_service(
    payload: BookingAddonRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    if not payload.booking_id and not payload.enquiry_id:
        raise HTTPException(status_code=422, detail="Either booking_id or enquiry_id is required.")

    if payload.booking_id:
        from app.models.sql_models import Booking
        if not db.query(Booking).filter(Booking.id == payload.booking_id).first():
            raise HTTPException(status_code=404, detail="Referenced booking not found.")

    if payload.enquiry_id:
        from app.models.sql_models import BookingEnquiry
        if not db.query(BookingEnquiry).filter(BookingEnquiry.id == payload.enquiry_id).first():
            raise HTTPException(status_code=404, detail="Referenced enquiry not found.")

    qty = max(1, payload.quantity)
    u_price = Decimal(str(payload.unit_price))

    if payload.addon_id:
        addon = db.query(Addon).filter(Addon.id == payload.addon_id).first()
        if not addon:
            raise HTTPException(status_code=404, detail="Referenced add-on service not found.")
        if u_price == 0:
            u_price = addon.price

    tot_price = u_price * Decimal(str(qty))

    ba = BookingAddon(
        booking_id=payload.booking_id,
        enquiry_id=payload.enquiry_id,
        addon_id=payload.addon_id,
        name=clean_str(payload.name),
        quantity=qty,
        unit_price=u_price,
        total_price=tot_price,
        status="REQUESTED",
    )
    db.add(ba)
    db.commit()
    db.refresh(ba)

    return {"service_request": serialize_booking_addon(ba), "message": "Add-on service requested successfully."}


@router.put("/booking-request/{request_id}/review")
def review_booking_addon(
    request_id: str,
    payload: BookingAddonReview,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    ba = db.query(BookingAddon).filter(BookingAddon.id == request_id).first()
    if not ba:
        raise HTTPException(status_code=404, detail="Service request not found.")

    ba.status = payload.status
    if payload.quantity is not None:
        ba.quantity = max(1, payload.quantity)
    if payload.unit_price is not None:
        ba.unit_price = Decimal(str(payload.unit_price))

    ba.total_price = ba.unit_price * Decimal(str(ba.quantity))
    if payload.approval_remarks is not None:
        ba.approval_remarks = clean_str(payload.approval_remarks)

    db.commit()
    db.refresh(ba)

    return {
        "service_request": serialize_booking_addon(ba),
        "message": f"Service request marked as {ba.status}.",
    }

