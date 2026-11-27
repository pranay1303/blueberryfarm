from __future__ import annotations

import logging
import random
import time
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now, settings
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Booking, Customer, Invoice, InvoiceItem, Package, Quotation, QuotationItem
from app.pdf.document_pdf import generate_quotation_pdf
from app.schemas.requests import QuotationCalculateRequest, QuotationCreate, QuotationUpdate
from app.services.calculations import compute_document_totals, round_money
from app.validations.validators import clean_str, normalize_phone

logger = logging.getLogger("blueberry.quotations")
router = APIRouter(prefix="/api/quotations", tags=["Quotations"])


def generate_quotation_number(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"QT-{year}-{random.randint(1000, 9999)}"
        if not db.query(Quotation).filter(Quotation.quotation_number == code).first():
            return code
    return f"QT-{year}-{int(time.time())}"


def serialize_quotation(q: Quotation) -> Dict[str, Any]:
    booking_ref = q.booking.booking_reference if getattr(q, "booking", None) else None
    return {
        "id": q.id,
        "quotation_number": q.quotation_number,
        "customer_id": q.customer_id,
        "customer_name": q.customer.full_name if q.customer else "",
        "customer_mobile": q.customer.mobile if q.customer else "",
        "customer_address": q.customer.address_line if q.customer else "",
        "customer_email": q.customer.email if q.customer else "",
        "booking_id": q.booking_id,
        "converted_booking_id": q.booking_id,
        "booking_reference": booking_ref,
        "quotation_date": q.quotation_date.isoformat() if q.quotation_date else "",
        "valid_until": q.valid_until.isoformat() if q.valid_until else "",
        "check_in_date": q.check_in_date.isoformat() if q.check_in_date else "",
        "check_out_date": q.check_out_date.isoformat() if q.check_out_date else "",
        "package_name": q.package_name,
        "adults": q.adults,
        "children": q.children,
        "infants": q.infants,
        "subtotal": float(q.subtotal),
        "discount": float(q.discount),
        "tax_amount": float(q.tax_amount),
        "grand_total": float(q.grand_total),
        "advance_required": float(q.advance_required),
        "terms_and_conditions": q.terms_and_conditions,
        "notes": q.notes,
        "status": q.status,
        "created_by": q.created_by,
        "has_pdf": bool(q.pdf_path and (settings.STORAGE_DIR / q.pdf_path).exists()),
        "line_items": [
            {
                "id": it.id,
                "description": it.description,
                "inclusion_text": it.inclusion_text,
                "quantity": float(it.quantity),
                "rate": float(it.rate),
                "unit": it.unit,
                "discount": float(it.discount),
                "tax_rate": float(it.tax_rate),
                "amount": float(it.amount),
            }
            for it in q.items
        ],
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "updated_at": q.updated_at.isoformat() if q.updated_at else None,
    }


@router.get("")
def list_quotations(
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:read")),
) -> Dict[str, Any]:
    q = db.query(Quotation).join(Customer, Quotation.customer_id == Customer.id)

    if status_filter and status_filter != "All":
        q = q.filter(Quotation.status == status_filter)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (Quotation.quotation_number.ilike(s))
            | (Customer.full_name.ilike(s))
            | (Customer.mobile.ilike(s))
        )

    total = q.count()
    quotations = q.order_by(Quotation.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [serialize_quotation(item) for item in quotations], "total": total}


