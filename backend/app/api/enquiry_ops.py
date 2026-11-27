from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import get_current_user, require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import (
    Booking,
    BookingEnquiry,
    Customer,
    Notification,
    Package,
    Vehicle,
)
from app.schemas.public_schemas import EnquiryReviewRequest

logger = logging.getLogger("blueberry.enquiries")
router = APIRouter(prefix="/api/enquiries", tags=["Enquiry Approval Workflow"])


@router.get("")
def list_enquiries(
    status_filter: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("enquiries:read")),
) -> Dict[str, Any]:
    """List customer booking enquiries for admin staff review."""
    q = db.query(BookingEnquiry)

    if status_filter and status_filter != "All":
        q = q.filter(BookingEnquiry.status == status_filter)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (BookingEnquiry.enquiry_reference.ilike(s))
            | (BookingEnquiry.guest_name.ilike(s))
            | (BookingEnquiry.guest_mobile.ilike(s))
            | (BookingEnquiry.guest_email.ilike(s))
        )

    total = q.count()
    enquiries = q.order_by(BookingEnquiry.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for e in enquiries:
        cust_name = (e.customer.full_name if e.customer and e.customer.full_name else e.guest_name) or "Guest"
        cust_mob = (e.customer.mobile if e.customer and e.customer.mobile else e.guest_mobile) or ""
        cust_email = (e.customer.email if e.customer and e.customer.email else e.guest_email) or ""
        cust_addr = (e.customer.address_line if e.customer and e.customer.address_line else e.guest_address) or ""
        cust_city = (e.customer.city if e.customer and e.customer.city else e.guest_city) or ""

        items.append({
            "id": e.id,
            "enquiry_reference": e.enquiry_reference,
            "customer_id": e.customer_id,
            "customer_code": e.customer.customer_code if e.customer else None,
            "customer": {
                "id": e.customer_id or "",
                "customer_code": e.customer.customer_code if e.customer else None,
                "full_name": cust_name,
                "mobile": cust_mob,
                "email": cust_email,
                "address": cust_addr,
                "city": cust_city,
            },
            "package": {
                "id": e.package_id or "",
                "name": e.package.name if e.package else "Custom / Standard",
                "weekday_rate": float(e.package.weekday_rate) if e.package and e.package.weekday_rate else 0.0,
                "weekend_rate": float(e.package.weekend_rate) if e.package and e.package.weekend_rate else 0.0,
            } if e.package else None,
            "guest_name": e.guest_name or cust_name,
            "guest_mobile": e.guest_mobile or cust_mob,
            "guest_email": e.guest_email or cust_email,
            "guest_address": e.guest_address or cust_addr,
            "guest_city": e.guest_city or cust_city,
            "package_id": e.package_id,
            "package_name": e.package.name if e.package else "Custom / Standard",
            "check_in_date": e.check_in_date.isoformat() if e.check_in_date else None,
            "check_in_time": e.check_in_time,
            "check_out_date": e.check_out_date.isoformat() if e.check_out_date else None,
            "check_out_time": e.check_out_time,
            "adults": e.adults,
            "children": e.children,
            "infants": e.infants,
            "total_guests": e.total_guests,
            "number_of_rooms": e.number_of_rooms,
            "dormitory_guests": e.dormitory_guests,
            "vehicle_count": e.vehicle_count,
            "vehicles": [
                {"id": v.id, "type": v.vehicle_type, "registration_number": v.registration_number}
                for v in e.vehicles
            ],
            "occasion": e.occasion,
            "food_preferences": e.food_preferences,
            "special_requirements": e.special_requirements,
            "status": e.status,
            "booking_reference": e.booking.booking_reference if e.booking else None,
            "reviewed_by": e.reviewed_by,
            "reviewed_at": e.reviewed_at.isoformat() if e.reviewed_at else None,
            "review_remarks": e.review_remarks,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        })

    return {"items": items, "total": total}


@router.get("/{enquiry_id}")
def get_enquiry_details(
    enquiry_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("enquiries:read")),
) -> Dict[str, Any]:
    """Detailed view of an individual enquiry, customer profile and vehicles."""
    e = db.query(BookingEnquiry).filter(BookingEnquiry.id == enquiry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Booking enquiry not found.")

    return {
        "id": e.id,
        "enquiry_reference": e.enquiry_reference,
        "customer": {
            "id": e.customer.id,
            "customer_code": e.customer.customer_code,
            "full_name": e.customer.full_name,
            "mobile": e.customer.mobile,
            "email": e.customer.email,
            "address": e.customer.address_line,
            "city": e.customer.city,
            "state": e.customer.state,
            "pin_code": e.customer.pin_code,
        } if e.customer else None,
        "package": {
            "id": e.package.id,
            "name": e.package.name,
            "weekday_rate": float(e.package.weekday_rate),
            "weekend_rate": float(e.package.weekend_rate),
        } if e.package else None,
        "check_in_date": e.check_in_date.isoformat(),
        "check_out_date": e.check_out_date.isoformat(),
        "adults": e.adults,
        "children": e.children,
        "infants": e.infants,
        "total_guests": e.total_guests,
        "vehicles": [
            {"id": v.id, "type": v.vehicle_type, "registration_number": v.registration_number, "notes": v.notes}
            for v in e.vehicles
        ],
        "occasion": e.occasion,
        "food_preferences": e.food_preferences,
        "special_requirements": e.special_requirements,
        "status": e.status,
        "reviewed_by": e.reviewed_by,
        "review_remarks": e.review_remarks,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.post("/{enquiry_id}/review")
def review_enquiry(
    enquiry_id: str,
    payload: EnquiryReviewRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("enquiries:write")),
) -> Dict[str, Any]:
    """Admin staff approves, rejects, or requests more information on an enquiry."""
    e = db.query(BookingEnquiry).filter(BookingEnquiry.id == enquiry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found.")

    new_status = payload.status.upper()
    if new_status not in ("APPROVED", "REJECTED", "MORE_INFO_REQUESTED"):
        raise HTTPException(status_code=400, detail="Invalid status. Allowed: APPROVED, REJECTED, MORE_INFO_REQUESTED")

    if new_status == "REJECTED" and not (payload.remarks and payload.remarks.strip()):
        raise HTTPException(status_code=400, detail="Rejection requires a documented reason.")

    prev_status = e.status
    e.status = new_status
    e.reviewed_by = current_user.get("full_name") or current_user.get("username")
    e.reviewed_at = ist_now()
    e.review_remarks = payload.remarks

    # If APPROVED, check if a formal Booking record should be auto-created or converted
    booking_created = None
    if new_status == "APPROVED" and not e.booking:
        year = ist_now().strftime("%Y")
        bkg_ref = f"BKG-{year}-{e.enquiry_reference.split('-')[-1]}"
        # Ensure unique
        existing_bkg = db.query(Booking).filter(Booking.booking_reference == bkg_ref).first()
        if existing_bkg:
            import time
            bkg_ref = f"BKG-{year}-{int(time.time())}"

        # Calculate package estimate
        pkg = e.package
        if not pkg and e.package_id:
            pkg = db.query(Package).filter(Package.id == e.package_id).first()
        if not pkg:
            pkg = db.query(Package).filter(Package.category == "Stay").first() or db.query(Package).first()

        est_total = Decimal("0.00")
        if pkg and e.check_in_date and e.check_out_date:
            from app.services.calculations import calculate_package_quote
            quote = calculate_package_quote(
                {
                    "weekday_rate": float(pkg.weekday_rate),
                    "weekend_rate": float(pkg.weekend_rate),
                    "child_price": float(pkg.child_price),
                    "infant_price": float(pkg.infant_price),
                },
                check_in_date=str(e.check_in_date),
                check_out_date=str(e.check_out_date),
                adults=e.adults,
                children=e.children,
                infants=e.infants,
            )
            est_total = Decimal(str(quote["total_package_amount"]))

        booking = Booking(
            booking_reference=bkg_ref,
            customer_id=e.customer_id,
            enquiry_id=e.id,
            package_id=pkg.id if pkg else e.package_id,
            check_in_date=e.check_in_date,
            check_in_time=e.check_in_time,
            check_out_date=e.check_out_date,
            check_out_time=e.check_out_time,
            adults=e.adults,
            children=e.children,
            infants=e.infants,
            total_guests=e.total_guests,
            number_of_rooms=e.number_of_rooms,
            dormitory_guests=e.dormitory_guests,
            assigned_staff=current_user.get("full_name"),
            occasion=e.occasion,
            special_requests=e.special_requirements,
            booking_status="Confirmed",
            payment_status="Unpaid",
            total_amount=est_total,
            advance_paid=Decimal("0.00"),
            balance_due=est_total,
        )
        db.add(booking)
        db.flush()

        # Associate vehicles with booking
        for v in e.vehicles:
            v.booking_id = booking.id

        booking_created = bkg_ref
    elif new_status == "APPROVED" and e.booking:
        booking_created = e.booking.booking_reference

    db.commit()

    log_activity(
        action=f"BOOKING_ENQUIRY_{new_status}",
        module="enquiries",
        record_id=e.enquiry_reference,
        user_id=current_user.get("id"),
        username=current_user.get("username"),
        metadata={
            "enquiry_reference": e.enquiry_reference,
            "previous_status": prev_status,
            "new_status": new_status,
            "booking_reference": booking_created,
            "remarks": payload.remarks,
        },
    )

    return {
        "success": True,
        "enquiry_reference": e.enquiry_reference,
        "status": new_status,
        "booking_reference": booking_created,
        "message": f"Enquiry has been marked as {new_status}.",
    }

