from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Query
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
    Quotation,
    Vehicle,
)
from app.services.calculations import round_money

router = APIRouter(prefix="/api", tags=["Dashboard"])


def resolve_date_bounds(
    preset: str = "this_month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Tuple[Optional[date], Optional[date]]:
    today = ist_now().date()
    p = (preset or "all").lower()

    if p == "today":
        return today, today
    if p == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if p in ("last_7_days", "weekly"):
        return today - timedelta(days=6), today
    if p in ("last_30_days", "monthly"):
        return today - timedelta(days=29), today
    if p == "this_month":
        return today.replace(day=1), today
    if p == "previous_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1), last_prev
    if p in ("this_year", "yearly"):
        return today.replace(month=1, day=1), today
    if p == "custom":
        try:
            d1 = datetime.strptime(date_from[:10], "%Y-%m-%d").date() if date_from else None
            d2 = datetime.strptime(date_to[:10], "%Y-%m-%d").date() if date_to else None
            return d1, d2
        except ValueError as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="Invalid custom date format. Use YYYY-MM-DD.") from exc
    return None, None


@router.get("/search")
def global_search(
    q: str = Query(default="", min_length=1),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("dashboard:view")),
) -> Dict[str, Any]:
    term = f"%{q.strip()}%"
    customers = (
        db.query(Customer)
        .filter(
            (Customer.full_name.ilike(term))
            | (Customer.mobile.ilike(term))
            | (Customer.customer_code.ilike(term))
            | (Customer.email.ilike(term))
        )
        .limit(8)
        .all()
    )
    bookings = (
        db.query(Booking)
        .join(Customer, Booking.customer_id == Customer.id)
        .filter(
            (Booking.booking_reference.ilike(term))
            | (Customer.full_name.ilike(term))
            | (Customer.mobile.ilike(term))
        )
        .order_by(Booking.created_at.desc())
        .limit(8)
        .all()
    )
    quotations = (
        db.query(Quotation)
        .join(Customer, Quotation.customer_id == Customer.id)
        .filter(
            (Quotation.quotation_number.ilike(term))
            | (Customer.full_name.ilike(term))
            | (Customer.mobile.ilike(term))
        )
        .order_by(Quotation.created_at.desc())
        .limit(8)
        .all()
    )
    invoices = (
        db.query(Invoice)
        .filter(
            (Invoice.invoice_number.ilike(term))
            | (Invoice.customer_name.ilike(term))
            | (Invoice.customer_mobile.ilike(term))
        )
        .order_by(Invoice.created_at.desc())
        .limit(8)
        .all()
    )

    return {
        "customers": [
            {"id": c.id, "customer_code": c.customer_code, "full_name": c.full_name, "mobile": c.mobile}
            for c in customers
        ],
        "bookings": [
            {
                "id": b.id,
                "booking_reference": b.booking_reference,
                "customer_name": b.customer.full_name if b.customer else "Guest",
                "check_in_date": b.check_in_date.isoformat() if b.check_in_date else "",
                "booking_status": b.booking_status,
            }
            for b in bookings
        ],
        "quotations": [
            {
                "id": qt.id,
                "quotation_number": qt.quotation_number,
                "customer_name": qt.customer.full_name if qt.customer else "",
                "grand_total": float(qt.grand_total),
                "status": qt.status,
            }
            for qt in quotations
        ],
        "invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_name": inv.customer_name,
                "grand_total": float(inv.grand_total),
                "payment_status": inv.payment_status,
            }
            for inv in invoices
        ],
    }


