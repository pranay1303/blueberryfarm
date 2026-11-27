from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.models.sql_models import (
    Booking,
    BookingEnquiry,
    Customer,
    Expense,
    Invoice,
    Package,
    Payment,
    Vehicle,
)
from app.services.calculations import round_money

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Business Intelligence"])
reports_router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/dashboard")
def get_dashboard_metrics(
    period: str = Query(default="this_month"),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("dashboard:view")),
) -> Dict[str, Any]:
    today_dt = ist_now().date()
    yesterday_dt = today_dt - timedelta(days=1)
    next_7_dt = today_dt + timedelta(days=7)

    # 1. Booking Metrics
    total_enquiries = db.query(BookingEnquiry).count()
    pending_enquiries = db.query(BookingEnquiry).filter(BookingEnquiry.status == "PENDING_REVIEW").count()
    approved_enquiries = db.query(BookingEnquiry).filter(BookingEnquiry.status == "APPROVED").count()

    total_bookings = db.query(Booking).count()
    confirmed_bookings = db.query(Booking).filter(Booking.booking_status == "Confirmed").count()
    today_checkins = db.query(Booking).filter(Booking.check_in_date == today_dt, Booking.booking_status != "Cancelled").count()
    today_checkouts = db.query(Booking).filter(Booking.check_out_date == today_dt, Booking.booking_status != "Cancelled").count()
    upcoming_checkins = db.query(Booking).filter(Booking.check_in_date > today_dt, Booking.check_in_date <= next_7_dt, Booking.booking_status != "Cancelled").count()
    upcoming_checkouts = db.query(Booking).filter(Booking.check_out_date > today_dt, Booking.check_out_date <= next_7_dt, Booking.booking_status != "Cancelled").count()

    # 2. Customer & Vehicle Metrics
    total_customers = db.query(Customer).count()
    total_vehicles = db.query(Vehicle).count()

    # Total guests sum
    total_guests = db.query(func.sum(Booking.total_guests)).filter(Booking.booking_status != "Cancelled").scalar() or 0

    # 3. Financial Metrics
    invoices = db.query(Invoice).filter(Invoice.document_title != "CANCELLED INVOICE").all()
    total_invoiced = round_money(sum(float(i.grand_total) for i in invoices))
    total_collected = round_money(sum(float(i.total_amount_paid) for i in invoices))
    total_pending_balance = max(0.0, round_money(total_invoiced - total_collected))

    expenses = db.query(Expense).all()
    total_expenses = round_money(sum(float(e.amount) for e in expenses))
    operating_profit = round_money(total_collected - total_expenses)

    # 4. Monthly Trend Data (Last 6 Months)
    monthly_trends = []
    for i in range(5, -1, -1):
        m_start = (today_dt.replace(day=1) - timedelta(days=i * 28)).replace(day=1)
        next_m = (m_start + timedelta(days=32)).replace(day=1)
        m_name = m_start.strftime("%b %Y")

        m_inv = db.query(func.sum(Invoice.grand_total)).filter(
            Invoice.invoice_date >= m_start,
            Invoice.invoice_date < next_m,
            Invoice.document_title != "CANCELLED INVOICE",
        ).scalar() or 0

        m_coll = db.query(func.sum(Payment.amount)).filter(
            Payment.payment_date >= m_start,
            Payment.payment_date < next_m,
            Payment.payment_type != "Refund",
        ).scalar() or 0

        m_exp = db.query(func.sum(Expense.amount)).filter(
            Expense.expense_date >= m_start,
            Expense.expense_date < next_m,
        ).scalar() or 0

        m_bkg = db.query(Booking).filter(
            Booking.check_in_date >= m_start,
            Booking.check_in_date < next_m,
            Booking.booking_status != "Cancelled",
        ).count()

        monthly_trends.append({
            "month": m_name,
            "invoiced": round_money(float(m_inv)),
            "collected": round_money(float(m_coll)),
            "expenses": round_money(float(m_exp)),
            "bookings": m_bkg,
        })

    # 5. Package Popularity
    pkg_rows = (
        db.query(Package.name, func.count(Booking.id))
        .join(Booking, Booking.package_id == Package.id)
        .filter(Booking.booking_status != "Cancelled")
        .group_by(Package.name)
        .all()
    )
    package_distribution = [{"name": r[0], "count": r[1]} for r in pkg_rows]

    # 6. Expense Distribution
    exp_rows = (
        db.query(Expense.category, func.sum(Expense.amount))
        .group_by(Expense.category)
        .all()
    )
    expense_distribution = [{"category": r[0], "amount": round_money(float(r[1]))} for r in exp_rows]

    return {
        "metrics": {
            "total_enquiries": total_enquiries,
            "pending_enquiries": pending_enquiries,
            "approved_enquiries": approved_enquiries,
            "total_bookings": total_bookings,
            "confirmed_bookings": confirmed_bookings,
            "today_checkins": today_checkins,
            "today_checkouts": today_checkouts,
            "upcoming_checkins": upcoming_checkins,
            "upcoming_checkouts": upcoming_checkouts,
            "total_guests": int(total_guests),
            "total_customers": total_customers,
            "total_vehicles": total_vehicles,
            "total_invoiced": total_invoiced,
            "total_collected": total_collected,
            "total_pending_balance": total_pending_balance,
            "total_expenses": total_expenses,
            "operating_profit": operating_profit,
        },
        "monthly_trends": monthly_trends,
        "package_distribution": package_distribution,
        "expense_distribution": expense_distribution,
    }


