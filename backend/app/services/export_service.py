from __future__ import annotations

import io
from collections import defaultdict
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.analytics.analytics_service import _in_range, resolve_date_range
from app.pdf.document_pdf import format_inr
from app.services.calculations import round_money
from app.storage.json_store import read_object, read_records


def generate_report_data(
    report_type: str,
    *,
    preset: str = "all",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Any = None,
) -> Dict[str, Any]:
    start, end = resolve_date_range(preset, date_from, date_to)

    if db is not None:
        from app.models.sql_models import Booking, Customer, Expense, Invoice, Payment, Quotation
        customers = [
            {
                "id": c.id,
                "customer_code": c.customer_code,
                "full_name": c.full_name,
                "contact_number": c.mobile,
                "city": c.city or "",
                "total_bookings": len(c.bookings),
                "total_spent": float(sum(i.total_amount_paid for i in c.invoices if i.payment_status != "Cancelled")),
                "created_at": c.created_at.isoformat() if c.created_at else "",
            }
            for c in db.query(Customer).all()
        ]
        bookings = [
            {
                "id": b.id,
                "booking_reference": b.booking_reference,
                "customer_name": b.customer.full_name if b.customer else "Guest",
                "package_name": b.package.name if b.package else "Custom Stay",
                "check_in_date": b.check_in_date.isoformat() if b.check_in_date else "",
                "check_out_date": b.check_out_date.isoformat() if b.check_out_date else "",
                "adults": b.adults,
                "children": b.children,
                "booking_status": b.booking_status,
                "payment_status": b.payment_status,
                "total_booking_amount": float(b.total_amount),
                "advance_paid": float(b.advance_paid),
                "balance_due": float(b.balance_due),
            }
            for b in db.query(Booking).all()
        ]
        quotations = [
            {
                "id": q.id,
                "quotation_number": q.quotation_number,
                "quotation_date": q.quotation_date.isoformat() if q.quotation_date else "",
                "customer_name": q.customer.full_name if q.customer else "",
                "check_in_date": q.check_in_date.isoformat() if q.check_in_date else "",
                "grand_total": float(q.grand_total),
                "status": q.status,
            }
            for q in db.query(Quotation).all()
        ]
        invoices = [
            {
                "id": i.id,
                "invoice_number": i.invoice_number,
                "invoice_date": i.invoice_date.isoformat() if i.invoice_date else "",
                "customer_name": i.customer_name,
                "grand_total": float(i.grand_total),
                "total_amount_paid": float(i.total_amount_paid),
                "balance_due": float(i.balance_due),
                "payment_status": i.payment_status,
                "document_title": i.document_title,
            }
            for i in db.query(Invoice).all()
        ]
        payments = [
            {
                "id": p.id,
                "receipt_number": p.receipt_number,
                "payment_date": p.payment_date.isoformat() if p.payment_date else "",
                "customer_name": p.customer.full_name if p.customer else "",
                "amount": float(p.amount),
                "payment_type": p.payment_type,
                "payment_method": p.payment_method,
            }
            for p in db.query(Payment).all()
        ]
        expenses = [
            {
                "id": e.id,
                "expense_date": e.expense_date.isoformat() if e.expense_date else "",
                "category": e.category,
                "description": e.description or "",
                "vendor": e.vendor or "",
                "amount": float(e.amount),
                "payment_method": e.payment_method or "",
            }
            for e in db.query(Expense).all()
        ]
    else:
        customers = read_records("customers")
        bookings = read_records("bookings")
        quotations = read_records("quotations")
        invoices = read_records("invoices")
        payments = read_records("payments")
        expenses = read_records("expenses")

    title_map = {
        "daily_collection": "Daily Collection Report",
        "monthly_collection": "Monthly Collection Report",
        "bookings": "Booking Report",
        "quotations": "Quotation Report",
        "invoices": "Invoice Report",
        "outstanding_balances": "Outstanding Balance Report",
        "expenses": "Expense Report",
        "profit_and_loss": "Profit and Loss Summary",
        "customers": "Customer Report",
        "package_performance": "Package Performance Report",
    }
    if report_type not in title_map:
        raise ValueError(f"Unsupported report type: {report_type}")

    columns: List[str] = []
    rows: List[List[Any]] = []
    summary: Dict[str, Any] = {}

    if report_type == "daily_collection":
        filtered = [p for p in payments if _in_range(p.get("payment_date"), start, end)]
        grouped: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"date": "", "transactions": 0, "collected": 0.0, "refunds": 0.0, "net": 0.0}
        )
        for p in filtered:
            d = (p.get("payment_date") or "")[:10]
            g = grouped[d]
            g["date"] = d
            g["transactions"] += 1
            amt = float(p.get("amount", 0))
            if p.get("payment_type") == "Refund":
                g["refunds"] = round_money(g["refunds"] + abs(amt))
            else:
                g["collected"] = round_money(g["collected"] + amt)
            g["net"] = round_money(g["collected"] - g["refunds"])

        columns = ["Date", "Transactions", "Gross Collected (INR)", "Refunds (INR)", "Net Collected (INR)"]
        for d in sorted(grouped.keys(), reverse=True):
            g = grouped[d]
            rows.append([g["date"], g["transactions"], g["collected"], g["refunds"], g["net"]])
        summary = {
            "total_transactions": sum(g["transactions"] for g in grouped.values()),
            "gross_collected": round_money(sum(g["collected"] for g in grouped.values())),
            "total_refunds": round_money(sum(g["refunds"] for g in grouped.values())),
            "net_collected": round_money(sum(g["net"] for g in grouped.values())),
        }

    elif report_type == "monthly_collection":
        filtered = [p for p in payments if _in_range(p.get("payment_date"), start, end)]
        grouped_m: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"month": "", "transactions": 0, "collected": 0.0, "refunds": 0.0, "net": 0.0}
        )
        for p in filtered:
            m = (p.get("payment_date") or "")[:7]
            g = grouped_m[m]
            g["month"] = m
            g["transactions"] += 1
            amt = float(p.get("amount", 0))
            if p.get("payment_type") == "Refund":
                g["refunds"] = round_money(g["refunds"] + abs(amt))
            else:
                g["collected"] = round_money(g["collected"] + amt)
            g["net"] = round_money(g["collected"] - g["refunds"])

        columns = ["Month", "Transactions", "Gross Collected (INR)", "Refunds (INR)", "Net Collected (INR)"]
        for m in sorted(grouped_m.keys(), reverse=True):
            g = grouped_m[m]
            rows.append([g["month"], g["transactions"], g["collected"], g["refunds"], g["net"]])
        summary = {
            "months": len(grouped_m),
            "net_collected": round_money(sum(g["net"] for g in grouped_m.values())),
        }

    elif report_type == "bookings":
        filtered = [b for b in bookings if _in_range(b.get("booking_date") or b.get("check_in_date"), start, end)]
        columns = ["Booking Ref", "Customer", "Check-In", "Check-Out", "Package", "Guests", "Status", "Payment", "Total (INR)", "Balance (INR)"]
        for b in sorted(filtered, key=lambda x: x.get("check_in_date", ""), reverse=True):
            guests = int(b.get("adults", 0)) + int(b.get("children", 0)) + int(b.get("infants", 0))
            rows.append([
                b.get("booking_reference"),
                b.get("customer_name"),
                b.get("check_in_date"),
                b.get("check_out_date"),
                b.get("package_name"),
                guests,
                b.get("booking_status"),
                b.get("payment_status"),
                float(b.get("total_booking_amount", 0)),
                float(b.get("remaining_balance", 0)),
            ])
        summary = {
            "total_bookings": len(filtered),
            "total_booking_value": round_money(sum(float(b.get("total_booking_amount", 0)) for b in filtered if b.get("booking_status") != "Cancelled")),
            "total_balance": round_money(sum(float(b.get("remaining_balance", 0)) for b in filtered if b.get("booking_status") != "Cancelled")),
        }

    elif report_type == "quotations":
        filtered = [q for q in quotations if _in_range(q.get("quotation_date"), start, end)]
        columns = ["Quotation No", "Date", "Valid Until", "Customer", "Package", "Status", "Grand Total (INR)"]
        for q in sorted(filtered, key=lambda x: x.get("quotation_date", ""), reverse=True):
            rows.append([
                q.get("quotation_number"),
                q.get("quotation_date"),
                q.get("valid_until"),
                q.get("customer_name"),
                q.get("package_name") or "-",
                q.get("status"),
                float(q.get("grand_total", 0)),
            ])
        summary = {
            "total_quotations": len(filtered),
            "total_quoted_value": round_money(sum(float(q.get("grand_total", 0)) for q in filtered)),
        }

    elif report_type == "invoices":
        filtered = [inv for inv in invoices if _in_range(inv.get("invoice_date"), start, end)]
        columns = ["Invoice No", "Date", "Customer", "Booking Ref", "Status", "Grand Total (INR)", "Paid (INR)", "Balance Due (INR)"]
        for inv in sorted(filtered, key=lambda x: x.get("invoice_date", ""), reverse=True):
            rows.append([
                inv.get("invoice_number"),
                inv.get("invoice_date"),
                inv.get("customer_name"),
                inv.get("booking_reference") or "-",
                inv.get("payment_status"),
                float(inv.get("grand_total", 0)),
                float(inv.get("total_amount_paid", 0)),
                float(inv.get("balance_due", 0)),
            ])
        summary = {
            "total_invoices": len(filtered),
            "total_invoiced": round_money(sum(float(i.get("grand_total", 0)) for i in filtered)),
            "total_paid": round_money(sum(float(i.get("total_amount_paid", 0)) for i in filtered)),
            "total_due": round_money(sum(float(i.get("balance_due", 0)) for i in filtered)),
        }

    elif report_type == "outstanding_balances":
        columns = ["Source", "Document / Ref", "Customer", "Contact", "Date", "Total (INR)", "Paid (INR)", "Balance Due (INR)"]
        total_due = 0.0
        for inv in invoices:
            bal = float(inv.get("balance_due", 0))
            if bal > 0.01 and inv.get("document_title") != "CANCELLED INVOICE":
                total_due += bal
                rows.append([
                    "Invoice",
                    inv.get("invoice_number"),
                    inv.get("customer_name"),
                    inv.get("contact_number") or "-",
                    inv.get("invoice_date"),
                    float(inv.get("grand_total", 0)),
                    float(inv.get("total_amount_paid", 0)),
                    bal,
                ])
        for b in bookings:
            bal = float(b.get("remaining_balance", 0))
            if not b.get("invoice_id") and bal > 0.01 and b.get("booking_status") not in ("Cancelled", "Enquiry"):
                total_due += bal
                rows.append([
                    "Booking (Unbilled)",
                    b.get("booking_reference"),
                    b.get("customer_name"),
                    b.get("contact_number") or "-",
                    b.get("check_in_date"),
                    float(b.get("total_booking_amount", 0)),
                    float(b.get("advance_paid", 0)),
                    bal,
                ])
        summary = {"records_with_due": len(rows), "total_outstanding": round_money(total_due)}

    elif report_type == "expenses":
        filtered = [e for e in expenses if _in_range(e.get("expense_date"), start, end)]
        columns = ["Expense ID", "Date", "Category", "Description", "Vendor", "Method", "Amount (INR)"]
        for e in sorted(filtered, key=lambda x: x.get("expense_date", ""), reverse=True):
            rows.append([
                e.get("expense_id"),
                e.get("expense_date"),
                e.get("category"),
                e.get("description"),
                e.get("vendor") or "-",
                e.get("payment_method"),
                float(e.get("amount", 0)),
            ])
        summary = {
            "total_entries": len(filtered),
            "total_expenses": round_money(sum(float(e.get("amount", 0)) for e in filtered)),
        }

    elif report_type == "profit_and_loss":
        f_pay = [p for p in payments if _in_range(p.get("payment_date"), start, end)]
        f_inv = [i for i in invoices if _in_range(i.get("invoice_date"), start, end) and i.get("document_title") != "CANCELLED INVOICE"]
        f_exp = [e for e in expenses if _in_range(e.get("expense_date"), start, end)]

        gross_collected = round_money(sum(float(p.get("amount", 0)) for p in f_pay if p.get("payment_type") != "Refund"))
        refunds = round_money(sum(abs(float(p.get("amount", 0))) for p in f_pay if p.get("payment_type") == "Refund"))
        net_cash_collected = round_money(gross_collected - refunds)
        invoiced_rev = round_money(sum(float(i.get("grand_total", 0)) for i in f_inv))
        total_exp = round_money(sum(float(e.get("amount", 0)) for e in f_exp))
        cash_profit = round_money(net_cash_collected - total_exp)
        accrual_profit = round_money(invoiced_rev - total_exp)

        columns = ["Line Item", "Amount (INR)"]
        rows = [
            ["Gross Cash Collected (Payments)", gross_collected],
            ["Less: Refunds Issued", refunds],
            ["Net Cash Collected", net_cash_collected],
            ["Total Invoiced Revenue", invoiced_rev],
            ["Total Operating Expenses", total_exp],
            ["Cash Operating Profit (Collected - Expenses)", cash_profit],
            ["Accrual Operating Profit (Invoiced - Expenses)", accrual_profit],
        ]
        # Category breakdown rows
        cat_totals: Dict[str, float] = defaultdict(float)
        for e in f_exp:
            cat_totals[e.get("category", "Other expenses")] += float(e.get("amount", 0))
        for cat, amt in sorted(cat_totals.items(), key=lambda x: -x[1]):
            rows.append([f"Expense - {cat}", round_money(amt)])

        summary = {
            "net_cash_collected": net_cash_collected,
            "invoiced_revenue": invoiced_rev,
            "total_expenses": total_exp,
            "cash_operating_profit": cash_profit,
            "accrual_operating_profit": accrual_profit,
        }

    elif report_type == "customers":
        columns = ["Customer ID", "Name", "Mobile", "City", "Type", "Bookings", "Total Billed (INR)", "Paid (INR)", "Outstanding (INR)"]
        for c in customers:
            cid = c["id"]
            c_b = [b for b in bookings if b.get("customer_id") == cid and b.get("booking_status") != "Cancelled"]
            c_p = [p for p in payments if p.get("customer_id") == cid]
            c_inv = [i for i in invoices if i.get("customer_id") == cid and i.get("document_title") != "CANCELLED INVOICE"]
            billed = round_money(sum(float(i.get("grand_total", 0)) for i in c_inv))
            paid = round_money(
                sum(float(p.get("amount", 0)) for p in c_p if p.get("payment_type") != "Refund")
                - sum(abs(float(p.get("amount", 0))) for p in c_p if p.get("payment_type") == "Refund")
            )
            outstanding = round_money(sum(float(i.get("balance_due", 0)) for i in c_inv))
            rows.append([
                c.get("customer_id"),
                c.get("full_name"),
                c.get("mobile"),
                c.get("city") or "-",
                c.get("customer_type"),
                len(c_b),
                billed,
                paid,
                outstanding,
            ])
        summary = {"total_customers": len(customers)}

    elif report_type == "package_performance":
        filtered = [
            b for b in bookings
            if _in_range(b.get("booking_date") or b.get("check_in_date"), start, end)
            and b.get("booking_status") != "Cancelled"
        ]
        pkg_map: Dict[str, Dict[str, Any]] = {}
        for b in filtered:
            pname = b.get("package_name") or "Custom Stay"
            if pname not in pkg_map:
                pkg_map[pname] = {"name": pname, "bookings": 0, "guests": 0, "revenue": 0.0}
            pkg_map[pname]["bookings"] += 1
            pkg_map[pname]["guests"] += int(b.get("adults", 0)) + int(b.get("children", 0)) + int(b.get("infants", 0))
            pkg_map[pname]["revenue"] = round_money(pkg_map[pname]["revenue"] + float(b.get("total_booking_amount", 0)))

        columns = ["Package Name", "Bookings", "Total Guests", "Total Revenue (INR)", "Avg Booking Value (INR)"]
        for p in sorted(pkg_map.values(), key=lambda x: -x["revenue"]):
            avg = round_money(p["revenue"] / p["bookings"]) if p["bookings"] else 0.0
            rows.append([p["name"], p["bookings"], p["guests"], p["revenue"], avg])
        summary = {"packages_count": len(pkg_map), "total_revenue": round_money(sum(p["revenue"] for p in pkg_map.values()))}

    return {
        "report_type": report_type,
        "title": title_map[report_type],
        "filter": {"preset": preset, "date_from": start.isoformat() if start else None, "date_to": end.isoformat() if end else None},
        "columns": columns,
        "rows": rows,
        "summary": summary,
    }