@router.post("/calculate")
def calculate_quotation_preview(
    payload: QuotationCalculateRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:read")),
) -> Dict[str, Any]:
    items_raw = [it.model_dump() for it in payload.line_items]
    subtotal = sum(Decimal(str(it.get("quantity", 1))) * Decimal(str(it.get("rate", 0))) for it in items_raw)
    additional = Decimal(str(payload.additional_charges or 0))
    tax_amount = Decimal("0.00")
    grand_total = max(Decimal("0.00"), subtotal + additional + tax_amount)
    return {
        "totals": {
            "subtotal": float(subtotal),
            "additional_charges": float(additional),
            "tax_total": float(tax_amount),
            "grand_total": float(grand_total),
        }
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:write")),
) -> Dict[str, Any]:
    customer = None
    if payload.customer_id:
        customer = db.query(Customer).filter((Customer.id == payload.customer_id) | (Customer.customer_code == payload.customer_id)).first()

    cust_name = clean_str(payload.customer_name)
    cust_mob = normalize_phone(payload.customer_mobile) if payload.customer_mobile else None
    cust_addr = clean_str(payload.customer_address)
    cleaned_gstin = clean_str(payload.customer_gstin)
    cust_gstin = cleaned_gstin.upper() if cleaned_gstin else None

    if not customer:
        if not cust_name:
            raise HTTPException(status_code=422, detail="Customer name or existing customer selection is required.")
        if cust_mob:
            customer = db.query(Customer).filter(Customer.mobile == cust_mob).first()
        if not customer:
            code = f"CUST-{random.randint(1000, 9999)}"
            while db.query(Customer).filter(Customer.customer_code == code).first():
                code = f"CUST-{random.randint(1000, 9999)}"
            customer = Customer(
                customer_code=code,
                full_name=cust_name,
                mobile=cust_mob or "N/A",
                address_line=cust_addr,
                gstin=cust_gstin,
                customer_source="Direct Quotation",
            )
            db.add(customer)
            db.flush()

    q_num = generate_quotation_number(db)
    items_raw = [it.model_dump() for it in payload.line_items]

    # Calculate item amounts & totals
    subtotal = sum(Decimal(str(it.get("quantity", 1))) * Decimal(str(it.get("rate", 0))) for it in items_raw)
    discount = Decimal(str(payload.discount_amount or 0))
    tax_amount = Decimal("0.00")
    grand_total = max(Decimal("0.00"), subtotal - discount + tax_amount)
    advance_req = Decimal(str(payload.advance_required or 0))

    quotation = Quotation(
        quotation_number=q_num,
        customer_id=customer.id,
        booking_id=payload.booking_id,
        quotation_date=payload.quotation_date or ist_now().date(),
        valid_until=payload.valid_until or (ist_now().date()),
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        package_name=clean_str(payload.package_name),
        adults=payload.adults or 2,
        children=payload.children or 0,
        infants=payload.infants or 0,
        subtotal=subtotal,
        discount=discount,
        tax_amount=tax_amount,
        grand_total=grand_total,
        advance_required=advance_req,
        terms_and_conditions=clean_str(payload.terms_and_conditions),
        notes=clean_str(payload.notes),
        status="Draft",
        created_by=current_user.get("full_name") or current_user.get("username"),
    )
    db.add(quotation)
    db.flush()

    for it in items_raw:
        qty = Decimal(str(it.get("quantity", 1)))
        rt = Decimal(str(it.get("rate", 0)))
        amt = qty * rt
        q_item = QuotationItem(
            quotation_id=quotation.id,
            description=clean_str(it.get("description", "")) or "Item",
            inclusion_text=clean_str(it.get("inclusion_text")),
            quantity=qty,
            rate=rt,
            unit=it.get("unit", "person"),
            discount=Decimal(str(it.get("discount", 0))),
            tax_rate=Decimal(str(it.get("tax_rate", 0))),
            amount=amt,
        )
        db.add(q_item)

    db.commit()

    # Generate ReportLab PDF
    q_dict = serialize_quotation(quotation)
    try:
        pdf_rel = generate_quotation_pdf(q_dict)
        quotation.pdf_path = pdf_rel
        db.commit()
    except Exception as exc:
        logger.error("Failed to generate PDF for quotation %s: %s", quotation.quotation_number, exc)

    log_activity(
        action="quotation_created",
        module="quotations",
        record_id=quotation.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"quotation_number": quotation.quotation_number, "customer": customer.full_name},
    )

    return {"quotation": serialize_quotation(quotation)}


