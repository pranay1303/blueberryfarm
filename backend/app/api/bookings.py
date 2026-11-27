from __future__ import annotations

import calendar
import logging
import random
import time
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Booking, BookingEnquiry, Customer, Invoice, Package, Quotation, Vehicle
from app.schemas.requests import BookingCreate, BookingUpdate
from app.services.calculations import calculate_package_quote, round_money
from app.validations.validators import clean_str, normalize_phone, validate_stay_dates

logger = logging.getLogger("blueberry.bookings")
router = APIRouter(prefix="/api/bookings", tags=["Bookings"])


def generate_booking_reference(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"BKG-{year}-{random.randint(1000, 9999)}"
        if not db.query(Booking).filter(Booking.booking_reference == code).first():
            return code
    return f"BKG-{year}-{int(time.time())}"


def serialize_booking(b: Booking) -> Dict[str, Any]:
    active_inv = None
    if b.invoices:
        for inv in reversed(b.invoices):
            if inv.payment_status != "Cancelled":
                active_inv = inv
                break

    return {
        "id": b.id,
        "booking_id": b.booking_reference,
        "booking_reference": b.booking_reference,
        "customer_id": b.customer_id,
        "customer_name": b.customer.full_name if b.customer else "Guest",
        "customer_mobile": b.customer.mobile if b.customer else "",
        "contact_number": b.customer.mobile if b.customer else "",
        "package_id": b.package_id,
        "package": b.package.name if b.package else "",
        "package_name": b.package.name if b.package else "",
        "booking_date": b.created_at.strftime("%Y-%m-%d") if b.created_at else "",
        "check_in_date": b.check_in_date.isoformat() if b.check_in_date else "",
        "check_in_time": b.check_in_time,
        "check_out_date": b.check_out_date.isoformat() if b.check_out_date else "",
        "check_out_time": b.check_out_time,
        "number_of_adults": b.adults,
        "adults": b.adults,
        "number_of_children": b.children,
        "children": b.children,
        "number_of_infants": b.infants,
        "infants": b.infants,
        "total_guests": b.total_guests,
        "number_of_rooms": b.number_of_rooms,
        "rooms": b.number_of_rooms,
        "number_of_dormitory_guests": b.dormitory_guests,
        "assigned_staff": b.assigned_staff or "Unassigned",
        "booking_status": b.booking_status,
        "payment_status": b.payment_status,
        "total_booking_amount": float(b.total_amount),
        "total_amount": float(b.total_amount),
        "advance_paid": float(b.advance_paid),
        "remaining_balance": float(b.balance_due),
        "balance_due": float(b.balance_due),
        "invoice_id": active_inv.id if active_inv else None,
        "invoice_number": active_inv.invoice_number if active_inv else None,
        "special_requests": b.special_requests,
        "occasion": b.occasion,
        "vehicles": [
            {"id": v.id, "type": v.vehicle_type, "registration_number": v.registration_number}
            for v in b.vehicles
        ],
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


@router.get("")
def list_bookings(
    search: Optional[str] = Query(default=None),
    booking_status: Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    view: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:read")),
) -> Dict[str, Any]:
    q = db.query(Booking).join(Customer, Booking.customer_id == Customer.id)
    today_dt = ist_now().date()
    next_7_dt = today_dt + timedelta(days=7)

    if view == "upcoming_checkins":
        q = q.filter(
            Booking.booking_status.notin_(["Cancelled", "Checked Out"]),
            Booking.check_in_date >= today_dt,
            Booking.check_in_date <= next_7_dt,
        )
    elif view == "upcoming_checkouts":
        q = q.filter(
            Booking.booking_status.in_(["Confirmed", "Checked In"]),
            Booking.check_out_date >= today_dt,
            Booking.check_out_date <= next_7_dt,
        )

    if booking_status and booking_status != "All":
        q = q.filter(Booking.booking_status == booking_status)
    if payment_status and payment_status != "All":
        q = q.filter(Booking.payment_status == payment_status)
    if date_from:
        try:
            q = q.filter(Booking.check_in_date >= date.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(Booking.check_in_date <= date.fromisoformat(date_to))
        except ValueError:
            pass

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (Booking.booking_reference.ilike(s))
            | (Customer.full_name.ilike(s))
            | (Customer.mobile.ilike(s))
        )

    total = q.count()
    bookings = q.order_by(Booking.check_in_date.desc()).offset(offset).limit(limit).all()

    # Synchronize financial totals and invoices for every booking
    needs_commit = False
    for b in bookings:
        active_inv = None
        if b.invoices:
            for inv in reversed(b.invoices):
                if inv.payment_status != "Cancelled":
                    active_inv = inv
                    break
        elif b.customer_id:
            active_inv = db.query(Invoice).filter(
                (Invoice.booking_reference == b.booking_reference)
                | (
                    (Invoice.customer_id == b.customer_id)
                    & (Invoice.check_in_date == b.check_in_date)
                ),
                Invoice.payment_status != "Cancelled",
            ).order_by(Invoice.created_at.desc()).first()
            if active_inv and not active_inv.booking_id:
                active_inv.booking_id = b.id
                active_inv.booking_reference = b.booking_reference
                needs_commit = True

        if active_inv:
            if (
                b.total_amount != active_inv.grand_total
                or b.advance_paid != active_inv.total_amount_paid
                or b.balance_due != active_inv.balance_due
                or b.payment_status != active_inv.payment_status
            ):
                b.total_amount = active_inv.grand_total
                b.advance_paid = active_inv.total_amount_paid
                b.balance_due = active_inv.balance_due
                b.payment_status = active_inv.payment_status
                needs_commit = True
        elif b.total_amount <= 0:
            pkg = b.package
            if not pkg and b.package_id:
                pkg = db.query(Package).filter(Package.id == b.package_id).first()
            if not pkg:
                pkg = db.query(Package).filter(Package.category == "Stay").first() or db.query(Package).first()
                if pkg:
                    b.package_id = pkg.id
                    needs_commit = True
            if pkg and b.check_in_date and b.check_out_date:
                quote = calculate_package_quote(
                    {
                        "weekday_rate": float(pkg.weekday_rate),
                        "weekend_rate": float(pkg.weekend_rate),
                        "child_price": float(pkg.child_price),
                        "infant_price": float(pkg.infant_price),
                    },
                    check_in_date=str(b.check_in_date),
                    check_out_date=str(b.check_out_date),
                    adults=b.adults,
                    children=b.children,
                    infants=b.infants,
                )
                est_total = Decimal(str(quote["total_package_amount"]))
                if est_total > 0:
                    b.total_amount = est_total
                    b.balance_due = max(Decimal("0.00"), b.total_amount - b.advance_paid)
                    if b.advance_paid >= b.total_amount and b.total_amount > 0:
                        b.payment_status = "Paid"
                    elif b.advance_paid > 0:
                        b.payment_status = "Partially Paid"
                    else:
                        b.payment_status = "Unpaid"
                    needs_commit = True

    if needs_commit:
        db.commit()

    return {"items": [serialize_booking(b) for b in bookings], "total": total}


@router.get("/calendar/month")
@router.get("/calendar-month")
def get_calendar_month_overview(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:read")),
) -> Dict[str, Any]:
    today_dt = ist_now().date()
    _, num_days = calendar.monthrange(year, month)
    m_start = date(year, month, 1)
    m_end = date(year, month, num_days)

    # 1. Confirmed / Checked-in Bookings
    bookings = (
        db.query(Booking)
        .filter(
            Booking.booking_status.notin_(["Cancelled"]),
            Booking.check_in_date <= m_end,
            Booking.check_out_date >= m_start,
        )
        .all()
    )

    # 2. Pending Enquiries
    enquiries = (
        db.query(BookingEnquiry)
        .filter(
            BookingEnquiry.status.in_(["PENDING_REVIEW", "MORE_INFO_REQUESTED", "Pending", "pending", "Pending Review"]),
            BookingEnquiry.check_in_date <= m_end,
            BookingEnquiry.check_out_date >= m_start,
        )
        .all()
    )

    # 3. Active Quotations
    quotations = (
        db.query(Quotation)
        .filter(
            Quotation.status.in_(["Draft", "Sent", "Accepted"]),
            Quotation.check_in_date <= m_end,
            Quotation.check_out_date >= m_start,
        )
        .all()
    )

    days_data: Dict[str, Any] = {}
    for day in range(1, num_days + 1):
        cur_date = date(year, month, day)
        date_str = cur_date.isoformat()
        is_past = cur_date < today_dt

        # Check overlapping bookings
        active_bookings = []
        for b in bookings:
            if b.check_in_date <= cur_date <= b.check_out_date:
                active_bookings.append({
                    "id": b.id,
                    "booking_reference": b.booking_reference,
                    "customer_name": b.customer.full_name if b.customer else "Guest",
                    "customer_mobile": b.customer.mobile if b.customer else "",
                    "check_in_date": b.check_in_date.isoformat() if b.check_in_date else "",
                    "check_out_date": b.check_out_date.isoformat() if b.check_out_date else "",
                    "package_name": b.package.name if b.package else "Custom Stay",
                    "adults": b.adults,
                    "children": b.children,
                    "infants": b.infants,
                    "total_guests": b.total_guests,
                    "booking_status": b.booking_status,
                    "payment_status": b.payment_status,
                    "total_amount": float(b.total_amount),
                    "balance_due": float(b.balance_due),
                    "special_requests": b.special_requests or "",
                })

        # Check overlapping enquiries
        active_enquiries = []
        for enq in enquiries:
            if enq.check_in_date <= cur_date <= enq.check_out_date:
                active_enquiries.append({
                    "id": enq.id,
                    "enquiry_reference": enq.enquiry_reference,
                    "customer_name": enq.guest_name or (enq.customer.full_name if enq.customer else "Guest"),
                    "customer_mobile": enq.guest_mobile or (enq.customer.mobile if enq.customer else ""),
                    "check_in_date": enq.check_in_date.isoformat() if enq.check_in_date else "",
                    "check_out_date": enq.check_out_date.isoformat() if enq.check_out_date else "",
                    "package_name": enq.package.name if enq.package else "Stay Package",
                    "total_guests": enq.total_guests,
                    "occasion": enq.occasion or "",
                    "notes": enq.special_requirements or "",
                    "status": enq.status,
                })

        # Check overlapping quotations
        active_quotations = []
        for q in quotations:
            if q.check_in_date and q.check_out_date and (q.check_in_date <= cur_date <= q.check_out_date):
                active_quotations.append({
                    "id": q.id,
                    "quotation_number": q.quotation_number,
                    "customer_name": q.customer.full_name if q.customer else "",
                    "customer_mobile": q.customer.mobile if q.customer else "",
                    "check_in_date": q.check_in_date.isoformat() if q.check_in_date else "",
                    "check_out_date": q.check_out_date.isoformat() if q.check_out_date else "",
                    "package_name": q.package_name or "Custom Stay",
                    "total_guests": (q.adults or 0) + (q.children or 0),
                    "grand_total": float(q.grand_total),
                    "status": q.status,
                })

        if is_past:
            status_code = "PAST"
        elif active_bookings:
            status_code = "BOOKED"  # RED
        elif active_enquiries or active_quotations:
            status_code = "TENTATIVE"  # AMBER
        else:
            status_code = "AVAILABLE"  # GREEN

        days_data[date_str] = {
            "date": date_str,
            "day": day,
            "is_past": is_past,
            "status": status_code,
            "bookings": active_bookings,
            "enquiries": active_enquiries,
            "quotations": active_quotations,
        }

    return {
        "year": year,
        "month": month,
        "today": today_dt.isoformat(),
        "days": days_data,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    d_in, d_out = validate_stay_dates(payload.check_in_date, payload.check_out_date)

    customer = db.query(Customer).filter((Customer.id == payload.customer_id) | (Customer.customer_code == payload.customer_id)).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Selected customer does not exist.")

    pkg = None
    if payload.package_id:
        pkg = db.query(Package).filter((Package.id == payload.package_id) | (Package.package_code == payload.package_id)).first()

    total_amount = Decimal(str(payload.total_booking_amount or 0))
    advance_paid = Decimal(str(getattr(payload, "advance_paid", 0) or 0))
    balance_due = max(Decimal("0.00"), total_amount - advance_paid)

    p_status = "Unpaid"
    if advance_paid >= total_amount and total_amount > 0:
        p_status = "Paid"
    elif advance_paid > 0:
        p_status = "Partially Paid"

    ref = generate_booking_reference(db)
    adults = max(1, payload.adults)
    children = max(0, payload.children)
    infants = max(0, payload.infants)

    if total_amount <= 0:
        if not pkg:
            pkg = db.query(Package).filter(Package.category == "Stay").first() or db.query(Package).first()
        if pkg and d_in and d_out:
            quote = calculate_package_quote(
                {
                    "weekday_rate": float(pkg.weekday_rate),
                    "weekend_rate": float(pkg.weekend_rate),
                    "child_price": float(pkg.child_price),
                    "infant_price": float(pkg.infant_price),
                },
                check_in_date=str(d_in),
                check_out_date=str(d_out),
                adults=adults,
                children=children,
                infants=infants,
            )
            total_amount = Decimal(str(quote["total_package_amount"]))
            balance_due = max(Decimal("0.00"), total_amount - advance_paid)
            if advance_paid >= total_amount and total_amount > 0:
                p_status = "Paid"
            elif advance_paid > 0:
                p_status = "Partially Paid"
            else:
                p_status = "Unpaid"

    booking = Booking(
        booking_reference=ref,
        customer_id=customer.id,
        package_id=pkg.id if pkg else None,
        check_in_date=d_in,
        check_in_time=payload.check_in_time or "12:00 PM",
        check_out_date=d_out,
        check_out_time=payload.check_out_time or "11:00 AM",
        adults=adults,
        children=children,
        infants=infants,
        total_guests=adults + children + infants,
        number_of_rooms=max(1, payload.rooms),
        dormitory_guests=max(0, payload.dormitory_guests),
        assigned_staff=clean_str(payload.assigned_staff) or current_user.get("full_name"),
        occasion=clean_str(getattr(payload, "occasion", None)),
        special_requests=clean_str(payload.special_requests),
        booking_status=payload.booking_status or "Confirmed",
        payment_status=p_status,
        total_amount=total_amount,
        advance_paid=advance_paid,
        balance_due=balance_due,
    )
    db.add(booking)
    db.commit()

    log_activity(
        action="booking_created",
        module="bookings",
        record_id=booking.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"booking_reference": booking.booking_reference, "customer": customer.full_name},
    )

    return {"booking": serialize_booking(booking)}


@router.get("/{booking_id}")
def get_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:read")),
) -> Dict[str, Any]:
    b = db.query(Booking).filter((Booking.id == booking_id) | (Booking.booking_reference == booking_id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found.")
    return {"booking": serialize_booking(b)}


@router.put("/{booking_id}")
def update_booking(
    booking_id: str,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    b = db.query(Booking).filter((Booking.id == booking_id) | (Booking.booking_reference == booking_id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found.")

    if payload.check_in_date and payload.check_out_date:
        d_in, d_out = validate_stay_dates(payload.check_in_date, payload.check_out_date)
        b.check_in_date = d_in
        b.check_out_date = d_out

    if payload.booking_status is not None:
        b.booking_status = payload.booking_status
    if payload.assigned_staff is not None:
        b.assigned_staff = clean_str(payload.assigned_staff)
    if payload.rooms is not None:
        b.number_of_rooms = max(1, payload.rooms)
    if payload.special_requests is not None:
        b.special_requests = clean_str(payload.special_requests)
    if payload.total_booking_amount is not None:
        b.total_amount = Decimal(str(payload.total_booking_amount))
        b.balance_due = max(Decimal("0.00"), b.total_amount - b.advance_paid)
        if b.total_amount > 0 and b.advance_paid >= b.total_amount:
            b.payment_status = "Paid"
        elif b.advance_paid > 0:
            b.payment_status = "Partially Paid"
        else:
            b.payment_status = "Unpaid"

    b.updated_at = ist_now()
    db.commit()

    log_activity(
        action="booking_updated",
        module="bookings",
        record_id=b.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"booking_reference": b.booking_reference},
    )

    return {"booking": serialize_booking(b)}


@router.post("/{booking_id}/cancel")
def cancel_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:cancel")),
) -> Dict[str, Any]:
    b = db.query(Booking).filter((Booking.id == booking_id) | (Booking.booking_reference == booking_id)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found.")

    b.booking_status = "Cancelled"
    b.updated_at = ist_now()
    db.commit()

    log_activity(
        action="booking_cancelled",
        module="bookings",
        record_id=b.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"booking_reference": b.booking_reference},
    )
    return {"booking": serialize_booking(b), "message": "Booking has been cancelled."}
