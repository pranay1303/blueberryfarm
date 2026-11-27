from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Booking, Customer, Invoice, Payment, Vehicle
from app.schemas.requests import CustomerCreate, CustomerUpdate
from app.services.calculations import round_money
from app.validations.validators import clean_str, normalize_phone, validate_gstin, validate_mobile, validate_pin

logger = logging.getLogger("blueberry.customers")
router = APIRouter(prefix="/api/customers", tags=["Customers"])


def generate_customer_code(db: Session) -> str:
    count = db.query(Customer).count() + 1
    for i in range(10):
        code = f"CUST-{(count + i):04d}"
        if not db.query(Customer).filter(Customer.customer_code == code).first():
            return code
    import time
    return f"CUST-{int(time.time())}"


def serialize_customer(c: Customer, db: Session) -> Dict[str, Any]:
    c_bookings = db.query(Booking).filter(Booking.customer_id == c.id, Booking.booking_status != "Cancelled").all()
    c_invoices = db.query(Invoice).filter(Invoice.customer_id == c.id, Invoice.document_title != "CANCELLED INVOICE").all()
    c_payments = db.query(Payment).filter(Payment.customer_id == c.id).all()
    c_vehicles = db.query(Vehicle).filter(Vehicle.customer_id == c.id).all()

    total_invoiced = round_money(sum(float(i.grand_total) for i in c_invoices))
    total_paid = round_money(sum(float(p.amount) for p in c_payments if p.payment_type != "Refund"))
    balance_due = max(0.0, round_money(total_invoiced - total_paid))

    return {
        "id": c.id,
        "customer_id": c.customer_code,
        "customer_code": c.customer_code,
        "full_name": c.full_name,
        "mobile": c.mobile,
        "email": c.email,
        "whatsapp": c.whatsapp,
        "address": c.address_line,
        "address_line": c.address_line,
        "city": c.city,
        "state": c.state,
        "pin_code": c.pin_code,
        "company_name": c.company_name,
        "gstin": c.gstin,
        "customer_type": "Corporate" if c.company_name or c.gstin else "Individual",
        "customer_source": c.customer_source,
        "notes": c.notes,
        "total_bookings": len(c_bookings),
        "total_invoices": len(c_invoices),
        "total_paid": total_paid,
        "balance_due": balance_due,
        "vehicles": [
            {"id": v.id, "type": v.vehicle_type, "registration_number": v.registration_number}
            for v in c_vehicles
        ],
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("")
def list_customers(
    search: Optional[str] = Query(default=None),
    customer_type: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("customers:read")),
) -> Dict[str, Any]:
    q = db.query(Customer)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (Customer.full_name.ilike(s))
            | (Customer.customer_code.ilike(s))
            | (Customer.mobile.ilike(s))
            | (Customer.email.ilike(s))
            | (Customer.city.ilike(s))
            | (Customer.company_name.ilike(s))
        )

    total = q.count()
    customers = q.order_by(Customer.created_at.desc()).offset(offset).limit(limit).all()
    items = [serialize_customer(c, db) for c in customers]

    if customer_type and customer_type != "All":
        items = [i for i in items if i.get("customer_type") == customer_type]

    return {"items": items, "total": total}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("customers:write")),
) -> Dict[str, Any]:
    full_name = clean_str(payload.full_name)
    if not full_name:
        raise HTTPException(status_code=422, detail="Customer full name is required.")

    mobile = normalize_phone(payload.mobile)
    if not mobile or len(mobile) < 10:
        raise HTTPException(status_code=422, detail="Valid 10-digit mobile number is required.")

    # Duplicate check
    existing = db.query(Customer).filter(Customer.mobile == mobile).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Customer with mobile {mobile} already exists ({existing.full_name}, {existing.customer_code}).",
        )

    code = generate_customer_code(db)
    cleaned_gstin = clean_str(payload.gstin)
    cust = Customer(
        customer_code=code,
        full_name=full_name,
        mobile=mobile,
        email=clean_str(payload.email),
        whatsapp=normalize_phone(payload.whatsapp_number) if payload.whatsapp_number else mobile,
        address_line=clean_str(payload.address),
        city=clean_str(payload.city),
        state=clean_str(payload.state) or "Maharashtra",
        pin_code=clean_str(payload.pin_code),
        company_name=clean_str(payload.company_name),
        gstin=cleaned_gstin.upper() if cleaned_gstin else None,
        notes=clean_str(payload.notes),
        customer_source="Admin Desk",
    )
    db.add(cust)
    db.commit()

    log_activity(
        action="customer_created",
        module="customers",
        record_id=cust.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"customer_code": cust.customer_code, "name": cust.full_name, "mobile": cust.mobile},
    )

    return {"customer": serialize_customer(cust, db)}


@router.get("/{customer_id}")
def get_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("customers:read")),
) -> Dict[str, Any]:
    c = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_code == customer_id)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found.")

    data = serialize_customer(c, db)
    # Add detailed relations
    data["bookings"] = [
        {
            "id": b.id,
            "booking_reference": b.booking_reference,
            "check_in_date": b.check_in_date.isoformat(),
            "check_out_date": b.check_out_date.isoformat(),
            "status": b.booking_status,
            "payment_status": b.payment_status,
            "total_amount": float(b.total_amount),
        }
        for b in c.bookings
    ]
    data["invoices"] = [
        {
            "id": i.id,
            "invoice_number": i.invoice_number,
            "invoice_date": i.invoice_date.isoformat(),
            "grand_total": float(i.grand_total),
            "payment_status": i.payment_status,
        }
        for i in c.invoices
    ]
    return {"customer": data}


@router.put("/{customer_id}")
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("customers:write")),
) -> Dict[str, Any]:
    c = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_code == customer_id)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found.")

    if payload.full_name is not None:
        c.full_name = clean_str(payload.full_name) or c.full_name
    if payload.mobile is not None:
        new_mob = normalize_phone(payload.mobile)
        if new_mob and new_mob != c.mobile:
            dup = db.query(Customer).filter(Customer.mobile == new_mob, Customer.id != c.id).first()
            if dup:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Another customer already uses mobile {new_mob} ({dup.full_name}).",
                )
            c.mobile = new_mob
    if payload.email is not None:
        c.email = clean_str(payload.email)
    if payload.whatsapp_number is not None:
        c.whatsapp = normalize_phone(payload.whatsapp_number)
    if payload.address is not None:
        c.address_line = clean_str(payload.address)
    if payload.city is not None:
        c.city = clean_str(payload.city)
    if payload.state is not None:
        c.state = clean_str(payload.state)
    if payload.pin_code is not None:
        c.pin_code = clean_str(payload.pin_code)
    if payload.company_name is not None:
        c.company_name = clean_str(payload.company_name)
    if payload.gstin is not None:
        cleaned_gstin = clean_str(payload.gstin)
        c.gstin = cleaned_gstin.upper() if cleaned_gstin else None
    if payload.notes is not None:
        c.notes = clean_str(payload.notes)

    c.updated_at = ist_now()
    db.commit()

    log_activity(
        action="customer_updated",
        module="customers",
        record_id=c.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"customer_code": c.customer_code},
    )

    return {"customer": serialize_customer(c, db)}