@router.get("/{quotation_id}")
def get_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:read")),
) -> Dict[str, Any]:
    q = db.query(Quotation).filter((Quotation.id == quotation_id) | (Quotation.quotation_number == quotation_id)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found.")
    return {"quotation": serialize_quotation(q)}


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:read")),
) -> FileResponse:
    q = db.query(Quotation).filter((Quotation.id == quotation_id) | (Quotation.quotation_number == quotation_id)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found.")

    pdf_file = settings.STORAGE_DIR / (q.pdf_path or f"quotations/{q.quotation_number}.pdf")
    if not pdf_file.exists():
        q_dict = serialize_quotation(q)
        generate_quotation_pdf(q_dict)

    return FileResponse(
        pdf_file,
        media_type="application/pdf",
        filename=f"Blueberry_Quotation_{q.quotation_number}.pdf",
    )


@router.put("/{quotation_id}")
def update_quotation(
    quotation_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:write")),
) -> Dict[str, Any]:
    quotation = db.query(Quotation).filter((Quotation.id == quotation_id) | (Quotation.quotation_number == quotation_id)).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found.")

    if payload.get("customer_id"):
        quotation.customer_id = payload["customer_id"]
    elif payload.get("customer_name"):
        c_name = clean_str(payload["customer_name"])
        c_mob = normalize_phone(payload.get("customer_mobile")) if payload.get("customer_mobile") else None
        cust = None
        if c_mob:
            cust = db.query(Customer).filter(Customer.mobile == c_mob).first()
        if not cust:
            count = db.query(Customer).count() + 1
            cust = Customer(
                customer_code=f"CUST-{count:04d}",
                full_name=c_name,
                mobile=c_mob or "N/A",
                address_line=clean_str(payload.get("customer_address")),
                customer_source="Direct Quotation",
            )
            db.add(cust)
            db.flush()
        quotation.customer_id = cust.id

    if "check_in_date" in payload and payload["check_in_date"]:
        quotation.check_in_date = payload["check_in_date"]
    if "check_out_date" in payload and payload["check_out_date"]:
        quotation.check_out_date = payload["check_out_date"]
    if "package_name" in payload:
        quotation.package_name = clean_str(payload["package_name"])
    if "adults" in payload:
        quotation.adults = int(payload["adults"])
    if "children" in payload:
        quotation.children = int(payload["children"])
    if "infants" in payload:
        quotation.infants = int(payload["infants"])
    if "status" in payload:
        quotation.status = payload["status"]
    if "notes" in payload:
        quotation.notes = clean_str(payload["notes"])
    if "terms_and_conditions" in payload:
        quotation.terms_and_conditions = clean_str(payload["terms_and_conditions"])
    if "advance_required" in payload:
        quotation.advance_required = Decimal(str(payload["advance_required"] or 0))

    if "line_items" in payload and isinstance(payload["line_items"], list):
        db.query(QuotationItem).filter(QuotationItem.quotation_id == quotation.id).delete()
        items_raw = payload["line_items"]
        subtotal = sum(Decimal(str(it.get("quantity", 1))) * Decimal(str(it.get("rate", 0))) for it in items_raw)
        discount = Decimal(str(payload.get("discount_amount") or payload.get("discount") or 0))
        tax_amount = Decimal("0.00")
        grand_total = max(Decimal("0.00"), subtotal - discount + tax_amount)
        quotation.subtotal = subtotal
        quotation.discount = discount
        quotation.tax_amount = tax_amount
        quotation.grand_total = grand_total

        for it in items_raw:
            qty = Decimal(str(it.get("quantity", 1)))
            rt = Decimal(str(it.get("rate", 0)))
            amt = qty * rt
            db.add(
                QuotationItem(
                    quotation_id=quotation.id,
                    description=clean_str(it.get("description", "")) or "Item",
                    inclusion_text=clean_str(it.get("inclusion_text")),
                    quantity=qty,
                    rate=rt,
                    unit=it.get("unit", "person"),
                    discount=Decimal(str(it.get("discount", 0))),
                    tax_rate=Decimal(str(it.get("tax_rate", 0))),
                    amount=amt,
                )
            )

    db.commit()

    try:
        pdf_rel = generate_quotation_pdf(serialize_quotation(quotation))
        quotation.pdf_path = pdf_rel
        db.commit()
    except Exception as exc:
        logger.error("Failed to regenerate PDF: %s", exc)

    return {"quotation": serialize_quotation(quotation)}


@router.post("/{quotation_id}/convert-to-booking")
def convert_quotation_to_booking(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    quotation = db.query(Quotation).filter((Quotation.id == quotation_id) | (Quotation.quotation_number == quotation_id)).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found.")

    from app.api.bookings import serialize_booking

    # Prevent duplicate booking creation: check if quotation was already converted or has booking_id
    if quotation.booking_id:
        existing_booking = db.query(Booking).filter(Booking.id == quotation.booking_id).first()
        if existing_booking:
            return {
                "message": f"Quotation already converted to booking {existing_booking.booking_reference}.",
                "booking": serialize_booking(existing_booking),
                "quotation": serialize_quotation(quotation),
                "already_converted": True,
            }

    if quotation.status == "Converted":
        existing_booking = db.query(Booking).filter(
            Booking.customer_id == quotation.customer_id,
            Booking.check_in_date == quotation.check_in_date,
            Booking.check_out_date == quotation.check_out_date,
        ).first()
        if existing_booking:
            quotation.booking_id = existing_booking.id
            db.commit()
            return {
                "message": f"Quotation already converted to booking {existing_booking.booking_reference}.",
                "booking": serialize_booking(existing_booking),
                "quotation": serialize_quotation(quotation),
                "already_converted": True,
            }

    if not quotation.check_in_date or not quotation.check_out_date:
        raise HTTPException(status_code=422, detail="Quotation must have valid check-in and check-out dates before converting to a booking.")

    year = ist_now().strftime("%Y")
    ref = f"BKG-{year}-{random.randint(1000, 9999)}"
    while db.query(Booking).filter(Booking.booking_reference == ref).first():
        ref = f"BKG-{year}-{random.randint(1000, 9999)}"

    pkg = db.query(Package).filter(Package.name == quotation.package_name).first()

    booking = Booking(
        booking_reference=ref,
        customer_id=quotation.customer_id,
        package_id=pkg.id if pkg else None,
        check_in_date=quotation.check_in_date,
        check_out_date=quotation.check_out_date,
        adults=quotation.adults,
        children=quotation.children,
        infants=quotation.infants,
        total_guests=(quotation.adults or 0) + (quotation.children or 0) + (quotation.infants or 0),
        booking_status="Confirmed",
        payment_status="Unpaid",
        total_amount=quotation.grand_total,
        advance_paid=Decimal("0.00"),
        balance_due=quotation.grand_total,
        special_requests=quotation.notes,
    )
    db.add(booking)
    db.flush()

    quotation.status = "Converted"
    quotation.booking_id = booking.id
    db.commit()

    log_activity(
        action="quotation_converted_to_booking",
        module="quotations",
        record_id=quotation.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"quotation_number": quotation.quotation_number, "booking_reference": ref},
    )

    return {
        "message": f"Quotation converted to booking {ref}",
        "booking": serialize_booking(booking),
        "quotation": serialize_quotation(quotation),
    }


@router.post("/{quotation_id}/duplicate")
def duplicate_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("quotations:write")),
) -> Dict[str, Any]:
    quotation = db.query(Quotation).filter((Quotation.id == quotation_id) | (Quotation.quotation_number == quotation_id)).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found.")

    new_q_num = generate_quotation_number(db)
    new_q = Quotation(
        quotation_number=new_q_num,
        customer_id=quotation.customer_id,
        quotation_date=ist_now().date(),
        valid_until=ist_now().date(),
        check_in_date=quotation.check_in_date,
        check_out_date=quotation.check_out_date,
        package_name=quotation.package_name,
        adults=quotation.adults,
        children=quotation.children,
        infants=quotation.infants,
        subtotal=quotation.subtotal,
        discount=quotation.discount,
        tax_amount=quotation.tax_amount,
        grand_total=quotation.grand_total,
        advance_required=quotation.advance_required,
        terms_and_conditions=quotation.terms_and_conditions,
        notes=quotation.notes,
        status="Draft",
        created_by=current_user.get("full_name") or current_user.get("username"),
    )
    db.add(new_q)
    db.flush()

    for it in quotation.items:
        db.add(
            QuotationItem(
                quotation_id=new_q.id,
                description=it.description,
                inclusion_text=it.inclusion_text,
                quantity=it.quantity,
                rate=it.rate,
                unit=it.unit,
                discount=it.discount,
                tax_rate=it.tax_rate,
                amount=it.amount,
            )
        )

    db.commit()

    try:
        new_q.pdf_path = generate_quotation_pdf(serialize_quotation(new_q))
        db.commit()
    except Exception:
        pass

    return {"quotation": serialize_quotation(new_q)}

