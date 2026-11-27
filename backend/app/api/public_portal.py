from __future__ import annotations

import logging
import random
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import ist_now, settings
from app.database.session import get_db
from app.logging.audit_logger import log_activity, log_error
from app.models.sql_models import (
    Booking,
    BookingEnquiry,
    BusinessSetting,
    Customer,
    Invoice,
    Notification,
    Package,
    Vehicle,
)
from app.schemas.public_schemas import PublicEnquirySubmit
from app.services.calculations import calculate_package_quote
from app.validations.validators import clean_str, normalize_phone, validate_mobile, validate_stay_dates

logger = logging.getLogger("blueberry.public")
router = APIRouter(prefix="/api/public", tags=["Public Customer Portal"])

_ip_rate_limits: Dict[str, List[float]] = {}
RATE_LIMIT_WINDOW = 300  # 5 minutes
MAX_SUBMISSIONS_PER_IP = 10


def check_public_rate_limit(client_ip: str) -> None:
    now = time.time()
    timestamps = _ip_rate_limits.get(client_ip, [])
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= MAX_SUBMISSIONS_PER_IP:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many booking requests from this network. Please wait a few minutes or call us directly at 8669408484.",
        )
    timestamps.append(now)
    _ip_rate_limits[client_ip] = timestamps


