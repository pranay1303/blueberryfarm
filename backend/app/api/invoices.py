from __future__ import annotations

import logging
import random
import time
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.authentication.security import require_owner, require_permission
from app.core.config import ist_now, settings
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Booking, BusinessSetting, Customer, Invoice, InvoiceItem, Payment, Quotation
from app.pdf.document_pdf import generate_invoice_pdf, generate_receipt_pdf
from app.schemas.requests import InvoiceAdjustmentRequest, InvoiceCreate
from app.services.calculations import round_money
from app.validations.validators import clean_str, normalize_phone, validate_gstin

logger = logging.getLogger("blueberry.invoices")
router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


def generate_invoice_number(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"INV-{year}-{random.randint(1000, 9999)}"
        if not db.query(Invoice).filter(Invoice.invoice_number == code).first():
            return code
    return f"INV-{year}-{int(time.time())}"


def generate_receipt_number(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"REC-{year}-{random.randint(1000, 9999)}"
        if not db.query(Payment).filter(Payment.receipt_number == code).first():
            return code
    return f"REC-{year}-{int(time.time())}"


def serialize_invoice(inv: Invoice) -> Dict[str, Any]:
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else "",
        "due_date": inv.due_date.isoformat() if inv.due_date else "",
        "document_title": inv.document_title,
        "customer_id": inv.customer_id,
        "customer_name": inv.customer_name,
        "customer_mobile": inv.customer_mobile,
        "customer_address": inv.customer_address,
        "customer_gstin": inv.customer_gstin,
        "contact_number": inv.customer_mobile,
        "booking_id": inv.booking_id,
        "booking_reference": inv.booking_reference,
        "check_in_date": inv.check_in_date.isoformat() if inv.check_in_date else "",
        "check_out_date": inv.check_out_date.isoformat() if inv.check_out_date else "",
        "subtotal": float(inv.subtotal),
        "discount_amount": float(inv.discount_amount),
        "cgst_amount": float(inv.cgst_amount),
        "sgst_amount": float(inv.sgst_amount),
        "igst_amount": float(inv.igst_amount),
        "tax_total": float(inv.tax_total),
        "grand_total": float(inv.grand_total),
        "total_amount_paid": float(inv.total_amount_paid),
        "balance_due": float(inv.balance_due),
        "payment_status": inv.payment_status,
        "is_finalized": inv.is_finalized,
        "has_pdf": bool(inv.pdf_path and (settings.STORAGE_DIR / inv.pdf_path).exists()),
        "line_items": [
            {
                "id": it.id,
                "description": it.description,
                "quantity": float(it.quantity),
                "rate": float(it.rate),
                "unit": it.unit,
                "discount": float(it.discount),
                "tax_rate": float(it.tax_rate),
                "amount": float(it.amount),
            }
            for it in inv.items
        ],
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
    }


@router.get("")
def list_invoices(
    search: Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("invoices:read")),
) -> Dict[str, Any]:
    q = db.query(Invoice)

    if payment_status and payment_status != "All":
        q = q.filter(Invoice.payment_status == payment_status)
    if date_from:
        q = q.filter(Invoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(Invoice.invoice_date <= date_to)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (Invoice.invoice_number.ilike(s))
            | (Invoice.customer_name.ilike(s))
            | (Invoice.customer_mobile.ilike(s))
            | (Invoice.booking_reference.ilike(s))
        )

    total = q.count()
    invoices = q.order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [serialize_invoice(inv) for inv in invoices], "total": total}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("invoices:write")),
) -> Dict[str, Any]:
    # 1. Customer resolution (Direct customer name OR existing customer ID)
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
        # Check by mobile to avoid duplicates
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
                customer_source="Direct Invoice",
            )
            db.add(customer)
            db.flush()

    # 2. Line Items & Financial Totals
    raw_items = [it.model_dump() for it in payload.line_items]
    subtotal = sum(Decimal(str(it.get("quantity", 1))) * Decimal(str(it.get("rate", 0))) for it in raw_items)
    discount = Decimal(str(payload.discount_amount or 0))

    # GST check
    cgst = Decimal("0.00")
    sgst = Decimal("0.00")
    igst = Decimal("0.00")
    gst_setting = db.query(BusinessSetting).filter(BusinessSetting.key == "tax_gst").first()
    gst_cfg = gst_setting.value_json if gst_setting and gst_setting.value_json else {}

    if payload.apply_gst and gst_cfg.get("enabled"):
        cgst_rate = Decimal(str(gst_cfg.get("cgst_rate", 6.0)))
        sgst_rate = Decimal(str(gst_cfg.get("sgst_rate", 6.0)))
        taxable = max(Decimal("0.00"), subtotal - discount)
        cgst = round(taxable * (cgst_rate / Decimal("100")), 2)
        sgst = round(taxable * (sgst_rate / Decimal("100")), 2)

    tax_total = cgst + sgst + igst
    grand_total = max(Decimal("0.00"), subtotal - discount + tax_total)

    init_pay = Decimal(str(payload.initial_payment_amount or 0))
    balance_due = max(Decimal("0.00"), grand_total - init_pay)

    pay_status = "Unpaid"
    doc_title = "TAX INVOICE"
    if init_pay >= grand_total and grand_total > 0:
        pay_status = "Paid"
        doc_title = "PAID INVOICE"
    elif init_pay > 0:
        pay_status = "Partially Paid"
        doc_title = "PARTIALLY PAID INVOICE"

    # Resolve linked booking BEFORE creating Invoice / Payment so FK is always a valid UUID
    booking = None
    if payload.booking_id:
        booking = db.query(Booking).filter((Booking.id == payload.booking_id) | (Booking.booking_reference == payload.booking_id)).first()
    elif payload.booking_reference:
        booking = db.query(Booking).filter(Booking.booking_reference == payload.booking_reference).first()
    elif customer and payload.check_in_date:
        booking = db.query(Booking).filter(
            Booking.customer_id == customer.id,
            Booking.check_in_date == payload.check_in_date,
        ).first()

    inv_num = generate_invoice_number(db)
    inv_date = payload.invoice_date or ist_now().date()

    invoice = Invoice(
        invoice_number=inv_num,
        customer_id=customer.id,
        booking_id=booking.id if booking else None,
        quotation_id=payload.quotation_id,
        invoice_date=inv_date,
        due_date=payload.due_date or inv_date,
        document_title=doc_title,
        customer_name=customer.full_name,
        customer_mobile=customer.mobile,
        customer_address=customer.address_line or cust_addr,
        customer_gstin=customer.gstin or cust_gstin,
        check_in_date=payload.check_in_date or (booking.check_in_date if booking else None),
        check_out_date=payload.check_out_date or (booking.check_out_date if booking else None),
        booking_reference=booking.booking_reference if booking else payload.booking_reference,
        subtotal=subtotal,
        discount_amount=discount,
        cgst_amount=cgst,
        sgst_amount=sgst,
        igst_amount=igst,
        tax_total=tax_total,
        grand_total=grand_total,
        total_amount_paid=init_pay,
        balance_due=balance_due,
        payment_status=pay_status,
        is_finalized=payload.finalize or False,
        created_by=current_user.get("full_name") or current_user.get("username"),
    )
    db.add(invoice)
    db.flush()

    for it in raw_items:
        qty = Decimal(str(it.get("quantity", 1)))
        rt = Decimal(str(it.get("rate", 0)))
        item = InvoiceItem(
            invoice_id=invoice.id,
            description=clean_str(it.get("description", "")) or "Item",
            quantity=qty,
            rate=rt,
            unit=it.get("unit", "person"),
            discount=Decimal(str(it.get("discount", 0))),
            tax_rate=Decimal(str(it.get("tax_rate", 0))),
            amount=qty * rt,
        )
        db.add(item)

    # 3. If initial payment recorded, create Payment record
    if init_pay > 0:
        rec_num = generate_receipt_number(db)
        payment = Payment(
            receipt_number=rec_num,
            customer_id=customer.id,
            booking_id=booking.id if booking else None,
            invoice_id=invoice.id,
            payment_date=inv_date,
            amount=init_pay,
            payment_type="Full" if init_pay >= grand_total else "Advance",
            payment_method=payload.initial_payment_method or "Cash",
            transaction_id=payload.transaction_id,
            received_by=current_user.get("full_name") or current_user.get("username"),
            notes=clean_str(payload.notes),
        )
        db.add(payment)

    # 3b. Sync with linked booking
    if booking:
        booking.total_amount = invoice.grand_total
        booking.advance_paid = invoice.total_amount_paid
        booking.balance_due = invoice.balance_due
        booking.payment_status = invoice.payment_status
        booking.updated_at = ist_now()

    db.commit()

    # 4. Generate Official ReportLab PDF
    inv_dict = serialize_invoice(invoice)
    try:
        pdf_rel = generate_invoice_pdf(inv_dict)
        invoice.pdf_path = pdf_rel
        db.commit()
    except Exception as exc:
        logger.error("Failed to generate PDF for invoice %s: %s", invoice.invoice_number, exc)

    log_activity(
        action="invoice_created",
        module="invoices",
        record_id=invoice.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"invoice_number": invoice.invoice_number, "grand_total": float(invoice.grand_total)},
    )

    return {"invoice": serialize_invoice(invoice), "customer": {"id": customer.id, "full_name": customer.full_name}}


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("invoices:read")),
) -> Dict[str, Any]:
    inv = db.query(Invoice).filter((Invoice.id == invoice_id) | (Invoice.invoice_number == invoice_id)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return {"invoice": serialize_invoice(inv)}


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("invoices:read")),
) -> FileResponse:
    inv = db.query(Invoice).filter((Invoice.id == invoice_id) | (Invoice.invoice_number == invoice_id)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    pdf_file = settings.STORAGE_DIR / (inv.pdf_path or f"invoices/{inv.invoice_number}.pdf")
    if not pdf_file.exists():
        inv_dict = serialize_invoice(inv)
        generate_invoice_pdf(inv_dict)

    return FileResponse(
        pdf_file,
        media_type="application/pdf",
        filename=f"Blueberry_Invoice_{inv.invoice_number}.pdf",
    )


@router.post("/{invoice_id}/adjust")
def adjust_invoice(
    invoice_id: str,
    payload: InvoiceAdjustmentRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    inv = db.query(Invoice).filter((Invoice.id == invoice_id) | (Invoice.invoice_number == invoice_id)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    adj_type = payload.adjustment_type
    if adj_type == "Cancellation":
        if inv.payment_status == "Cancelled":
            raise HTTPException(status_code=400, detail="Invoice is already cancelled.")
        inv.document_title = "CANCELLED INVOICE"
        inv.payment_status = "Cancelled"
        inv.cancellation_reason = clean_str(payload.reason)
        inv.updated_at = ist_now()

        # Re-sync linked booking if this was its active invoice
        if inv.booking:
            inv.booking.balance_due = max(Decimal("0.00"), inv.booking.total_amount - inv.booking.advance_paid)
            if inv.booking.advance_paid <= 0:
                inv.booking.payment_status = "Unpaid"
            elif inv.booking.balance_due <= 0:
                inv.booking.payment_status = "Paid"
            else:
                inv.booking.payment_status = "Partially Paid"
            inv.booking.updated_at = ist_now()

        db.commit()

        # Regenerate PDF with CANCELLED watermark/header
        try:
            generate_invoice_pdf(serialize_invoice(inv))
        except Exception:
            pass
    elif adj_type in ("Credit Note", "Correction"):
        if inv.payment_status == "Cancelled":
            raise HTTPException(status_code=400, detail="Cannot adjust a cancelled invoice.")
        inv.cancellation_reason = f"[{adj_type}] {clean_str(payload.reason) or ''}".strip()
        inv.updated_at = ist_now()
        db.commit()

    log_activity(
        action=f"invoice_adjustment_{adj_type.lower()}",
        module="invoices",
        record_id=inv.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"invoice_number": inv.invoice_number, "reason": payload.reason},
    )

    return {"invoice": serialize_invoice(inv), "message": f"Invoice adjustment ({adj_type}) completed."}
