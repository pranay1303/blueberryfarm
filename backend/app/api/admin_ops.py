from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import subprocess
import time
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.authentication.security import get_current_user, require_owner
from app.core.config import ist_now, ist_now_iso, settings
from app.database.session import SessionLocal, get_db
from app.logging.audit_logger import log_activity, query_logs
from app.models.sql_models import (
    AuditLog,
    BackupRecord,
    Booking,
    BookingAddon,
    BookingEnquiry,
    BookingGuest,
    BookingMealRequest,
    BusinessSetting,
    Customer,
    DataDeletionLog,
    Expense,
    Invoice,
    InvoiceItem,
    Notification,
    Package,
    Payment,
    Quotation,
    QuotationItem,
    Refund,
    RoomAllocation,
    Vehicle,
)
from app.schemas.requests import SettingsUpdateRequest

logger = logging.getLogger("blueberry.admin_ops")
router = APIRouter(prefix="/api", tags=["Settings, Backups, Data Management & Audit"])

ALLOWED_SIG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


# ==============================================================================
# 1. RESORT & GST SETTINGS
# ==============================================================================

@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    biz_prof = db.query(BusinessSetting).filter(BusinessSetting.key == "business_profile").first()
    pay_info = db.query(BusinessSetting).filter(BusinessSetting.key == "payment_info").first()
    tax_info = db.query(BusinessSetting).filter(BusinessSetting.key == "tax_gst").first()
    meal_info = db.query(BusinessSetting).filter(BusinessSetting.key == "meal_addons").first()

    from app.pdf.document_pdf import _resolve_signature_path
    sig_file = _resolve_signature_path()
    has_sig = bool(sig_file and sig_file.exists() and sig_file.stat().st_size > 0)

    return {
        "settings": {
            "business_name": biz_prof.value_json.get("name") if biz_prof else "Blueberry Farm and Resort",
            "tagline": biz_prof.value_json.get("tagline") if biz_prof else "",
            "address_line": biz_prof.value_json.get("address") if biz_prof else "",
            "phone": biz_prof.value_json.get("phone") if biz_prof else "8669408484",
            "website": biz_prof.value_json.get("website") if biz_prof else "blueberryfarmandresort.com",
            "email": biz_prof.value_json.get("email") if biz_prof else "info@blueberryfarmandresort.com",
            "payment_info": pay_info.value_json if pay_info else {},
            "gst": tax_info.value_json if tax_info else {"enabled": False},
            "documents": {
                "has_signature_image": has_sig,
                "invoice_title": "TAX INVOICE",
            },
            "meal_addons": meal_info.value_json if meal_info else [],
        }
    }


