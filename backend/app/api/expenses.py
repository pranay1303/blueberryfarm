from __future__ import annotations

import logging
import random
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now, settings
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Expense, ExpenseCategory
from app.schemas.requests import ExpenseCreate, ExpenseUpdate
from app.services.calculations import round_money
from app.validations.validators import clean_str

logger = logging.getLogger("blueberry.expenses")
router = APIRouter(prefix="/api/expenses", tags=["Expenses"])


def generate_expense_code(db: Session) -> str:
    year = ist_now().strftime("%Y")
    for _ in range(20):
        code = f"EXP-{year}-{random.randint(1000, 9999)}"
        if not db.query(Expense).filter(Expense.expense_code == code).first():
            return code
    return f"EXP-{year}-{int(time.time())}"


def serialize_expense(e: Expense) -> Dict[str, Any]:
    return {
        "id": e.id,
        "expense_id": e.expense_code,
        "expense_code": e.expense_code,
        "expense_date": e.expense_date.isoformat() if e.expense_date else "",
        "category": e.category,
        "description": e.description,
        "vendor": e.vendor,
        "amount": float(e.amount),
        "payment_method": e.payment_method,
        "has_receipt": bool(e.receipt_attachment and (settings.STORAGE_DIR / e.receipt_attachment).exists()),
        "entered_by": e.entered_by,
        "notes": e.notes,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


@router.get("")
def list_expenses(
    category: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("expenses:read")),
) -> Dict[str, Any]:
    q = db.query(Expense)

    if category and category != "All":
        q = q.filter(Expense.category == category)
    if date_from:
        q = q.filter(Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(Expense.expense_date <= date_to)

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (Expense.expense_code.ilike(s))
            | (Expense.description.ilike(s))
            | (Expense.vendor.ilike(s))
            | (Expense.category.ilike(s))
        )

    all_filtered = q.all()
    total_amount = round_money(sum(float(e.amount) for e in all_filtered))

    by_cat_map: Dict[str, float] = {}
    for e in all_filtered:
        by_cat_map[e.category] = by_cat_map.get(e.category, 0.0) + float(e.amount)
    by_category = [{"category": k, "amount": round_money(v)} for k, v in sorted(by_cat_map.items())]

    expenses = q.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "items": [serialize_expense(e) for e in expenses],
        "total": len(all_filtered),
        "total_amount": total_amount,
        "by_category": by_category,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("expenses:write")),
) -> Dict[str, Any]:
    amt = Decimal(str(payload.amount))
    if amt <= 0:
        raise HTTPException(status_code=422, detail="Expense amount must be greater than zero.")

    code = generate_expense_code(db)
    exp = Expense(
        expense_code=code,
        expense_date=payload.expense_date or ist_now().date(),
        category=clean_str(payload.category) or "Miscellaneous",
        description=clean_str(payload.description) or "Expense",
        vendor=clean_str(payload.vendor),
        amount=amt,
        payment_method=payload.payment_method or "Cash",
        entered_by=current_user.get("full_name") or current_user.get("username"),
        notes=clean_str(payload.notes),
    )
    db.add(exp)
    db.commit()

    log_activity(
        action="expense_created",
        module="expenses",
        record_id=exp.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"expense_code": exp.expense_code, "amount": float(exp.amount), "category": exp.category},
    )

    return {"expense": serialize_expense(exp)}


@router.get("/{expense_id}/receipt")
def download_expense_receipt(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("expenses:read")),
) -> FileResponse:
    exp = db.query(Expense).filter((Expense.id == expense_id) | (Expense.expense_code == expense_id)).first()
    if not exp or not exp.receipt_attachment:
        raise HTTPException(status_code=404, detail="No receipt attachment found for this expense.")

    file_path = settings.STORAGE_DIR / exp.receipt_attachment
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Receipt attachment file missing from disk.")

    return FileResponse(file_path, filename=file_path.name)


@router.post("/{expense_id}/receipt")
async def upload_expense_receipt(
    expense_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("expenses:write")),
) -> Dict[str, Any]:
    exp = db.query(Expense).filter((Expense.id == expense_id) | (Expense.expense_code == expense_id)).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".pdf"}:
        raise HTTPException(status_code=400, detail="Allowed receipt formats: PNG, JPG, WEBP, PDF.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Receipt attachment must be under 5 MB.")

    receipts_dir = settings.STORAGE_DIR / "receipts"
    receipts_dir.mkdir(parents=True, exist_ok=True)
    filename = f"exp_{exp.expense_code}_{int(time.time())}{ext}"
    target = receipts_dir / filename
    target.write_bytes(contents)

    exp.receipt_attachment = f"receipts/{filename}"
    db.commit()

    return {"message": "Receipt attachment uploaded successfully.", "receipt_attachment": exp.receipt_attachment}


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("expenses:write")),
) -> Dict[str, Any]:
    exp = db.query(Expense).filter((Expense.id == expense_id) | (Expense.expense_code == expense_id)).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found.")

    db.delete(exp)
    db.commit()

    log_activity(
        action="expense_deleted",
        module="expenses",
        record_id=expense_id,
        user_id=current_user["id"],
        username=current_user["username"],
    )
    return {"message": "Expense deleted successfully."}