@router.get("/reports")
@reports_router.get("")
def get_reports_summary(
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("reports:view")),
) -> Dict[str, Any]:
    b_query = db.query(Booking).filter(Booking.booking_status != "Cancelled")
    i_query = db.query(Invoice).filter(Invoice.document_title != "CANCELLED INVOICE")
    e_query = db.query(Expense)

    if date_from:
        b_query = b_query.filter(Booking.check_in_date >= date_from)
        i_query = i_query.filter(Invoice.invoice_date >= date_from)
        e_query = e_query.filter(Expense.expense_date >= date_from)
    if date_to:
        b_query = b_query.filter(Booking.check_in_date <= date_to)
        i_query = i_query.filter(Invoice.invoice_date <= date_to)
        e_query = e_query.filter(Expense.expense_date <= date_to)

    bookings = b_query.all()
    invoices = i_query.all()
    expenses = e_query.all()

    total_invoiced = round_money(sum(float(i.grand_total) for i in invoices))
    total_paid = round_money(sum(float(i.total_amount_paid) for i in invoices))
    total_expenses = round_money(sum(float(e.amount) for e in expenses))

    return {
        "total_bookings": len(bookings),
        "total_guests": sum(b.total_guests for b in bookings),
        "total_invoiced": total_invoiced,
        "total_collected": total_paid,
        "total_expenses": total_expenses,
        "net_profit": round_money(total_paid - total_expenses),
    }


@router.get("/reports/{report_type}")
@reports_router.get("/{report_type}")
def get_specific_report(
    report_type: str,
    preset: str = Query(default="this_month"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("reports:view")),
) -> Dict[str, Any]:
    from fastapi import HTTPException
    from app.services.export_service import generate_report_data
    try:
        return generate_report_data(report_type, preset=preset, date_from=date_from, date_to=date_to, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/reports/{report_type}/export")
@reports_router.get("/{report_type}/export")
def export_specific_report(
    report_type: str,
    format: str = Query(default="pdf"),
    preset: str = Query(default="this_month"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("reports:view")),
):
    import re
    from fastapi import HTTPException
    from fastapi.responses import Response
    from app.services.export_service import (
        generate_report_data,
        export_report_pdf,
        export_report_excel,
        export_report_json,
    )
    try:
        report_data = generate_report_data(report_type, preset=preset, date_from=date_from, date_to=date_to, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    safe_name = re.sub(r"[^A-Za-z0-9_-]", "_", report_type)
    fmt = format.lower()
    if fmt == "xlsx":
        content = export_report_excel(report_data)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={safe_name}_report.xlsx"},
        )
    elif fmt == "json":
        content = export_report_json(report_data).encode("utf-8")
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={safe_name}_report.json"},
        )
    else:
        content = export_report_pdf(report_data)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={safe_name}_report.pdf"},
        )
