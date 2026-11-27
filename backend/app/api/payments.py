from __future__ import annotations

import logging
import random
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now, settings
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Booking, Customer, Invoice, Payment, Refund
from app.pdf.document_pdf import generate_receipt_pdf
from app.schemas.requests import PaymentCreate
from app.services.calculations import round_money
from app.validations.validators import clean_str

logger = logging.getLogger("blueberry.payments")
router = APIRouter(prefix="/api/payments", tags=["Payments"])


def generate_receipt_number(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"REC-{year}-{random.randint(1000, 9999)}"
        if not db.query(Payment).filter(Payment.receipt_number == code).first():
            return code
    return f"REC-{year}-{int(time.time())}"


def serialize_payment(p: Payment) -> Dict[str, Any]:
    return {
        "id": p.id,
        "receipt_number": p.receipt_number,
        "payment_date": p.payment_date.isoformat() if p.payment_date else "",
        "amount": float(p.amount),
        "payment_type": p.payment_type,
        "payment_method": p.payment_method,
        "transaction_id": p.transaction_id,
        "customer_id": p.customer_id,
        "customer_name": p.customer.full_name if p.customer else "",
        "customer_mobile": p.customer.mobile if p.customer else "",
        "customer_address": p.customer.address_line if p.customer else "",
        "booking_id": p.booking_id,
        "booking_reference": p.booking.booking_reference if p.booking else None,
        "invoice_id": p.invoice_id,
        "invoice_number": p.invoice.invoice_number if p.invoice else None,
        "received_by": p.received_by,
        "notes": p.notes,
        "has_pdf": bool(p.receipt_pdf_path and (settings.STORAGE_DIR / p.receipt_pdf_path).exists()),
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("")
def list_payments(
    search: Optional[str] = Query(default=None),
    payment_method: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("payments:read")),
) -> Dict[str, Any]:
    q = db.query(Payment).join(Customer, Payment.customer_id == Customer.id)

    if payment_method and payment_method != "All":
        q = q.filter(Payment.payment_method == payment_method)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (Payment.receipt_number.ilike(s))
            | (Customer.full_name.ilike(s))
            | (Customer.mobile.ilike(s))
            | (Payment.transaction_id.ilike(s))
        )

    total = q.count()
    payments = q.order_by(Payment.payment_date.desc(), Payment.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [serialize_payment(p) for p in payments], "total": total}