def export_report_excel(report: Dict[str, Any]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = report["report_type"][:31]

    resort = read_object("settings")
    ws.append([resort.get("business_name", "Blueberry Farm and Resort")])
    ws.append([report["title"]])
    ws.append([])

    header_row_idx = 4
    ws.append(report["columns"])
    fill = PatternFill(start_color="004AAC", end_color="004AAC", fill_type="solid")
    font = Font(bold=True, color="FFFFFF")
    for cell in ws[header_row_idx]:
        cell.fill = fill
        cell.font = font

    def _safe_excel_cell(val: Any) -> Any:
        if isinstance(val, str) and val and val[0] in ("=", "+", "-", "@", "\t", "\r"):
            return f"'{val}"
        return val

    for r in report["rows"]:
        ws.append([_safe_excel_cell(v) for v in r])

    ws.append([])
    ws.append(["Summary"])
    for k, v in report.get("summary", {}).items():
        ws.append([k.replace("_", " ").title(), _safe_excel_cell(v)])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_report_json(report: Dict[str, Any]) -> str:
    import json
    return json.dumps(report, indent=2, default=str)


def export_report_pdf(report: Dict[str, Any]) -> bytes:
    resort = read_object("settings")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=28)
    styles = getSampleStyleSheet()
    hdr_style = ParagraphStyle("rh", parent=styles["Heading2"], textColor=colors.HexColor("#004AAD"))
    cell_style = ParagraphStyle("rc", parent=styles["Normal"], fontSize=8.5, leading=10.5)

    story: List[Any] = [
        Paragraph(f"<b>{escape(resort.get('business_name', 'Blueberry Farm and Resort'))}</b> — {escape(report['title'])}", hdr_style),
        Spacer(1, 8),
    ]

    if report["rows"]:
        tbl_data = [[Paragraph(f"<b><font color='#FFFFFF'>{escape(str(c))}</font></b>", cell_style) for c in report["columns"]]]
        for r in report["rows"]:
            tbl_data.append([Paragraph(escape(str(v)), cell_style) for v in r])
        t = Table(tbl_data, repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#004AAC")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FB")]),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(t)
    else:
        story.append(Paragraph("No records found for the selected filter criteria.", styles["Normal"]))

    if report.get("summary"):
        story.append(Spacer(1, 12))
        s_lines = [f"<b>{escape(k.replace('_', ' ').title())}:</b> {escape(str(v))}" for k, v in report["summary"].items()]
        story.append(Paragraph(" | ".join(s_lines), cell_style))

    doc.build(story)
    return buf.getvalue()