@router.get("/dashboard")
def get_resort_dashboard(
    preset: str = Query(default="this_month"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("dashboard:view")),
) -> Dict[str, Any]:
    today_dt = ist_now().date()
    start_dt, end_dt = resolve_date_bounds(preset, date_from, date_to)
    next_7_dt = today_dt + timedelta(days=7)

    # 1. Base Query Filters
    bkg_query = db.query(Booking).filter(Booking.booking_status != "Cancelled")
    inv_query = db.query(Invoice).filter(Invoice.document_title != "CANCELLED INVOICE")
    exp_query = db.query(Expense)
    qtn_query = db.query(Quotation)
    pay_query = db.query(Payment).filter(Payment.payment_type != "Refund")

    if start_dt:
        bkg_query = bkg_query.filter(Booking.check_in_date >= start_dt)
        inv_query = inv_query.filter(Invoice.invoice_date >= start_dt)
        exp_query = exp_query.filter(Expense.expense_date >= start_dt)
        qtn_query = qtn_query.filter(Quotation.quotation_date >= start_dt)
        pay_query = pay_query.filter(Payment.payment_date >= start_dt)
    if end_dt:
        bkg_query = bkg_query.filter(Booking.check_in_date <= end_dt)
        inv_query = inv_query.filter(Invoice.invoice_date <= end_dt)
        exp_query = exp_query.filter(Expense.expense_date <= end_dt)
        qtn_query = qtn_query.filter(Quotation.quotation_date <= end_dt)
        pay_query = pay_query.filter(Payment.payment_date <= end_dt)

    filtered_bookings = bkg_query.all()
    filtered_invoices = inv_query.all()
    filtered_expenses = exp_query.all()
    total_quotations_count = qtn_query.count()

    # Enquiries and Vehicles metrics
    enq_query = db.query(BookingEnquiry)
    if start_dt:
        enq_query = enq_query.filter(BookingEnquiry.created_at >= datetime.combine(start_dt, datetime.min.time()))
    if end_dt:
        enq_query = enq_query.filter(BookingEnquiry.created_at <= datetime.combine(end_dt, datetime.max.time()))
    total_enquiries = enq_query.count()
    pending_enquiries = enq_query.filter(BookingEnquiry.status == "PENDING_REVIEW").count()
    approved_enquiries = enq_query.filter(BookingEnquiry.status == "APPROVED").count()
    total_vehicles = db.query(Vehicle).count()

    # 2. All-time / Operational Counts
    total_bookings = len(filtered_bookings)
    confirmed_bookings = sum(1 for b in filtered_bookings if b.booking_status in ("Confirmed", "Checked In", "Checked Out"))
    todays_bookings = db.query(Booking).filter(
        Booking.check_in_date == today_dt,
        Booking.booking_status != "Cancelled"
    ).count()

    upcoming_checkins_recs = (
        db.query(Booking)
        .filter(
            Booking.check_in_date >= today_dt,
            Booking.check_in_date <= next_7_dt,
            Booking.booking_status.in_(("Confirmed", "Checked In")),
        )
        .order_by(Booking.check_in_date.asc())
        .limit(8)
        .all()
    )
    upcoming_checkins_count = len(upcoming_checkins_recs)

    upcoming_checkouts_recs = (
        db.query(Booking)
        .filter(
            Booking.check_out_date >= today_dt,
            Booking.check_out_date <= next_7_dt,
            Booking.booking_status == "Checked In",
        )
        .order_by(Booking.check_out_date.asc())
        .limit(8)
        .all()
    )
    upcoming_checkouts_count = len(upcoming_checkouts_recs)

    # 3. Financial Totals
    total_invoiced_revenue = round_money(sum(float(i.grand_total) for i in filtered_invoices))
    total_collected_revenue = round_money(sum(float(i.total_amount_paid) for i in filtered_invoices))
    pending_balances = max(0.0, round_money(sum(float(i.balance_due) for i in filtered_invoices)))
    total_expenses = round_money(sum(float(e.amount) for e in filtered_expenses))
    estimated_operating_profit = round_money(total_collected_revenue - total_expenses)

    # Current month revenue
    first_of_this_month = today_dt.replace(day=1)
    monthly_revenue = db.query(func.sum(Payment.amount)).filter(
        Payment.payment_date >= first_of_this_month,
        Payment.payment_type != "Refund",
    ).scalar() or 0.0
    monthly_revenue = round_money(float(monthly_revenue))

    # 4. Monthly Series (Last 6 months)
    monthly_series = []
    for i in range(5, -1, -1):
        m_start = (today_dt.replace(day=1) - timedelta(days=i * 28)).replace(day=1)
        next_m = (m_start + timedelta(days=32)).replace(day=1)
        m_label = m_start.strftime("%b %Y")

        m_inv = db.query(func.sum(Invoice.grand_total)).filter(
            Invoice.invoice_date >= m_start,
            Invoice.invoice_date < next_m,
            Invoice.document_title != "CANCELLED INVOICE",
        ).scalar() or 0.0

        m_coll = db.query(func.sum(Payment.amount)).filter(
            Payment.payment_date >= m_start,
            Payment.payment_date < next_m,
            Payment.payment_type != "Refund",
        ).scalar() or 0.0

        m_exp = db.query(func.sum(Expense.amount)).filter(
            Expense.expense_date >= m_start,
            Expense.expense_date < next_m,
        ).scalar() or 0.0

        m_bkg = db.query(Booking).filter(
            Booking.check_in_date >= m_start,
            Booking.check_in_date < next_m,
            Booking.booking_status != "Cancelled",
        ).count()

        monthly_series.append({
            "label": m_label,
            "invoiced_revenue": round_money(float(m_inv)),
            "collected_revenue": round_money(float(m_coll)),
            "expenses": round_money(float(m_exp)),
            "profit": round_money(float(m_coll) - float(m_exp)),
            "bookings": m_bkg,
        })

    # 5. Payment Status Distribution
    pay_counts: Dict[str, int] = defaultdict(int)
    for inv in filtered_invoices:
        pay_counts[inv.payment_status or "Unpaid"] += 1
    if not pay_counts:
        pay_counts["Unpaid"] = 0
    payment_status_distribution = [{"name": k, "value": v} for k, v in pay_counts.items()]

    # 6. Package Popularity
    pkg_counter: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"bookings": 0, "revenue": 0.0})
    for b in filtered_bookings:
        p_name = b.package.name if b.package else "Custom Stay Package"
        pkg_counter[p_name]["bookings"] += 1
        pkg_counter[p_name]["revenue"] += float(b.total_amount)
    package_popularity = [
        {"name": k, "bookings": v["bookings"], "revenue": round_money(v["revenue"])}
        for k, v in sorted(pkg_counter.items(), key=lambda x: x[1]["bookings"], reverse=True)
    ]

    # 7. Expense Breakdown
    exp_counter: Dict[str, float] = defaultdict(float)
    for e in filtered_expenses:
        cat = e.category or "General"
        exp_counter[cat] += float(e.amount)
    expense_breakdown = [
        {"category": k, "amount": round_money(v)}
        for k, v in sorted(exp_counter.items(), key=lambda x: x[1], reverse=True)
    ]

    # 8. Upcoming Check-in Serializer
    def _serialize_booking(b: Booking) -> Dict[str, Any]:
        c_name = b.customer.full_name if b.customer else "Guest"
        c_mob = b.customer.mobile if b.customer else ""
        return {
            "id": b.id,
            "booking_reference": b.booking_reference,
            "customer_name": c_name,
            "contact_number": c_mob,
            "package_name": b.package.name if b.package else "Stay Package",
            "check_in_date": b.check_in_date.isoformat(),
            "check_out_date": b.check_out_date.isoformat(),
            "adults": b.adults,
            "children": b.children,
            "infants": b.infants,
            "rooms": b.number_of_rooms or 1,
            "booking_status": b.booking_status,
            "payment_status": b.payment_status,
            "total_booking_amount": float(b.total_amount),
            "advance_paid": float(b.advance_paid),
            "remaining_balance": float(b.balance_due),
        }

    # 9. Recent Activity List
    recent_activity: List[Dict[str, Any]] = []
    recent_bookings = (
        db.query(Booking)
        .order_by(Booking.created_at.desc())
        .limit(5)
        .all()
    )
    for b in recent_bookings:
        c_name = b.customer.full_name if b.customer else "Guest"
        recent_activity.append({
            "type": "booking",
            "title": f"Booking {b.booking_reference} - {c_name}",
            "subtitle": f"{b.package.name if b.package else 'Stay'} • {b.booking_status}",
            "amount": float(b.total_amount),
            "timestamp": b.created_at.isoformat() if b.created_at else None,
        })

    recent_payments = (
        db.query(Payment)
        .order_by(Payment.created_at.desc())
        .limit(5)
        .all()
    )
    for p in recent_payments:
        recent_activity.append({
            "type": "payment",
            "title": f"Payment {p.receipt_number} ({p.payment_method})",
            "subtitle": f"{p.payment_type} • Ref: {p.transaction_id or 'Cash/UPI'}",
            "amount": float(p.amount),
            "timestamp": p.created_at.isoformat() if p.created_at else None,
        })

    recent_activity.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    recent_activity = recent_activity[:8]

    # 10. Summary Insights
    insights: List[str] = []
    if total_collected_revenue > 0 or pending_balances > 0:
        top_pkg = package_popularity[0]["name"] if package_popularity else "All Packages"
        insights.append(
            f"Your resort collected ₹{monthly_revenue:,.0f} in payments this month. "
            f"Current outstanding receivables balance is ₹{pending_balances:,.0f}. "
            f"Top booking package: {top_pkg}."
        )
    if total_bookings > 0:
        insights.append(
            f"{confirmed_bookings} of {total_bookings} bookings are confirmed with healthy occupancy."
        )
    if total_enquiries > 0:
        insights.append(
            f"Received {total_enquiries} customer stay enquiries ({pending_enquiries} pending review, {approved_enquiries} approved)."
        )

    return {
        "kpis": {
            "total_bookings": total_bookings,
            "todays_bookings": todays_bookings,
            "confirmed_bookings": confirmed_bookings,
            "total_quotations": total_quotations_count,
            "upcoming_checkins_count": upcoming_checkins_count,
            "upcoming_checkouts_count": upcoming_checkouts_count,
            "total_invoices": len(filtered_invoices),
            "total_invoiced_revenue": total_invoiced_revenue,
            "total_collected_revenue": total_collected_revenue,
            "monthly_revenue": monthly_revenue,
            "pending_balances": pending_balances,
            "total_expenses": total_expenses,
            "estimated_operating_profit": estimated_operating_profit,
            "total_enquiries": total_enquiries,
            "pending_enquiries": pending_enquiries,
            "approved_enquiries": approved_enquiries,
            "total_vehicles": total_vehicles,
        },
        "charts": {
            "monthly_series": monthly_series,
            "payment_status_distribution": payment_status_distribution,
            "package_popularity": package_popularity,
            "expense_breakdown": expense_breakdown,
        },
        "upcoming_checkins": [_serialize_booking(b) for b in upcoming_checkins_recs],
        "upcoming_checkouts": [_serialize_booking(b) for b in upcoming_checkouts_recs],
        "recent_activity": recent_activity,
        "insights": insights,
    }