@router.post("", status_code=status.HTTP_201_CREATED)
def record_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("payments:write")),
) -> Dict[str, Any]:
    # Locate Invoice or Booking
    invoice = None
    customer = None
    booking = None

    if payload.invoice_id:
        invoice = db.query(Invoice).filter((Invoice.id == payload.invoice_id) | (Invoice.invoice_number == payload.invoice_id)).first()
        if invoice:
            customer = invoice.customer
            booking = invoice.booking
            if not booking:
                if invoice.booking_reference:
                    booking = db.query(Booking).filter(Booking.booking_reference == invoice.booking_reference).first()
                if not booking and invoice.customer_id:
                    b_q = db.query(Booking).filter(Booking.customer_id == invoice.customer_id)
                    if invoice.check_in_date:
                        b_q = b_q.filter(Booking.check_in_date == invoice.check_in_date)
                    booking = b_q.order_by(Booking.created_at.desc()).first()
                if booking and not invoice.booking_id:
                    invoice.booking_id = booking.id

    if not customer and payload.customer_id:
        customer = db.query(Customer).filter((Customer.id == payload.customer_id) | (Customer.customer_code == payload.customer_id)).first()

    if not booking and payload.booking_id:
        booking = db.query(Booking).filter((Booking.id == payload.booking_id) | (Booking.booking_reference == payload.booking_id)).first()
        if booking and not customer:
            customer = booking.customer

    if not customer:
        raise HTTPException(status_code=400, detail="Could not associate payment with a customer or invoice.")

    if invoice and invoice.payment_status == "Cancelled":
        raise HTTPException(status_code=400, detail="Cannot record payment against a cancelled invoice.")

    amt = Decimal(str(payload.amount))
    if amt <= 0:
        raise HTTPException(status_code=422, detail="Payment amount must be greater than zero.")

    is_refund = (payload.payment_type or "").strip().lower() == "refund"

    if invoice and not is_refund and invoice.grand_total > 0 and amt > invoice.balance_due:
        raise HTTPException(
            status_code=422,
            detail=f"Payment amount (₹{amt:,.2f}) exceeds remaining invoice balance (₹{invoice.balance_due:,.2f}).",
        )
    if invoice and is_refund and amt > invoice.total_amount_paid:
        raise HTTPException(
            status_code=422,
            detail=f"Refund amount (₹{amt:,.2f}) exceeds total amount paid (₹{invoice.total_amount_paid:,.2f}).",
        )

    rec_num = generate_receipt_number(db)
    payment = Payment(
        receipt_number=rec_num,
        customer_id=customer.id,
        booking_id=booking.id if booking else None,
        invoice_id=invoice.id if invoice else None,
        payment_date=payload.payment_date or ist_now().date(),
        amount=amt,
        payment_type=payload.payment_type or "Advance",
        payment_method=payload.payment_method or "Google Pay",
        transaction_id=clean_str(payload.transaction_id),
        received_by=current_user.get("full_name") or current_user.get("username"),
        notes=clean_str(payload.notes),
    )
    db.add(payment)
    db.flush()

    # Update related invoice balance if present
    if invoice:
        if is_refund:
            invoice.total_amount_paid = max(Decimal("0.00"), invoice.total_amount_paid - amt)
        else:
            invoice.total_amount_paid += amt
        invoice.balance_due = max(Decimal("0.00"), invoice.grand_total - invoice.total_amount_paid)
        if invoice.total_amount_paid <= 0 and invoice.grand_total > 0:
            invoice.payment_status = "Unpaid"
            invoice.document_title = "TAX INVOICE"
        elif invoice.balance_due <= 0:
            invoice.payment_status = "Paid"
            invoice.document_title = "PAID INVOICE"
        else:
            invoice.payment_status = "Partially Paid"
            invoice.document_title = "PARTIALLY PAID INVOICE"
        invoice.updated_at = ist_now()

    # Update booking financial totals if present
    if booking:
        if invoice:
            booking.total_amount = invoice.grand_total
            booking.advance_paid = invoice.total_amount_paid
            booking.balance_due = invoice.balance_due
            booking.payment_status = invoice.payment_status
        else:
            if is_refund:
                booking.advance_paid = max(Decimal("0.00"), booking.advance_paid - amt)
            else:
                booking.advance_paid += amt
            if booking.total_amount <= 0 and not is_refund:
                booking.total_amount = booking.advance_paid
            booking.balance_due = max(Decimal("0.00"), booking.total_amount - booking.advance_paid)
            if booking.advance_paid <= 0 and booking.total_amount > 0:
                booking.payment_status = "Unpaid"
            elif booking.balance_due <= 0:
                booking.payment_status = "Paid"
            else:
                booking.payment_status = "Partially Paid"
        booking.updated_at = ist_now()

    db.commit()

    # Regenerate linked invoice PDF so it reflects the updated payment status/balance
    if invoice:
        try:
            from app.api.invoices import serialize_invoice
            from app.pdf.document_pdf import generate_invoice_pdf
            invoice.pdf_path = generate_invoice_pdf(serialize_invoice(invoice))
            db.commit()
        except Exception as exc:
            logger.error("Failed to refresh invoice PDF for %s: %s", invoice.invoice_number, exc)

    # Generate Official Receipt PDF
    p_dict = serialize_payment(payment)
    try:
        pdf_rel = generate_receipt_pdf(p_dict)
        payment.receipt_pdf_path = pdf_rel
        db.commit()
    except Exception as exc:
        logger.error("Failed to generate receipt PDF for %s: %s", payment.receipt_number, exc)

    log_activity(
        action="payment_recorded",
        module="payments",
        record_id=payment.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"receipt_number": payment.receipt_number, "amount": float(payment.amount)},
    )

    return {"payment": serialize_payment(payment)}


@router.get("/{payment_id}/receipt")
def download_payment_receipt_pdf(
    payment_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("payments:read")),
) -> FileResponse:
    p = db.query(Payment).filter((Payment.id == payment_id) | (Payment.receipt_number == payment_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    pdf_file = settings.STORAGE_DIR / (p.receipt_pdf_path or f"receipts/{p.receipt_number}.pdf")
    if not pdf_file.exists():
        p_dict = serialize_payment(p)
        generate_receipt_pdf(p_dict)

    return FileResponse(
        pdf_file,
        media_type="application/pdf",
        filename=f"Blueberry_Receipt_{p.receipt_number}.pdf",
    )