def generate_enquiry_reference(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"ENQ-{year}-{random.randint(1000, 9999)}"
        exists = db.query(BookingEnquiry).filter(BookingEnquiry.enquiry_reference == code).first()
        if not exists:
            return code
    return f"ENQ-{year}-{int(time.time())}"


def generate_customer_code(db: Session) -> str:
    count = db.query(Customer).count() + 1
    for i in range(10):
        code = f"CUST-{(count + i):04d}"
        if not db.query(Customer).filter(Customer.customer_code == code).first():
            return code
    return f"CUST-{int(time.time())}"


@router.get("/resort-info")
def get_public_resort_info(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Public resort contact details, policies and official branding information."""
    biz_setting = db.query(BusinessSetting).filter(BusinessSetting.key == "business_profile").first()
    info = biz_setting.value_json if biz_setting and biz_setting.value_json else {
        "name": "Blueberry Farm and Resort",
        "tagline": "Nature Stay, Farm & Events Resort Karjat",
        "address": "At. Post – Mandawane, Tal – Karjat, Dist – Raigad, Maharashtra",
        "phone": "8669408484",
        "whatsapp": "8669408484",
        "email": "info@blueberryfarmandresort.com",
        "website": "blueberryfarmandresort.com",
    }
    return {"resort": info}


@router.get("/packages")
def get_public_packages(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Public list of active resort packages for prospective guests."""
    packages = (
        db.query(Package)
        .filter(Package.is_active == True, Package.is_public == True)
        .order_by(Package.weekday_rate.asc())
        .all()
    )
    items = []
    for p in packages:
        items.append({
            "id": p.id,
            "package_code": p.package_code,
            "name": p.name,
            "description": p.description,
            "category": p.category,
            "weekday_rate": float(p.weekday_rate),
            "weekend_rate": float(p.weekend_rate),
            "adult_price": float(p.adult_price),
            "child_price": float(p.child_price),
            "infant_price": float(p.infant_price),
            "included_meals": p.included_meals,
            "room_inclusion": p.room_inclusion,
            "activities": p.activities,
            "check_in_policy": p.check_in_policy,
            "check_out_policy": p.check_out_policy,
            "additional_inclusions": p.additional_inclusions,
        })
    return {"items": items}


@router.post("/enquiries", status_code=status.HTTP_201_CREATED)
def submit_public_enquiry(
    payload: PublicEnquirySubmit,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Public customer booking enquiry submission.
    No login or password required.
    Includes Honeypot anti-spam, Indian mobile format validation, stay date logic, and vehicle registration storage.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"

    # 1. Anti-spam honeypot verification
    if payload.website_url_hp:
        logger.warning("Spam bot trapped by honeypot field from IP %s", client_ip)
        return {
            "success": True,
            "enquiry_reference": "ENQ-CONFIRMED",
            "message": "Thank you for your enquiry. We will contact you shortly.",
        }

    # 2. Rate limiting check
    check_public_rate_limit(client_ip)

    # 3. Input cleaning and validation
    name = clean_str(payload.full_name)
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name.")

    mob_clean = normalize_phone(payload.mobile)
    if not mob_clean or len(mob_clean) < 10:
        raise HTTPException(status_code=400, detail="Please enter a valid 10-digit Indian mobile number.")

    # Validate stay dates
    d_in, d_out = validate_stay_dates(payload.check_in_date, payload.check_out_date)
    today_dt = ist_now().date()
    if d_in < today_dt:
        raise HTTPException(status_code=400, detail="Check-in date cannot be in the past.")

    # Calculate total guests formula
    adults = max(1, payload.adults)
    children = max(0, payload.children)
    infants = max(0, payload.infants)
    total_guests = adults + children + infants

    # 4. Find or create Customer record in MySQL
    customer = (
        db.query(Customer)
        .filter(Customer.mobile == mob_clean)
        .first()
    )
    if not customer:
        cust_code = generate_customer_code(db)
        customer = Customer(
            customer_code=cust_code,
            full_name=name,
            mobile=mob_clean,
            email=payload.email.strip() if payload.email else None,
            whatsapp=normalize_phone(payload.whatsapp) if payload.whatsapp else mob_clean,
            address_line=clean_str(payload.address),
            city=clean_str(payload.city),
            state=clean_str(payload.state) or "Maharashtra",
            pin_code=clean_str(payload.pin_code),
            company_name=clean_str(payload.company_name),
            gstin=(clean_str(payload.gstin) or "").upper() or None,
            customer_source="Public Website Enquiry",
        )
        db.add(customer)
        db.flush()
    else:
        # Update contact details if provided
        if payload.email and not customer.email:
            customer.email = payload.email.strip()
        if payload.address and not customer.address_line:
            customer.address_line = clean_str(payload.address)
        if payload.city and not customer.city:
            customer.city = clean_str(payload.city)
        if payload.pin_code and not customer.pin_code:
            customer.pin_code = clean_str(payload.pin_code)
        db.flush()

    # 5. Create Booking Enquiry
    enq_ref = generate_enquiry_reference(db)

    # Package validation (accept either Package UUID id or package_code)
    pkg_id = None
    if payload.package_id:
        pkg = db.query(Package).filter(
            (Package.id == payload.package_id) | (Package.package_code == payload.package_id)
        ).first()
        if pkg:
            pkg_id = pkg.id

    enquiry = BookingEnquiry(
        enquiry_reference=enq_ref,
        customer_id=customer.id,
        package_id=pkg_id,
        guest_name=name,
        guest_mobile=mob_clean,
        guest_email=payload.email.strip() if payload.email else None,
        guest_address=clean_str(payload.address),
        guest_city=clean_str(payload.city),
        guest_pin=clean_str(payload.pin_code),
        check_in_date=d_in,
        check_in_time=payload.check_in_time or "12:00 PM",
        check_out_date=d_out,
        check_out_time=payload.check_out_time or "11:00 AM",
        adults=adults,
        children=children,
        infants=infants,
        total_guests=total_guests,
        number_of_rooms=max(1, payload.number_of_rooms),
        dormitory_guests=max(0, payload.dormitory_guests),
        vehicle_count=len(payload.vehicles) if payload.vehicles else max(0, payload.vehicle_count),
        occasion=clean_str(payload.occasion),
        food_preferences=clean_str(payload.food_preferences),
        special_requirements=clean_str(payload.special_requirements),
        status="PENDING_REVIEW",
    )
    db.add(enquiry)
    db.flush()

    # 6. Save individual vehicle records
    saved_vehicles = []
    if payload.vehicles:
        for v in payload.vehicles:
            reg = (clean_str(v.registration_number) or "").upper().replace(" ", "")
            if reg:
                veh = Vehicle(
                    customer_id=customer.id,
                    enquiry_id=enquiry.id,
                    vehicle_type=clean_str(v.vehicle_type) or "Car",
                    registration_number=reg,
                    notes=clean_str(v.notes),
                )
                db.add(veh)
                saved_vehicles.append({"type": veh.vehicle_type, "reg": reg})

    # 7. Internal Notification for Resort Management
    notif = Notification(
        title=f"New Booking Enquiry: {enq_ref}",
        message=f"{name} ({mob_clean}) requested stay for {total_guests} guests on {d_in.strftime('%d %b %Y')}.",
        type="enquiry",
        link=f"/admin/enquiries?reference={enq_ref}",
    )
    db.add(notif)
    db.commit()

    # 8. Audit log
    log_activity(
        action="PUBLIC_BOOKING_ENQUIRY_SUBMITTED",
        module="enquiries",
        record_id=enq_ref,
        user_id=None,
        username=name,
        metadata={
            "enquiry_reference": enq_ref,
            "guest_name": name,
            "mobile": mob_clean,
            "check_in": d_in.isoformat(),
            "check_out": d_out.isoformat(),
            "guests": total_guests,
            "vehicles": len(saved_vehicles),
        },
    )

    return {
        "success": True,
        "enquiry_reference": enq_ref,
        "customer": {
            "customer_code": customer.customer_code,
            "full_name": customer.full_name,
            "mobile": customer.mobile,
        },
        "summary": {
            "check_in_date": d_in.isoformat(),
            "check_out_date": d_out.isoformat(),
            "total_guests": total_guests,
            "adults": adults,
            "children": children,
            "infants": infants,
            "vehicle_count": len(saved_vehicles),
            "vehicles": saved_vehicles,
            "status": "PENDING_REVIEW",
        },
        "message": "Your booking enquiry has been received successfully! Our team will review your dates and contact you to confirm.",
        "resort_phone": "8669408484",
    }


@router.get("/track-booking")
def track_public_booking(query: str = "", db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Public tracking for customers using Enquiry Ref (ENQ-...), Booking Ref (BKG-...), or 10-digit mobile."""
    q_str = (clean_str(query) or "").strip().upper()
    if not q_str:
        raise HTTPException(status_code=400, detail="Please enter an Enquiry Number, Booking Reference, or Mobile Number.")

    # 1. Search in confirmed Bookings first (by Booking ref, linked Enquiry ref, or Customer mobile)
    norm_mob = normalize_phone(q_str) if q_str.upper() != "N/A" else None
    mobile_cond = (Customer.mobile != "N/A") & ((Customer.mobile == q_str) | (Customer.mobile == norm_mob)) if norm_mob else (Booking.id == None)

    booking = (
        db.query(Booking)
        .join(Customer, Booking.customer_id == Customer.id)
        .outerjoin(BookingEnquiry, Booking.enquiry_id == BookingEnquiry.id)
        .filter(
            (Booking.booking_reference == q_str)
            | (BookingEnquiry.enquiry_reference == q_str)
            | mobile_cond
        )
        .order_by(Booking.created_at.desc())
        .first()
    )

    if booking:
        # Synchronize with active invoice if present
        active_inv = None
        if booking.invoices:
            for inv in reversed(booking.invoices):
                if inv.payment_status != "Cancelled":
                    active_inv = inv
                    break
        elif booking.customer_id:
            active_inv = db.query(Invoice).filter(
                (Invoice.booking_reference == booking.booking_reference)
                | (
                    (Invoice.customer_id == booking.customer_id)
                    & (Invoice.check_in_date == booking.check_in_date)
                ),
                Invoice.payment_status != "Cancelled",
            ).order_by(Invoice.created_at.desc()).first()

        if active_inv:
            tot = float(active_inv.grand_total)
            adv = float(active_inv.total_amount_paid)
            rem = float(active_inv.balance_due)
            pay_status = active_inv.payment_status
        else:
            tot = float(booking.total_amount)
            adv = float(booking.advance_paid)
            rem = float(booking.balance_due)
            pay_status = booking.payment_status or "Unpaid"

        c_name = booking.customer.full_name if booking.customer else "Guest"
        c_mob = booking.customer.mobile if booking.customer else ""
        pkg_name = booking.package.name if booking.package else "Custom Stay Package"
        enq_ref = booking.enquiry.enquiry_reference if booking.enquiry else None
        is_enq_query = q_str.startswith("ENQ-") or (enq_ref and q_str == enq_ref)

        return {
            "found": True,
            "type": "ENQUIRY" if is_enq_query else "BOOKING",
            "reference": enq_ref if is_enq_query else booking.booking_reference,
            "booking_reference": booking.booking_reference,
            "enquiry_reference": enq_ref,
            "guest_name": c_name,
            "contact_number": f"******{c_mob[-4:]}" if len(c_mob) >= 4 else c_mob,
            "package_name": pkg_name,
            "check_in_date": booking.check_in_date.isoformat(),
            "check_out_date": booking.check_out_date.isoformat(),
            "check_in_time": booking.check_in_time or "12:00 PM",
            "check_out_time": booking.check_out_time or "10:00 AM",
            "adults": booking.adults,
            "children": booking.children,
            "total_guests": booking.total_guests,
            "rooms": booking.number_of_rooms or 1,
            "booking_status": (
                "Cancelled"
                if (booking.booking_status or "").lower() == "cancelled"
                else ("APPROVED" if is_enq_query else booking.booking_status)
            ),
            "payment_status": pay_status,
            "total_amount": tot,
            "advance_paid": adv,
            "remaining_balance": rem,
            "created_at": booking.created_at.isoformat() if booking.created_at else None,
            "resort_phone": "8669408484",
        }

    # 2. Search in Booking Enquiries (unlinked, pending review, or rejected)
    enquiry = (
        db.query(BookingEnquiry)
        .join(Customer, BookingEnquiry.customer_id == Customer.id)
        .filter(
            (BookingEnquiry.enquiry_reference == q_str)
            | (Customer.mobile == q_str)
            | (Customer.mobile == normalize_phone(q_str))
        )
        .order_by(BookingEnquiry.created_at.desc())
        .first()
    )

    if enquiry:
        pkg_name = enquiry.package.name if enquiry.package else "Custom Stay Package"
        cust_name = enquiry.customer.full_name if enquiry.customer else "Guest"
        cust_mob = enquiry.customer.mobile if enquiry.customer else ""

        st = (enquiry.status or "PENDING_REVIEW").upper()
        if st in ("APPROVED", "CONFIRMED"):
            bkg_status = "APPROVED"
            pay_status = "Unpaid"
            pkg = enquiry.package
            if not pkg and enquiry.package_id:
                pkg = db.query(Package).filter(Package.id == enquiry.package_id).first()
            if not pkg:
                pkg = db.query(Package).filter(Package.category == "Stay").first() or db.query(Package).first()
            tot = 0.0
            if pkg and enquiry.check_in_date and enquiry.check_out_date:
                quote = calculate_package_quote(
                    {
                        "weekday_rate": float(pkg.weekday_rate),
                        "weekend_rate": float(pkg.weekend_rate),
                        "child_price": float(pkg.child_price),
                        "infant_price": float(pkg.infant_price),
                    },
                    check_in_date=str(enquiry.check_in_date),
                    check_out_date=str(enquiry.check_out_date),
                    adults=enquiry.adults,
                    children=enquiry.children,
                    infants=enquiry.infants,
                )
                tot = float(quote["total_package_amount"])
            adv = 0.0
            rem = tot
        elif st in ("REJECTED", "CANCELLED"):
            bkg_status = "REJECTED"
            pay_status = "Cancelled"
            tot = 0.0
            adv = 0.0
            rem = 0.0
        else:
            bkg_status = "PENDING_REVIEW"
            pay_status = "Pending Approval"
            tot = 0.0
            adv = 0.0
            rem = 0.0

        return {
            "found": True,
            "type": "ENQUIRY",
            "reference": enquiry.enquiry_reference,
            "booking_reference": enquiry.booking.booking_reference if enquiry.booking else None,
            "guest_name": cust_name,
            "contact_number": f"******{cust_mob[-4:]}" if len(cust_mob) >= 4 else cust_mob,
            "package_name": pkg_name,
            "check_in_date": enquiry.check_in_date.isoformat(),
            "check_out_date": enquiry.check_out_date.isoformat(),
            "check_in_time": enquiry.check_in_time or "12:00 PM",
            "check_out_time": enquiry.check_out_time or "10:00 AM",
            "adults": enquiry.adults,
            "children": enquiry.children,
            "total_guests": enquiry.total_guests,
            "rooms": enquiry.number_of_rooms or 1,
            "booking_status": bkg_status,
            "payment_status": pay_status,
            "total_amount": tot,
            "advance_paid": adv,
            "remaining_balance": rem,
            "review_remarks": enquiry.review_remarks,
            "created_at": enquiry.created_at.isoformat() if enquiry.created_at else None,
            "resort_phone": "8669408484",
        }

    return {
        "found": False,
        "message": f"No booking or enquiry found matching '{query}'. Please check your reference code or mobile number.",
    }
