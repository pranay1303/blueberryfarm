from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.storage.json_store import read_object


def round_money(value: float) -> float:
    return round(float(value or 0.0), 2)


def is_weekend_date(d: date) -> bool:
    # Friday night/Saturday/Sunday or Saturday/Sunday? In Indian resort hospitality, Saturday (5) & Sunday (6) are weekend days.
    return d.weekday() in (5, 6)


def calculate_package_quote(
    package: Dict[str, Any],
    *,
    check_in_date: str,
    check_out_date: str,
    adults: int = 1,
    children: int = 0,
    infants: int = 0,
    special_dates: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Calculate dynamic package pricing based on package master rates,
    weekday vs weekend/special dates, adults, children (5-10), and infants (1-5 complimentary).
    """
    d_in = datetime.strptime(check_in_date[:10], "%Y-%m-%d").date()
    d_out = datetime.strptime(check_out_date[:10], "%Y-%m-%d").date()
    nights = max(1, (d_out - d_in).days)
    special_set = set(special_dates or [])

    weekday_rate = float(package.get("weekday_rate") or package.get("adult_price") or 0.0)
    weekend_rate = float(package.get("weekend_rate") or weekday_rate)
    child_rate = float(package.get("child_price", 0.0))
    infant_rate = float(package.get("infant_price", 0.0))

    # For multi-night stays, average or sum per night; for 1-day/24hr (nights=1), check check_in_date
    total_adult_per_person = 0.0
    weekend_nights = 0
    weekday_nights = 0
    for offset in range(nights):
        cur = d_in + timedelta(days=offset)
        cur_str = cur.strftime("%Y-%m-%d")
        if is_weekend_date(cur) or cur_str in special_set:
            total_adult_per_person += weekend_rate
            weekend_nights += 1
        else:
            total_adult_per_person += weekday_rate
            weekday_nights += 1

    # Child rate per night/stay unit
    total_child_per_person = child_rate * nights
    total_infant_per_person = infant_rate * nights

    adult_amount = round_money(adults * total_adult_per_person)
    child_amount = round_money(children * total_child_per_person)
    infant_amount = round_money(infants * total_infant_per_person)

    return {
        "nights": nights,
        "weekday_nights": weekday_nights,
        "weekend_nights": weekend_nights,
        "effective_adult_rate": round_money(total_adult_per_person),
        "effective_child_rate": round_money(total_child_per_person),
        "effective_infant_rate": round_money(total_infant_per_person),
        "adult_amount": adult_amount,
        "child_amount": child_amount,
        "infant_amount": infant_amount,
        "total_package_amount": round_money(adult_amount + child_amount + infant_amount),
    }


def compute_document_totals(
    line_items: List[Dict[str, Any]],
    *,
    additional_charges: float = 0.0,
    apply_gst: Optional[bool] = None,
    interstate: bool = False,
    gst_override: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """
    Authoritative backend calculation for quotations and invoices.
    Formula:
      Line total = Quantity * Rate
      Discounted amount = Line total - Discount
      Taxable amount = Sum of discounted line totals
      Tax = Applicable tax rate * taxable amount (or extracted if tax_inclusive)
      Grand total = Taxable amount + Tax + Additional charges
    """
    resort_settings = read_object("settings")
    gst_cfg = gst_override if gst_override is not None else resort_settings.get("gst", {})

    gst_enabled = bool(gst_cfg.get("enabled", False)) if apply_gst is None else bool(apply_gst)
    # Only charge configured GST if GST is enabled and configured by owner (or explicitly requested when enabled)
    if apply_gst is True and not gst_cfg.get("enabled", False):
        # Respect strict rule: do not automatically add GST unless configured in admin settings
        gst_enabled = False

    cgst_rate = float(gst_cfg.get("cgst_rate", 0.0)) if gst_enabled and not interstate else 0.0
    sgst_rate = float(gst_cfg.get("sgst_rate", 0.0)) if gst_enabled and not interstate else 0.0
    igst_rate = float(gst_cfg.get("igst_rate", 0.0)) if gst_enabled and interstate else 0.0
    tax_inclusive = bool(gst_cfg.get("tax_inclusive", False))

    computed_items: List[Dict[str, Any]] = []
    subtotal = 0.0
    discount_total = 0.0
    discounted_sum = 0.0
    explicit_line_tax = 0.0

    for raw in line_items:
        qty = max(0.0, float(raw.get("quantity", 1.0)))
        rate = max(0.0, float(raw.get("rate", 0.0)))
        discount = max(0.0, float(raw.get("discount", 0.0)))
        line_gross = round_money(qty * rate)
        if discount > line_gross:
            discount = line_gross
        discounted_amount = round_money(line_gross - discount)

        item_tax_rate = float(raw.get("tax_rate", 0.0)) if gst_enabled else 0.0
        if item_tax_rate > 0:
            explicit_line_tax += round_money(discounted_amount * (item_tax_rate / 100.0))

        subtotal += line_gross
        discount_total += discount
        discounted_sum += discounted_amount

        item_out = dict(raw)
        item_out["id"] = raw.get("id") or f"LI-{uuid.uuid4().hex[:8].upper()}"
        item_out["quantity"] = qty
        item_out["rate"] = round_money(rate)
        item_out["discount"] = round_money(discount)
        item_out["tax_rate"] = item_tax_rate
        item_out["amount"] = discounted_amount
        computed_items.append(item_out)

    subtotal = round_money(subtotal)
    discount_total = round_money(discount_total)
    discounted_sum = round_money(discounted_sum)
    additional_charges = round_money(max(0.0, float(additional_charges or 0.0)))

    total_gst_rate = cgst_rate + sgst_rate + igst_rate
    cgst_amount = 0.0
    sgst_amount = 0.0
    igst_amount = 0.0
    taxable_amount = discounted_sum

    if gst_enabled:
        if total_gst_rate > 0:
            if tax_inclusive:
                # Extract tax from discounted_sum
                taxable_amount = round_money(discounted_sum / (1.0 + total_gst_rate / 100.0))
            else:
                taxable_amount = discounted_sum
            cgst_amount = round_money(taxable_amount * (cgst_rate / 100.0))
            sgst_amount = round_money(taxable_amount * (sgst_rate / 100.0))
            igst_amount = round_money(taxable_amount * (igst_rate / 100.0))
        elif explicit_line_tax > 0:
            # Per-line tax rates
            igst_amount = round_money(explicit_line_tax)

    tax_total = round_money(cgst_amount + sgst_amount + igst_amount)
    grand_total = round_money(taxable_amount + tax_total + additional_charges)

    totals = {
        "subtotal": subtotal,
        "discount_total": discount_total,
        "taxable_amount": taxable_amount,
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "igst_amount": igst_amount,
        "tax_total": tax_total,
        "additional_charges": additional_charges,
        "grand_total": grand_total,
    }
    return computed_items, totals


def compute_payment_balance(
    grand_total: float,
    payments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Formula:
      Balance Due = Invoice Grand Total - Valid Payments + Applicable Refund Adjustments
    """
    valid_payments = 0.0
    refund_adjustments = 0.0

    for p in payments:
        if p.get("is_archived"):
            continue
        amt = float(p.get("amount", 0.0))
        ptype = p.get("payment_type", "Payment")
        if ptype == "Refund":
            refund_adjustments += abs(amt)
        else:
            valid_payments += max(0.0, amt)

    valid_payments = round_money(valid_payments)
    refund_adjustments = round_money(refund_adjustments)
    net_paid = round_money(valid_payments - refund_adjustments)
    balance_due = round_money(max(0.0, float(grand_total) - valid_payments + refund_adjustments))

    if refund_adjustments > 0 and net_paid <= 0 and float(grand_total) > 0:
        status_str = "Refunded"
    elif balance_due <= 0.01 and float(grand_total) > 0:
        status_str = "Paid"
        balance_due = 0.0
    elif net_paid > 0:
        status_str = "Partially Paid"
    else:
        status_str = "Unpaid"

    return {
        "valid_payments": valid_payments,
        "refund_adjustments": refund_adjustments,
        "net_paid": max(0.0, net_paid),
        "balance_due": balance_due,
        "payment_status": status_str,
    }

