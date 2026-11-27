from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Customer, Vehicle
from app.validations.validators import clean_str

logger = logging.getLogger("blueberry.vehicles")
router = APIRouter(prefix="/api/vehicles", tags=["Vehicle Management"])


@router.get("")
def list_vehicles(
    search: Optional[str] = Query(default=None),
    vehicle_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("vehicles:read")),
) -> Dict[str, Any]:
    """List arriving guest vehicles with customer and booking lookup."""
    q = db.query(Vehicle).join(Customer, Vehicle.customer_id == Customer.id)

    if vehicle_type and vehicle_type != "All":
        q = q.filter(Vehicle.vehicle_type == vehicle_type)

    if search:
        s = f"%{search.strip().upper().replace(' ', '')}%"
        q = q.filter(
            (Vehicle.registration_number.ilike(s))
            | (Customer.full_name.ilike(f"%{search.strip()}%"))
            | (Customer.mobile.ilike(f"%{search.strip()}%"))
        )

    total = q.count()
    vehicles = q.order_by(Vehicle.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for v in vehicles:
        items.append({
            "id": v.id,
            "registration_number": v.registration_number,
            "vehicle_type": v.vehicle_type,
            "notes": v.notes,
            "customer_id": v.customer_id,
            "customer_name": v.customer.full_name if v.customer else None,
            "customer_mobile": v.customer.mobile if v.customer else None,
            "booking_id": v.booking_id,
            "booking_reference": v.booking.booking_reference if v.booking else None,
            "check_in_date": v.booking.check_in_date.isoformat() if v.booking and v.booking.check_in_date else None,
            "check_out_date": v.booking.check_out_date.isoformat() if v.booking and v.booking.check_out_date else None,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        })

    return {"items": items, "total": total}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("vehicles:write")),
) -> Dict[str, Any]:
    """Manually register a vehicle arriving at resort gates."""
    import random
    from app.validations.validators import normalize_phone

    reg_raw = clean_str(payload.get("registration_number", "")) or ""
    reg = reg_raw.upper().replace(" ", "")
    if not reg or len(reg) < 3:
        raise HTTPException(status_code=400, detail="Valid vehicle registration number is required.")

    customer = None
    customer_id = payload.get("customer_id")
    if customer_id:
        customer = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_code == customer_id)).first()

    if not customer:
        cust_name = clean_str(payload.get("customer_name"))
        cust_mob = normalize_phone(payload.get("customer_mobile")) if payload.get("customer_mobile") else None
        if cust_mob:
            customer = db.query(Customer).filter(Customer.mobile == cust_mob).first()
        if not customer and cust_name:
            code = f"CUST-{random.randint(1000, 9999)}"
            while db.query(Customer).filter(Customer.customer_code == code).first():
                code = f"CUST-{random.randint(1000, 9999)}"
            customer = Customer(
                customer_code=code,
                full_name=cust_name,
                mobile=cust_mob or "N/A",
                customer_source="Gate Vehicle Entry",
            )
            db.add(customer)
            db.flush()

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found. Provide customer_id or customer_name.")

    booking_id = payload.get("booking_id")
    if booking_id:
        from app.models.sql_models import Booking
        b = db.query(Booking).filter((Booking.id == booking_id) | (Booking.booking_reference == booking_id)).first()
        booking_id = b.id if b else None

    v = Vehicle(
        customer_id=customer.id,
        booking_id=booking_id,
        vehicle_type=clean_str(payload.get("vehicle_type")) or "Car",
        registration_number=reg,
        notes=clean_str(payload.get("notes")),
    )
    db.add(v)
    db.commit()

    log_activity(
        action="VEHICLE_REGISTERED",
        module="vehicles",
        record_id=v.id,
        user_id=current_user.get("id"),
        username=current_user.get("username"),
        metadata={"registration": reg, "customer": customer.full_name},
    )

    return {"id": v.id, "registration_number": v.registration_number, "message": "Vehicle recorded successfully."}

