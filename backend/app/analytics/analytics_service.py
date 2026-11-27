from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import ist_now
from app.services.calculations import is_weekend_date, round_money
from app.storage.json_store import read_records


def resolve_date_range(
    preset: str = "this_month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Tuple[Optional[date], Optional[date]]:
    today = ist_now().date()
    p = (preset or "all").lower()

    if p == "all":
        return None, None
    if p == "today":
        return today, today
    if p == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if p in ("last_7_days", "weekly"):
        return today - timedelta(days=6), today
    if p == "last_30_days":
        return today - timedelta(days=29), today
    if p in ("this_month", "monthly"):
        return today.replace(day=1), today
    if p == "previous_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1), last_prev
    if p == "quarterly":
        q_month = ((today.month - 1) // 3) * 3 + 1
        return today.replace(month=q_month, day=1), today
    if p in ("this_year", "yearly"):
        return today.replace(month=1, day=1), today
    if p == "custom":
        d1 = datetime.strptime(date_from[:10], "%Y-%m-%d").date() if date_from else None
        d2 = datetime.strptime(date_to[:10], "%Y-%m-%d").date() if date_to else None
        return d1, d2
    return None, None


def _in_range(date_str: Optional[str], start: Optional[date], end: Optional[date]) -> bool:
    if not start and not end:
        return True
    if not date_str:
        return False
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except ValueError:
        return False
    if start and d < start:
        return False
    if end and d > end:
        return False
    return True


def compute_dashboard_and_analytics(
    preset: str = "this_month",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    start, end = resolve_date_range(preset, date_from, date_to)
    today = ist_now().date()
    today_str = today.strftime("%Y-%m-%d")
    next_7_str = (today + timedelta(days=7)).strftime("%Y-%m-%d")
    month_prefix = today.strftime("%Y-%m")

    customers = read_records("customers")
    bookings_all = read_records("bookings")
    quotations_all = read_records("quotations")
    invoices_all = read_records("invoices")
    payments_all = read_records("payments")
    expenses_all = read_records("expenses")

    bookings = [b for b in bookings_all if _in_range(b.get("booking_date") or b.get("check_in_date"), start, end)]
    quotations = [q for q in quotations_all if _in_range(q.get("quotation_date"), start, end)]
    invoices = [inv for inv in invoices_all if _in_range(inv.get("invoice_date"), start, end)]
    payments = [p for p in payments_all if _in_range(p.get("payment_date"), start, end)]
    expenses = [e for e in expenses_all if _in_range(e.get("expense_date"), start, end)]

    # Live resort operations (independent of date filter)
    todays_bookings = [b for b in bookings_all if (b.get("booking_date") or "")[:10] == today_str]
    upcoming_checkins = [
        b
        for b in bookings_all
        if b.get("booking_status") not in ("Cancelled", "Checked Out")
        and today_str <= (b.get("check_in_date") or "")[:10] <= next_7_str
    ]
    upcoming_checkouts = [
        b
        for b in bookings_all
        if b.get("booking_status") in ("Confirmed", "Checked In")
        and today_str <= (b.get("check_out_date") or "")[:10] <= next_7_str
    ]

    # Financials (strictly distinguishing Invoiced vs Collected Cash vs Pending Receivables)
    active_invoices = [inv for inv in invoices if inv.get("document_title") != "CANCELLED INVOICE"]
    total_invoiced_revenue = round_money(sum(float(inv.get("grand_total", 0)) for inv in active_invoices))

    valid_pay = sum(float(p.get("amount", 0)) for p in payments if p.get("payment_type") != "Refund")
    refunds = sum(abs(float(p.get("amount", 0))) for p in payments if p.get("payment_type") == "Refund")
    total_collected_revenue = round_money(valid_pay - refunds)

    total_advance_payments = round_money(
        sum(float(p.get("amount", 0)) for p in payments if p.get("payment_type") == "Advance")
    )

    # Pending customer balances across ALL non-cancelled invoices + confirmed bookings without invoice
    pending_invoice_balances = sum(
        float(inv.get("balance_due", 0))
        for inv in invoices_all
        if inv.get("document_title") != "CANCELLED INVOICE"
    )
    unbilled_booking_balances = sum(
        float(b.get("remaining_balance", 0))
        for b in bookings_all
        if not b.get("invoice_id") and b.get("booking_status") not in ("Cancelled", "Enquiry")
    )
    pending_balances = round_money(pending_invoice_balances + unbilled_booking_balances)

    total_expenses = round_money(sum(float(e.get("amount", 0)) for e in expenses))
    estimated_operating_profit = round_money(total_collected_revenue - total_expenses)
    accrual_operating_profit = round_money(total_invoiced_revenue - total_expenses)

    # Current calendar month collected revenue
    monthly_pay = sum(
        float(p.get("amount", 0))
        for p in payments_all
        if (p.get("payment_date") or "").startswith(month_prefix) and p.get("payment_type") != "Refund"
    )
    monthly_ref = sum(
        abs(float(p.get("amount", 0)))
        for p in payments_all
        if (p.get("payment_date") or "").startswith(month_prefix) and p.get("payment_type") == "Refund"
    )
    monthly_revenue = round_money(monthly_pay - monthly_ref)

    # Booking & guest metrics
    non_cancelled_bookings = [b for b in bookings if b.get("booking_status") != "Cancelled"]
    confirmed_bookings = [
        b for b in bookings if b.get("booking_status") in ("Confirmed", "Checked In", "Checked Out")
    ]
    cancelled_bookings = [b for b in bookings if b.get("booking_status") == "Cancelled"]
    cancellation_rate = round_money((len(cancelled_bookings) / len(bookings) * 100.0) if bookings else 0.0)

    total_booking_value = sum(float(b.get("total_booking_amount", 0)) for b in non_cancelled_bookings)
    avg_booking_value = round_money(
        (total_booking_value / len(non_cancelled_bookings)) if non_cancelled_bookings else 0.0
    )

    total_guests = sum(
        int(b.get("adults", 0)) + int(b.get("children", 0)) + int(b.get("infants", 0))
        for b in non_cancelled_bookings
    )
    avg_revenue_per_guest = round_money((total_booking_value / total_guests) if total_guests > 0 else 0.0)

    # Repeat customer percentage (across all non-cancelled bookings)
    cust_booking_counts: Dict[str, int] = defaultdict(int)
    for b in bookings_all:
        if b.get("booking_status") != "Cancelled" and b.get("customer_id"):
            cust_booking_counts[b["customer_id"]] += 1
    active_cust_with_bookings = len(cust_booking_counts)
    repeat_cust_count = sum(1 for c_cnt in cust_booking_counts.values() if c_cnt > 1)
    repeat_customer_pct = round_money(
        (repeat_cust_count / active_cust_with_bookings * 100.0) if active_cust_with_bookings else 0.0
    )

    # Weekday vs Weekend performance
    weekday_bookings = 0
    weekend_bookings = 0
    weekday_revenue = 0.0
    weekend_revenue = 0.0
    for b in non_cancelled_bookings:
        ci = b.get("check_in_date")
        amt = float(b.get("total_booking_amount", 0))
        try:
            d_ci = datetime.strptime(ci[:10], "%Y-%m-%d").date()
            if is_weekend_date(d_ci):
                weekend_bookings += 1
                weekend_revenue += amt
            else:
                weekday_bookings += 1
                weekday_revenue += amt
        except Exception:
            weekday_bookings += 1
            weekday_revenue += amt

    # Package popularity
    pkg_stats: Dict[str, Dict[str, Any]] = {}
    for b in non_cancelled_bookings:
        pname = b.get("package_name") or "Custom Stay"
        if pname not in pkg_stats:
            pkg_stats[pname] = {"name": pname, "bookings": 0, "revenue": 0.0, "guests": 0}
        pkg_stats[pname]["bookings"] += 1
        pkg_stats[pname]["revenue"] = round_money(pkg_stats[pname]["revenue"] + float(b.get("total_booking_amount", 0)))
        pkg_stats[pname]["guests"] += int(b.get("adults", 0)) + int(b.get("children", 0))
    popular_packages = sorted(pkg_stats.values(), key=lambda x: (-x["bookings"], -x["revenue"]))

    # Monthly charts (last 6 months or all recorded months)
    monthly_map: Dict[str, Dict[str, Any]] = {}
    for i in range(5, -1, -1):
        # Approximate month offsets accurately
        y = today.year
        m = today.month - i
        while m <= 0:
            m += 12
            y -= 1
        ym = f"{y:04d}-{m:02d}"
        lbl = datetime(y, m, 1).strftime("%b %Y")
        monthly_map[ym] = {
            "month": ym,
            "label": lbl,
            "collected_revenue": 0.0,
            "invoiced_revenue": 0.0,
            "expenses": 0.0,
            "profit": 0.0,
            "bookings": 0,
            "guests": 0,
            "new_customers": 0,
        }

    def _ensure_ym(date_s: Optional[str]) -> Optional[str]:
        if not date_s or len(date_s) < 7:
            return None
        ym = date_s[:7]
        if ym in monthly_map:
            return ym
        return None

    for p in payments_all:
        ym = _ensure_ym(p.get("payment_date"))
        if ym:
            amt = float(p.get("amount", 0))
            if p.get("payment_type") == "Refund":
                monthly_map[ym]["collected_revenue"] = round_money(monthly_map[ym]["collected_revenue"] - abs(amt))
            else:
                monthly_map[ym]["collected_revenue"] = round_money(monthly_map[ym]["collected_revenue"] + amt)

    for inv in invoices_all:
        if inv.get("document_title") == "CANCELLED INVOICE":
            continue
        ym = _ensure_ym(inv.get("invoice_date"))
        if ym:
            monthly_map[ym]["invoiced_revenue"] = round_money(
                monthly_map[ym]["invoiced_revenue"] + float(inv.get("grand_total", 0))
            )

    for e in expenses_all:
        ym = _ensure_ym(e.get("expense_date"))
        if ym:
            monthly_map[ym]["expenses"] = round_money(monthly_map[ym]["expenses"] + float(e.get("amount", 0)))

    for b in bookings_all:
        if b.get("booking_status") == "Cancelled":
            continue
        ym = _ensure_ym(b.get("booking_date") or b.get("check_in_date"))
        if ym:
            monthly_map[ym]["bookings"] += 1
            monthly_map[ym]["guests"] += int(b.get("adults", 0)) + int(b.get("children", 0)) + int(b.get("infants", 0))

    for c in customers:
        ym = _ensure_ym(c.get("created_at"))
        if ym:
            monthly_map[ym]["new_customers"] += 1

    monthly_series = []
    for ym in sorted(monthly_map.keys()):
        row = monthly_map[ym]
        row["profit"] = round_money(row["collected_revenue"] - row["expenses"])
        monthly_series.append(row)

    # Monthly growth (last month vs previous month)
    cur_m = monthly_series[-1] if monthly_series else {"collected_revenue": 0.0, "bookings": 0}
    prev_m = monthly_series[-2] if len(monthly_series) >= 2 else {"collected_revenue": 0.0, "bookings": 0}

    def _growth_pct(cur: float, prev: float) -> float:
        if prev <= 0:
            return 100.0 if cur > 0 else 0.0
        return round_money(((cur - prev) / prev) * 100.0)

    monthly_revenue_growth = _growth_pct(cur_m["collected_revenue"], prev_m["collected_revenue"])
    monthly_booking_growth = _growth_pct(float(cur_m["bookings"]), float(prev_m["bookings"]))

    # Payment status distribution (across invoices/bookings)
    pay_status_counts: Dict[str, int] = defaultdict(int)
    for b in bookings:
        pay_status_counts[b.get("payment_status", "Unpaid")] += 1
    payment_status_chart = [{"name": k, "value": v} for k, v in pay_status_counts.items()]

    # Expense breakdown chart
    exp_cat: Dict[str, float] = defaultdict(float)
    for e in expenses:
        exp_cat[e.get("category", "Other expenses")] += float(e.get("amount", 0))
    expense_breakdown = [
        {"category": k, "amount": round_money(v)}
        for k, v in sorted(exp_cat.items(), key=lambda kv: -kv[1])
    ]

    # Recent customer activity (from recent bookings, quotations, payments)
    recent_activity: List[Dict[str, Any]] = []
    for b in sorted(bookings_all, key=lambda x: x.get("updated_at", ""), reverse=True)[:5]:
        recent_activity.append(
            {
                "type": "booking",
                "title": f"Booking {b.get('booking_reference')} - {b.get('customer_name')}",
                "subtitle": f"{b.get('package_name')} • {b.get('booking_status')}",
                "amount": float(b.get("total_booking_amount", 0)),
                "timestamp": b.get("updated_at"),
            }
        )
    for p in sorted(payments_all, key=lambda x: x.get("created_at", ""), reverse=True)[:5]:
        recent_activity.append(
            {
                "type": "payment",
                "title": f"{p.get('payment_type')} ({p.get('payment_method')}) - {p.get('customer_name', '')}",
                "subtitle": f"Ref: {p.get('payment_id')}",
                "amount": float(p.get("amount", 0)),
                "timestamp": p.get("created_at"),
            }
        )
    recent_activity.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    recent_activity = recent_activity[:8]

    # Fact-based Business Insights (only generated from real computed data)
    insights: List[str] = []
    if total_collected_revenue > 0 or pending_balances > 0:
        top_pkg = popular_packages[0]["name"] if popular_packages else "N/A"
        insights.append(
            f"Your resort collected ₹{monthly_revenue:,.0f} in payments this month. "
            f"Current outstanding customer balance is ₹{pending_balances:,.0f}. "
            f"Most popular package in the selected period is {top_pkg}."
        )
    if bookings:
        insights.append(
            f"{len(confirmed_bookings)} of {len(bookings)} bookings are confirmed/completed "
            f"(cancellation rate: {cancellation_rate:.1f}%), with an average booking value of ₹{avg_booking_value:,.0f}."
        )
    if weekday_bookings + weekend_bookings > 0:
        insights.append(
            f"Weekday bookings: {weekday_bookings} (₹{weekday_revenue:,.0f}) vs "
            f"Weekend bookings: {weekend_bookings} (₹{weekend_revenue:,.0f})."
        )
    if total_expenses > 0:
        top_exp = expense_breakdown[0] if expense_breakdown else None
        exp_note = f" Highest expense category: {top_exp['category']} (₹{top_exp['amount']:,.0f})." if top_exp else ""
        insights.append(
            f"Operating expenses total ₹{total_expenses:,.0f} against ₹{total_collected_revenue:,.0f} collected cash "
            f"(cash operating profit: ₹{estimated_operating_profit:,.0f}).{exp_note}"
        )

    return {
        "filter": {
            "preset": preset,
            "date_from": start.isoformat() if start else None,
            "date_to": end.isoformat() if end else None,
        },
        "kpis": {
            "total_bookings": len(bookings),
            "todays_bookings": len(todays_bookings),
            "upcoming_checkins_count": len(upcoming_checkins),
            "upcoming_checkouts_count": len(upcoming_checkouts),
            "total_quotations": len(quotations),
            "confirmed_bookings": len(confirmed_bookings),
            "total_invoices": len(active_invoices),
            "total_invoiced_revenue": total_invoiced_revenue,
            "total_collected_revenue": total_collected_revenue,
            "pending_balances": pending_balances,
            "total_advance_payments": total_advance_payments,
            "total_expenses": total_expenses,
            "estimated_operating_profit": estimated_operating_profit,
            "accrual_operating_profit": accrual_operating_profit,
            "monthly_revenue": monthly_revenue,
            "average_booking_value": avg_booking_value,
            "average_revenue_per_guest": avg_revenue_per_guest,
            "repeat_customer_percentage": repeat_customer_pct,
            "cancellation_rate": cancellation_rate,
            "monthly_booking_growth": monthly_booking_growth,
            "monthly_revenue_growth": monthly_revenue_growth,
            "total_customers": len(customers),
            "total_guests": total_guests,
        },
        "weekday_vs_weekend": {
            "weekday_bookings": weekday_bookings,
            "weekday_revenue": round_money(weekday_revenue),
            "weekend_bookings": weekend_bookings,
            "weekend_revenue": round_money(weekend_revenue),
        },
        "charts": {
            "monthly_series": monthly_series,
            "payment_status_distribution": payment_status_chart,
            "package_popularity": popular_packages,
            "expense_breakdown": expense_breakdown,
        },
        "upcoming_checkins": upcoming_checkins[:8],
        "upcoming_checkouts": upcoming_checkouts[:8],
        "recent_activity": recent_activity,
        "insights": insights,
    }