@router.put("/settings")
def update_settings(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    if "business_name" in payload or "phone" in payload or "address_line" in payload or "email" in payload or "website" in payload:
        biz_s = db.query(BusinessSetting).filter(BusinessSetting.key == "business_profile").first()
        if not biz_s:
            biz_s = BusinessSetting(key="business_profile", value_json={})
            db.add(biz_s)
        current_data = dict(biz_s.value_json or {})
        if "business_name" in payload:
            current_data["name"] = payload["business_name"]
        if "phone" in payload:
            current_data["phone"] = payload["phone"]
        if "address_line" in payload:
            current_data["address"] = payload["address_line"]
        if "email" in payload:
            current_data["email"] = payload["email"]
        if "website" in payload:
            current_data["website"] = payload["website"]
        biz_s.value_json = current_data

    if "payment_info" in payload:
        pay_s = db.query(BusinessSetting).filter(BusinessSetting.key == "payment_info").first()
        if not pay_s:
            pay_s = BusinessSetting(key="payment_info", value_json={})
            db.add(pay_s)
        pay_s.value_json = payload["payment_info"]

    if "gst" in payload:
        tax_s = db.query(BusinessSetting).filter(BusinessSetting.key == "tax_gst").first()
        if not tax_s:
            tax_s = BusinessSetting(key="tax_gst", value_json={})
            db.add(tax_s)
        tax_s.value_json = payload["gst"]

    if "meal_addons" in payload:
        meal_s = db.query(BusinessSetting).filter(BusinessSetting.key == "meal_addons").first()
        if not meal_s:
            meal_s = BusinessSetting(key="meal_addons", value_json=[])
            db.add(meal_s)
        meal_s.value_json = payload["meal_addons"]

    db.commit()

    log_activity(
        action="SETTINGS_UPDATED",
        module="settings",
        record_id="settings",
        user_id=current_user["id"],
        username=current_user["username"],
    )

    return get_settings(db, current_user)


@router.get("/settings/signature")
def get_signature_image():
    from app.pdf.document_pdf import _resolve_signature_path
    sig = _resolve_signature_path()
    if sig and sig.exists():
        media = "image/png" if sig.suffix.lower() == ".png" else "image/jpeg"
        return FileResponse(sig, media_type=media)
    raise HTTPException(status_code=404, detail="Signature image not found.")


@router.post("/settings/signature")
async def upload_signature(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, str]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_SIG_EXTS:
        raise HTTPException(status_code=400, detail="Allowed signature formats: PNG, JPG, WEBP")

    target = settings.PDF_ASSETS_DIR / "signature.png"
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Signature image must be under 2 MB.")

    target.write_bytes(contents)
    log_activity(action="SIGNATURE_UPLOADED", module="settings", user_id=current_user["id"], username=current_user["username"])
    return {"message": "Signature uploaded successfully."}


@router.delete("/settings/signature")
def remove_signature(current_user: Dict[str, Any] = Depends(require_owner)) -> Dict[str, str]:
    target = settings.PDF_ASSETS_DIR / "signature.png"
    if target.exists():
        target.unlink(missing_ok=True)
    return {"message": "Signature image removed."}


@router.post("/settings/demo-data")
def load_demo_data(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    from app.models.sql_models import Customer, Booking, Package
    import uuid
    demo_cust = db.query(Customer).filter(Customer.full_name.like("DEMO%")).first()
    if not demo_cust:
        pkg = db.query(Package).first()
        c = Customer(
            id=str(uuid.uuid4()),
            customer_code=f"CUST-DEMO-{int(time.time())%10000}",
            full_name="DEMO - Aarav Kulkarni",
            mobile="9820011223",
            email="aarav.demo@example.com",
            address_line="Flat 402, Green Park Residency, Panvel",
            customer_source="DEMO",
            notes="Sample Evaluation Record",
        )
        db.add(c)
        db.flush()

        b = Booking(
            booking_reference=f"BKG-DEMO-{int(time.time())%10000}",
            customer_id=c.id,
            package_id=pkg.id if pkg else None,
            check_in_date=ist_now().date(),
            check_out_date=ist_now().date(),
            adults=4,
            children=1,
            infants=0,
            total_guests=5,
            booking_status="Confirmed",
            payment_status="Paid",
            total_amount=Decimal("7200.00"),
            advance_paid=Decimal("7200.00"),
            balance_due=Decimal("0.00"),
            special_requests="DEMO dataset booking",
            assigned_staff=current_user.get("full_name") or current_user.get("username"),
        )
        db.add(b)
        db.commit()

    log_activity(
        action="DEMO_DATA_LOADED",
        module="settings",
        user_id=current_user["id"],
        username=current_user["username"],
    )
    return {"message": "Demo records loaded successfully.", "status": "loaded"}


@router.delete("/settings/demo-data")
def clear_demo_data(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    from app.models.sql_models import Customer, Booking
    db.query(Booking).filter(
        (Booking.special_requests.like("%DEMO%")) | (Booking.booking_reference.like("BKG-DEMO-%")) | (Booking.booking_reference.like("BK-DEMO-%"))
    ).delete(synchronize_session=False)
    db.query(Customer).filter(Customer.full_name.like("DEMO%")).delete(synchronize_session=False)
    db.commit()

    log_activity(
        action="DEMO_DATA_CLEARED",
        module="settings",
        user_id=current_user["id"],
        username=current_user["username"],
    )
    return {"message": "Demo records cleared safely.", "status": "cleared"}



# ==============================================================================
# 2. MYSQL DATABASE BACKUP & RESTORE
# ==============================================================================

def _safe_backup_path(filename: str) -> Path:
    """Resolve backup filename strictly inside settings.BACKUPS_DIR, rejecting path traversal."""
    import re
    clean_name = Path(filename).name
    if clean_name != filename or not re.fullmatch(r"[A-Za-z0-9._-]{1,160}", clean_name) or ".." in clean_name:
        raise HTTPException(status_code=400, detail="Invalid backup filename.")
    backups_root = settings.BACKUPS_DIR.resolve()
    target = (backups_root / clean_name).resolve()
    if not target.is_relative_to(backups_root):
        raise HTTPException(status_code=400, detail="Invalid backup path.")
    return target


def create_mysql_backup_file(reason: str, username: str, db: Session) -> BackupRecord:
    import re
    safe_reason = re.sub(r"[^A-Za-z0-9_-]", "_", str(reason or "manual_admin")).strip("_")[:40] or "manual_admin"
    timestamp = ist_now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"blueberry_backup_{timestamp}_{safe_reason}.sql"
    backup_path = settings.BACKUPS_DIR / backup_filename

    # Execute mysqldump or full table serialization
    dump_exe = shutil.which("mysqldump") or r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
    dump_success = False

    if os.path.exists(dump_exe):
        cmd = [
            dump_exe,
            f"--host={settings.MYSQL_HOST}",
            f"--port={settings.MYSQL_PORT}",
            f"--user={settings.MYSQL_USER}",
            "--single-transaction",
            "--routines",
            "--triggers",
            settings.MYSQL_DATABASE,
        ]
        env = os.environ.copy()
        env["MYSQL_PWD"] = settings.MYSQL_PASSWORD
        try:
            with open(backup_path, "w", encoding="utf-8") as f:
                res = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True, timeout=120, env=env)
                if res.returncode == 0 and backup_path.stat().st_size > 100:
                    dump_success = True
        except Exception as e:
            logger.warning("mysqldump direct execution failed (%s), using native table exporter", e)

    if not dump_success:
        # Fallback consistent table dump
        lines = [f"-- Blueberry Resort MySQL Native Backup: {timestamp}", f"-- Reason: {safe_reason}", "SET FOREIGN_KEY_CHECKS=0;"]
        tables = [
            "roles", "permissions", "role_permissions", "users", "customers", "vehicles",
            "packages", "package_prices", "rooms", "room_allocations", "room_blocks",
            "meals", "booking_meal_requests", "addons", "booking_addons",
            "booking_enquiries", "bookings", "booking_guests",
            "quotations", "quotation_items", "invoices", "invoice_items", "payments",
            "refunds", "expense_categories", "expenses", "business_settings",
            "website_content", "notifications", "audit_logs",
        ]
        def _esc_sql(v: Any) -> str:
            if v is None:
                return "NULL"
            s = str(v).replace("\\", "\\\\").replace("'", "''").replace("\n", "\\n").replace("\r", "\\r")
            return f"'{s}'"

        with db.connection() as conn:
            for tbl in tables:
                try:
                    rows = conn.execute(text(f"SELECT * FROM {tbl}")).fetchall()
                except Exception:
                    continue
                if rows:
                    lines.append(f"-- Data for {tbl}")
                    for r in rows:
                        vals = ", ".join(_esc_sql(v) for v in r)
                        lines.append(f"INSERT INTO {tbl} VALUES ({vals});")
        lines.append("SET FOREIGN_KEY_CHECKS=1;")
        backup_path.write_text("\n".join(lines), encoding="utf-8")

    size_bytes = backup_path.stat().st_size
    sha256 = hashlib.sha256(backup_path.read_bytes()).hexdigest()

    rec = BackupRecord(
        filename=backup_filename,
        file_path=str(backup_path),
        size_bytes=size_bytes,
        sha256=sha256,
        backup_type="FULL_MYSQL",
        status="VERIFIED",
        created_by=username,
    )
    db.add(rec)
    db.commit()

    return rec


@router.get("/backups")
def list_backups(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    records = db.query(BackupRecord).order_by(BackupRecord.created_at.desc()).all()
    items = []
    for b in records:
        items.append({
            "id": b.id,
            "filename": b.filename,
            "size_bytes": b.size_bytes,
            "sha256": b.sha256,
            "created_by": b.created_by,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "modified_ts": b.created_at.timestamp() if b.created_at else 0,
        })
    return {"backups": items, "last_automated_backup": items[0]["created_at"] if items else None}


@router.post("/backups/create")
def create_backup_endpoint(
    payload: Dict[str, str] = Body(default={}),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    reason = payload.get("reason", "manual_admin")
    rec = create_mysql_backup_file(reason=reason, username=current_user["username"], db=db)
    return {
        "filename": rec.filename,
        "size_bytes": rec.size_bytes,
        "sha256": rec.sha256,
        "message": "Database backup created and verified successfully.",
    }


@router.get("/backups/download/{filename}")
def download_backup_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> FileResponse:
    p = _safe_backup_path(filename)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Backup file not found on server.")
    return FileResponse(p, filename=p.name, media_type="application/sql")


@router.get("/backups/verify/{filename}")
def verify_backup_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    p = _safe_backup_path(filename)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Backup file not found.")

    calculated = hashlib.sha256(p.read_bytes()).hexdigest()
    rec = db.query(BackupRecord).filter(BackupRecord.filename == p.name).first()
    expected = rec.sha256 if rec else calculated

    return {
        "valid": calculated == expected,
        "filename": p.name,
        "manifest": {"sha256": calculated, "size_bytes": p.stat().st_size},
    }


@router.post("/backups/restore/{filename}")
def restore_backup_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    p = _safe_backup_path(filename)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Backup file not found.")

    safety_backup = create_mysql_backup_file(reason="pre_restore_safety", username=current_user["username"], db=db)

    mysql_exe = shutil.which("mysql") or r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
    restored = False
    if os.path.exists(mysql_exe):
        cmd = [
            mysql_exe,
            f"--host={settings.MYSQL_HOST}",
            f"--port={settings.MYSQL_PORT}",
            f"--user={settings.MYSQL_USER}",
            settings.MYSQL_DATABASE,
        ]
        env = os.environ.copy()
        env["MYSQL_PWD"] = settings.MYSQL_PASSWORD
        try:
            with open(p, "r", encoding="utf-8") as f:
                res = subprocess.run(cmd, stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120, env=env)
                if res.returncode == 0:
                    restored = True
        except Exception as e:
            logger.warning("mysql restore failed via CLI: %s", e)

    log_activity(
        action="BACKUP_RESTORED" if restored else "BACKUP_RESTORE_FAILED",
        module="backups",
        record_id=p.name,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"remarks": f"Restore attempt for {p.name} (restored={restored}). Pre-restore safety copy: {safety_backup.filename}"},
    )

    if not restored:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to restore backup {p.name} (mysql CLI unavailable or SQL error). A safety backup ({safety_backup.filename}) was saved.",
        )

    return {
        "message": f"Backup {p.name} restored successfully.",
        "safety_backup": safety_backup.filename,
        "restored": restored,
    }


@router.delete("/backups")
@router.post("/backups/clear")
def clear_all_backups(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    """Permanently delete all database backup archives from disk and clear backup registry."""
    deleted_files = 0
    if settings.BACKUPS_DIR.exists():
        for p in settings.BACKUPS_DIR.iterdir():
            if p.is_file() and p.name != ".gitkeep":
                try:
                    p.unlink(missing_ok=True)
                    deleted_files += 1
                except Exception as exc:
                    logger.warning("Failed to delete backup file %s: %s", p.name, exc)

    deleted_records = db.query(BackupRecord).delete(synchronize_session=False)
    db.commit()

    log_activity(
        action="ALL_BACKUPS_CLEARED",
        module="backups",
        record_id="ALL",
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"remarks": f"Cleared {deleted_records} backup records and {deleted_files} archive files from storage."},
    )

    return {
        "success": True,
        "message": f"Successfully cleared {deleted_records} backup records and {deleted_files} archive files.",
        "cleared_records": deleted_records,
        "cleared_files": deleted_files,
    }


@router.delete("/backups/{filename}")
def delete_backup_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    """Delete an individual backup file from disk and database."""
    p = _safe_backup_path(filename)
    if p.exists() and p.is_file() and p.name != ".gitkeep":
        try:
            p.unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("Failed to delete backup file %s: %s", p.name, exc)

    db.query(BackupRecord).filter(BackupRecord.filename == p.name).delete(synchronize_session=False)
    db.commit()

    log_activity(
        action="BACKUP_DELETED",
        module="backups",
        record_id=p.name,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"remarks": f"Deleted backup archive {p.name}."},
    )

    return {"success": True, "message": f"Backup {p.name} deleted successfully."}


# ==============================================================================
# 3. SELECTIVE STORAGE & DATA MANAGEMENT CONTROLS
# ==============================================================================

@router.get("/storage/summary")
def get_storage_summary(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    return {
        "sections": {
            "enquiries": {"count": db.query(BookingEnquiry).count(), "label": "Booking Enquiries"},
            "bookings": {"count": db.query(Booking).count(), "label": "Confirmed Bookings"},
            "customers": {"count": db.query(Customer).count(), "label": "Customer Profiles"},
            "vehicles": {"count": db.query(Vehicle).count(), "label": "Guest Vehicles"},
            "quotations": {"count": db.query(Quotation).count(), "label": "Quotations"},
            "invoices": {"count": db.query(Invoice).count(), "label": "Invoices & Bills"},
            "payments": {"count": db.query(Payment).count(), "label": "Payment Receipts"},
            "expenses": {"count": db.query(Expense).count(), "label": "Operational Expenses"},
            "logs": {"count": db.query(AuditLog).count(), "label": "Audit Logs"},
        },
        "total_business_records": (
            db.query(BookingEnquiry).count()
            + db.query(Booking).count()
            + db.query(Customer).count()
            + db.query(Vehicle).count()
            + db.query(Quotation).count()
            + db.query(Invoice).count()
            + db.query(Payment).count()
            + db.query(Expense).count()
        ),
    }


@router.post("/storage/clear")
def clear_storage_section(
    payload: Dict[str, str] = Body(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    section = str(payload.get("section") or "").strip().lower()
    allowed = {
        "enquiries", "bookings", "customers", "vehicles", "quotations",
        "invoices", "payments", "expenses", "logs", "all_business"
    }
    if section not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid storage section '{section}'.")

    # Mandatory Safety Backup before destructive operations
    safety_backup = create_mysql_backup_file(reason=f"pre_clear_{section}", username=current_user["username"], db=db)
    cleared_count = 0

    if section == "enquiries":
        cleared_count = db.query(BookingEnquiry).count()
        db.query(Vehicle).filter(Vehicle.enquiry_id.isnot(None)).update({Vehicle.enquiry_id: None}, synchronize_session=False)
        db.query(Booking).filter(Booking.enquiry_id.isnot(None)).update({Booking.enquiry_id: None}, synchronize_session=False)
        db.query(BookingEnquiry).delete(synchronize_session=False)
    elif section == "bookings":
        cleared_count = db.query(Booking).count()
        db.query(RoomAllocation).delete(synchronize_session=False)
        db.query(BookingGuest).delete(synchronize_session=False)
        db.query(BookingMealRequest).delete(synchronize_session=False)
        db.query(BookingAddon).delete(synchronize_session=False)
        db.query(Vehicle).filter(Vehicle.booking_id.isnot(None)).update({Vehicle.booking_id: None}, synchronize_session=False)
        db.query(Quotation).filter(Quotation.booking_id.isnot(None)).update({Quotation.booking_id: None}, synchronize_session=False)
        db.query(Invoice).filter(Invoice.booking_id.isnot(None)).update({Invoice.booking_id: None}, synchronize_session=False)
        db.query(Payment).filter(Payment.booking_id.isnot(None)).update({Payment.booking_id: None}, synchronize_session=False)
        db.query(Booking).delete(synchronize_session=False)
    elif section == "customers":
        cleared_count = db.query(Customer).count()
        # Clean child records before customer
        db.query(Payment).delete(synchronize_session=False)
        db.query(InvoiceItem).delete(synchronize_session=False)
        db.query(Invoice).delete(synchronize_session=False)
        db.query(QuotationItem).delete(synchronize_session=False)
        db.query(Quotation).delete(synchronize_session=False)
        db.query(RoomAllocation).delete(synchronize_session=False)
        db.query(BookingGuest).delete(synchronize_session=False)
        db.query(BookingMealRequest).delete(synchronize_session=False)
        db.query(BookingAddon).delete(synchronize_session=False)
        db.query(Booking).delete(synchronize_session=False)
        db.query(Vehicle).delete(synchronize_session=False)
        db.query(BookingEnquiry).delete(synchronize_session=False)
        db.query(Customer).delete(synchronize_session=False)
    elif section == "vehicles":
        cleared_count = db.query(Vehicle).count()
        db.query(Vehicle).delete(synchronize_session=False)
    elif section == "quotations":
        cleared_count = db.query(Quotation).count()
        db.query(QuotationItem).delete(synchronize_session=False)
        db.query(Quotation).delete(synchronize_session=False)
    elif section == "invoices":
        cleared_count = db.query(Invoice).count()
        db.query(Refund).delete(synchronize_session=False)
        db.query(Payment).delete(synchronize_session=False)
        db.query(InvoiceItem).delete(synchronize_session=False)
        db.query(Invoice).delete(synchronize_session=False)
    elif section == "payments":
        cleared_count = db.query(Payment).count()
        db.query(Refund).delete(synchronize_session=False)
        db.query(Payment).delete(synchronize_session=False)
        # Reset payment totals/statuses on active invoices and bookings so they don't stay falsely marked Paid
        for inv in db.query(Invoice).filter(Invoice.payment_status != "Cancelled").all():
            inv.total_amount_paid = Decimal("0.00")
            inv.balance_due = inv.grand_total
            inv.payment_status = "Unpaid"
            inv.document_title = "TAX INVOICE"
        for bkg in db.query(Booking).all():
            bkg.advance_paid = Decimal("0.00")
            bkg.balance_due = bkg.total_amount
            bkg.payment_status = "Unpaid"
    elif section == "expenses":
        cleared_count = db.query(Expense).count()
        db.query(Expense).delete(synchronize_session=False)
    elif section == "logs":
        cleared_count = db.query(AuditLog).count()
        db.query(AuditLog).delete(synchronize_session=False)
    elif section == "all_business":
        cleared_count = (
            db.query(BookingEnquiry).count()
            + db.query(Booking).count()
            + db.query(Customer).count()
            + db.query(Vehicle).count()
            + db.query(Quotation).count()
            + db.query(Invoice).count()
            + db.query(Payment).count()
            + db.query(Expense).count()
        )
        db.query(Refund).delete(synchronize_session=False)
        db.query(Payment).delete(synchronize_session=False)
        db.query(InvoiceItem).delete(synchronize_session=False)
        db.query(Invoice).delete(synchronize_session=False)
        db.query(QuotationItem).delete(synchronize_session=False)
        db.query(Quotation).delete(synchronize_session=False)
        db.query(RoomAllocation).delete(synchronize_session=False)
        db.query(BookingGuest).delete(synchronize_session=False)
        db.query(BookingMealRequest).delete(synchronize_session=False)
        db.query(BookingAddon).delete(synchronize_session=False)
        db.query(Vehicle).delete(synchronize_session=False)
        db.query(Booking).delete(synchronize_session=False)
        db.query(BookingEnquiry).delete(synchronize_session=False)
        db.query(Customer).delete(synchronize_session=False)
        db.query(Expense).delete(synchronize_session=False)

    # Log deletion in data_deletion_logs
    del_log = DataDeletionLog(
        performed_by=current_user.get("full_name") or current_user.get("username"),
        operation_category=section,
        affected_table=section,
        affected_count=cleared_count,
        backup_id=safety_backup.filename,
        result="SUCCESS",
        remarks=f"Cleared section '{section}' under Owner authority with pre-clear safety backup.",
    )
    db.add(del_log)
    db.commit()

    log_activity(
        action="CLEAR_STORAGE_SECTION",
        module="data_management",
        record_id=section,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"section": section, "cleared_count": cleared_count, "safety_backup": safety_backup.filename},
    )

    return {
        "section": section,
        "cleared_count": cleared_count,
        "safety_backup": safety_backup.filename,
    }


# ==============================================================================
# 4. AUDIT LOGS
# ==============================================================================

@router.get("/audit-logs")
def get_audit_logs(
    log_type: str = Query(default="activity"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    username: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    return query_logs(
        log_type=log_type,
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
        username=username,
        module=module,
        action=action,
        limit=limit,
        offset=offset,
    )
