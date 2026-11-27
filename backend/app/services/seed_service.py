from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List

from app.core.config import ist_now, ist_now_iso, settings
from app.logging.audit_logger import log_activity
from app.storage.json_store import (
    ALL_ENTITIES,
    allocate_sequence,
    generate_unique_id,
    read_json,
    read_records,
    update_json,
)


def ensure_initial_data() -> None:
    """Ensure all JSON files exist and preload initial configurable package pricing."""
    settings.ensure_directories()
    for entity in ALL_ENTITIES:
        read_json(entity)

    existing_packages = read_records("packages", include_archived=True)
    if not existing_packages:
        now = ist_now_iso()
        initial_packages = [
            {
                "id": generate_unique_id("PKG"),
                "package_id": "PKG-001",
                "name": "24-Hour Stay Package",
                "description": "Full 24-hour resort staycation with AC rooms and unlimited farm-fresh meals.",
                "category": "Stay",
                "weekday_rate": 1800.0,
                "weekend_rate": 2500.0,
                "adult_price": 1800.0,
                "child_price": 1200.0,
                "infant_price": 0.0,
                "included_meals": "Unlimited Food (Breakfast, Lunch, High Tea, Dinner)",
                "room_inclusion": "AC Cottage / Deluxe Room",
                "activities": "Swimming Pool, Rain Dance, Indoor Games, Outdoor Turf, Farm Walk",
                "check_in_policy": "12:00 PM (or flexible 24-hr slot)",
                "check_out_policy": "11:00 AM Next Day",
                "additional_inclusions": "Children aged 1-5 complimentary; Children aged 5-10 at ₹1,200/child.",
                "exclusions": "Personal beverages, special event decor, DJ/bonfire extras.",
                "is_active": True,
                "is_demo": False,
                "created_at": now,
                "updated_at": now,
                "is_archived": False,
            },
            {
                "id": generate_unique_id("PKG"),
                "package_id": "PKG-002",
                "name": "One-Day Staycation Package",
                "description": "Day picnic & farm resort experience with breakfast, lunch, high tea and pool access.",
                "category": "Daycation",
                "weekday_rate": 1300.0,
                "weekend_rate": 1300.0,
                "adult_price": 1300.0,
                "child_price": 1200.0,
                "infant_price": 0.0,
                "included_meals": "Breakfast, Lunch and High Tea",
                "room_inclusion": "Common changing room & lawn seating (private room optional)",
                "activities": "Swimming Pool, Rain Dance, Music, Indoor & Outdoor Games",
                "check_in_policy": "09:30 AM",
                "check_out_policy": "06:00 PM",
                "additional_inclusions": "Children aged 1-5 complimentary; Children aged 5-10 at ₹1,200/child.",
                "exclusions": "Dinner, overnight room stay.",
                "is_active": True,
                "is_demo": False,
                "created_at": now,
                "updated_at": now,
                "is_archived": False,
            },
        ]

        def _seed_pkgs(doc: Dict[str, Any]) -> None:
            if not doc["records"]:
                doc["records"] = initial_packages

        update_json("packages", _seed_pkgs)
        update_json("counters", lambda d: d["data"].__setitem__("package", max(int(d["data"].get("package", 0)), 2)))


def load_demo_dataset(actor_id: str, actor_username: str) -> Dict[str, int]:
    """
    Insert clearly marked DEMO records (is_demo=True) for testing and evaluation.
    Does not touch or overwrite existing real business records.
    """
    now_dt = ist_now()
    now_iso = now_dt.isoformat()
    today = now_dt.strftime("%Y-%m-%d")
    yesterday = (now_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    tomorrow = (now_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    next_week = (now_dt + timedelta(days=5)).strftime("%Y-%m-%d")

    # Check if demo data already loaded
    existing_cust = [c for c in read_records("customers") if c.get("is_demo")]
    if existing_cust:
        return {"customers": 0, "bookings": 0, "quotations": 0, "invoices": 0, "payments": 0, "expenses": 0}

    packages = read_records("packages")
    pkg_24 = packages[0] if packages else None
    pkg_day = packages[1] if len(packages) > 1 else pkg_24

    c1_id = generate_unique_id("CUST")
    c2_id = generate_unique_id("CUST")
    demo_customers = [
        {
            "id": c1_id,
            "customer_id": f"CUS-{allocate_sequence('customer'):04d}",
            "full_name": "DEMO - Aarav Kulkarni",
            "mobile": "9820011223",
            "whatsapp_number": "9820011223",
            "email": "aarav.demo@example.com",
            "address": "Flat 402, Green Park Residency, Panvel",
            "city": "Navi Mumbai",
            "state": "Maharashtra",
            "pin_code": "410206",
            "company_name": "DEMO Tech Solutions",
            "gstin": None,
            "customer_type": "Corporate",
            "notes": "DEMO record - safe to clear from Settings.",
            "created_at": now_iso,
            "updated_at": now_iso,
            "created_by": actor_username,
            "is_demo": True,
            "is_archived": False,
        },
        {
            "id": c2_id,
            "customer_id": f"CUS-{allocate_sequence('customer'):04d}",
            "full_name": "DEMO - Sneha Deshmukh",
            "mobile": "9819099887",
            "whatsapp_number": "9819099887",
            "email": "sneha.demo@example.com",
            "address": "B-12, Shivaji Nagar",
            "city": "Pune",
            "state": "Maharashtra",
            "pin_code": "411005",
            "company_name": None,
            "gstin": None,
            "customer_type": "Family",
            "notes": "DEMO record - family weekend stay.",
            "created_at": now_iso,
            "updated_at": now_iso,
            "created_by": actor_username,
            "is_demo": True,
            "is_archived": False,
        },
    ]

    q1_id = generate_unique_id("QTN")
    q1_num = f"QTN-{allocate_sequence('quotation'):04d}"
    demo_quotations = [
        {
            "id": q1_id,
            "quotation_number": q1_num,
            "quotation_date": today,
            "valid_until": next_week,
            "customer_id": c2_id,
            "customer_name": "DEMO - Sneha Deshmukh",
            "customer_mobile": "9819099887",
            "customer_email": "sneha.demo@example.com",
            "customer_address": "B-12, Shivaji Nagar, Pune - 411005",
            "package_id": pkg_24["id"] if pkg_24 else None,
            "package_name": pkg_24["name"] if pkg_24 else "24-Hour Stay Package",
            "check_in_date": tomorrow,
            "check_out_date": (now_dt + timedelta(days=2)).strftime("%Y-%m-%d"),
            "check_in_time": "12:00 PM",
            "check_out_time": "11:00 AM",
            "adults": 6,
            "children": 2,
            "infants": 1,
            "rooms": 2,
            "dormitory_guests": 0,
            "special_requirements": "Jain lunch option for 2 guests",
            "line_items": [
                {
                    "id": generate_unique_id("LI"),
                    "description": "24-Hour Stay Package (Adults)",
                    "quantity": 6,
                    "rate": 1800.0,
                    "unit": "person",
                    "discount": 0.0,
                    "tax_rate": 0.0,
                    "amount": 10800.0,
                },
                {
                    "id": generate_unique_id("LI"),
                    "description": "Children (Age 5-10)",
                    "quantity": 2,
                    "rate": 1200.0,
                    "unit": "child",
                    "discount": 0.0,
                    "tax_rate": 0.0,
                    "amount": 2400.0,
                },
                {
                    "id": generate_unique_id("LI"),
                    "description": "Infants (Age 1-5) - Complimentary",
                    "quantity": 1,
                    "rate": 0.0,
                    "unit": "infant",
                    "discount": 0.0,
                    "tax_rate": 0.0,
                    "amount": 0.0,
                },
            ],
            "subtotal": 13200.0,
            "discount_total": 0.0,
            "taxable_amount": 13200.0,
            "cgst_amount": 0.0,
            "sgst_amount": 0.0,
            "igst_amount": 0.0,
            "tax_total": 0.0,
            "additional_charges": 0.0,
            "grand_total": 13200.0,
            "advance_required": 6600.0,
            "terms_and_conditions": "DEMO quotation terms.",
            "status": "Sent",
            "created_by": actor_username,
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        }
    ]

    b1_id = generate_unique_id("BKG")
    b1_ref = f"BFR-{allocate_sequence('booking'):04d}"
    b2_id = generate_unique_id("BKG")
    b2_ref = f"BFR-{allocate_sequence('booking'):04d}"
    demo_bookings = [
        {
            "id": b1_id,
            "booking_reference": b1_ref,
            "customer_id": c1_id,
            "customer_name": "DEMO - Aarav Kulkarni",
            "contact_number": "9820011223",
            "customer_email": "aarav.demo@example.com",
            "customer_address": "Flat 402, Green Park Residency, Panvel, Navi Mumbai - 410206",
            "company_name": "DEMO Tech Solutions",
            "booking_date": yesterday,
            "check_in_date": yesterday,
            "check_out_date": today,
            "check_in_time": "10:00 AM",
            "check_out_time": "06:00 PM",
            "package_id": pkg_day["id"] if pkg_day else None,
            "package_name": pkg_day["name"] if pkg_day else "One-Day Staycation Package",
            "adults": 10,
            "children": 0,
            "infants": 0,
            "rooms": 1,
            "dormitory_guests": 0,
            "special_requests": "Corporate team outing",
            "food_requirements": "Veg & Non-Veg Buffet",
            "additional_services": "Sound system for team games",
            "booking_source": "Direct",
            "assigned_staff": actor_username,
            "booking_status": "Checked Out",
            "payment_status": "Paid",
            "total_booking_amount": 13000.0,
            "advance_paid": 13000.0,
            "remaining_balance": 0.0,
            "created_by": actor_username,
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
        {
            "id": b2_id,
            "booking_reference": b2_ref,
            "customer_id": c2_id,
            "customer_name": "DEMO - Sneha Deshmukh",
            "contact_number": "9819099887",
            "customer_email": "sneha.demo@example.com",
            "customer_address": "B-12, Shivaji Nagar, Pune - 411005",
            "booking_date": today,
            "check_in_date": tomorrow,
            "check_out_date": (now_dt + timedelta(days=2)).strftime("%Y-%m-%d"),
            "check_in_time": "12:00 PM",
            "check_out_time": "11:00 AM",
            "package_id": pkg_24["id"] if pkg_24 else None,
            "package_name": pkg_24["name"] if pkg_24 else "24-Hour Stay Package",
            "adults": 6,
            "children": 2,
            "infants": 1,
            "rooms": 2,
            "dormitory_guests": 0,
            "booking_source": "Phone",
            "assigned_staff": actor_username,
            "booking_status": "Confirmed",
            "payment_status": "Partially Paid",
            "total_booking_amount": 13200.0,
            "advance_paid": 5000.0,
            "remaining_balance": 8200.0,
            "created_by": actor_username,
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
    ]

    inv1_id = generate_unique_id("INV")
    inv1_num = f"INV-{allocate_sequence('invoice'):04d}"
    demo_invoices = [
        {
            "id": inv1_id,
            "invoice_number": inv1_num,
            "invoice_date": today,
            "document_title": "PAID INVOICE",
            "customer_id": c1_id,
            "customer_name": "DEMO - Aarav Kulkarni",
            "company_name": "DEMO Tech Solutions",
            "address": "Flat 402, Green Park Residency, Panvel, Navi Mumbai - 410206",
            "contact_number": "9820011223",
            "booking_id": b1_id,
            "booking_reference": b1_ref,
            "check_in_date": yesterday,
            "check_out_date": today,
            "line_items": [
                {
                    "id": generate_unique_id("LI"),
                    "description": "One Day Staycation",
                    "inclusion_text": "Stay includes Breakfast, Lunch and High Tea.",
                    "quantity": 10,
                    "rate": 1300.0,
                    "unit": "person",
                    "discount": 0.0,
                    "tax_rate": 0.0,
                    "amount": 13000.0,
                }
            ],
            "subtotal": 13000.0,
            "discount_total": 0.0,
            "taxable_amount": 13000.0,
            "cgst_amount": 0.0,
            "sgst_amount": 0.0,
            "igst_amount": 0.0,
            "tax_total": 0.0,
            "additional_charges": 0.0,
            "grand_total": 13000.0,
            "advance_paid": 5000.0,
            "previous_payments": 5000.0,
            "current_payment": 8000.0,
            "total_amount_paid": 13000.0,
            "balance_due": 0.0,
            "payment_status": "Paid",
            "payment_method": "Google Pay",
            "payment_reference": "UPI-DEMO-88412",
            "gpay_number": "8669408484",
            "account_name": "Pranit Dabhade",
            "account_number": "---------------------",
            "authorized_signatory": "Pranit Dabhade",
            "is_finalized": True,
            "created_by": actor_username,
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        }
    ]
    demo_bookings[0]["invoice_id"] = inv1_id

    demo_payments = [
        {
            "id": generate_unique_id("PAY"),
            "payment_id": f"PAY-{allocate_sequence('payment'):04d}",
            "receipt_number": f"RCP-{allocate_sequence('receipt'):04d}",
            "booking_id": b1_id,
            "invoice_id": inv1_id,
            "customer_id": c1_id,
            "customer_name": "DEMO - Aarav Kulkarni",
            "payment_date": yesterday,
            "amount": 5000.0,
            "payment_type": "Advance",
            "payment_method": "UPI",
            "transaction_id": "UPI-DEMO-11021",
            "payment_reference": "Booking Advance",
            "received_by": actor_username,
            "notes": "DEMO advance",
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
        {
            "id": generate_unique_id("PAY"),
            "payment_id": f"PAY-{allocate_sequence('payment'):04d}",
            "receipt_number": f"RCP-{allocate_sequence('receipt'):04d}",
            "booking_id": b1_id,
            "invoice_id": inv1_id,
            "customer_id": c1_id,
            "customer_name": "DEMO - Aarav Kulkarni",
            "payment_date": today,
            "amount": 8000.0,
            "payment_type": "Full",
            "payment_method": "Google Pay",
            "transaction_id": "UPI-DEMO-88412",
            "payment_reference": "Final Settlement",
            "received_by": actor_username,
            "notes": "DEMO final payment",
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
        {
            "id": generate_unique_id("PAY"),
            "payment_id": f"PAY-{allocate_sequence('payment'):04d}",
            "receipt_number": f"RCP-{allocate_sequence('receipt'):04d}",
            "booking_id": b2_id,
            "invoice_id": None,
            "customer_id": c2_id,
            "customer_name": "DEMO - Sneha Deshmukh",
            "payment_date": today,
            "amount": 5000.0,
            "payment_type": "Advance",
            "payment_method": "Bank Transfer",
            "transaction_id": "NEFT-DEMO-5521",
            "payment_reference": "Advance for weekend stay",
            "received_by": actor_username,
            "notes": "DEMO booking advance",
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
    ]

    demo_expenses = [
        {
            "id": generate_unique_id("EXP"),
            "expense_id": f"EXP-{allocate_sequence('expense'):04d}",
            "expense_date": today,
            "category": "Food and groceries",
            "description": "DEMO - Fresh vegetables, dairy & kitchen supplies",
            "vendor": "Karjat Agro Market",
            "amount": 3200.0,
            "payment_method": "Cash",
            "entered_by": actor_username,
            "notes": "DEMO expense entry",
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
        {
            "id": generate_unique_id("EXP"),
            "expense_id": f"EXP-{allocate_sequence('expense'):04d}",
            "expense_date": yesterday,
            "category": "Electricity",
            "description": "DEMO - MSEDCL Monthly Power Bill",
            "vendor": "MSEDCL",
            "amount": 4500.0,
            "payment_method": "UPI",
            "entered_by": actor_username,
            "notes": "DEMO utility expense",
            "created_at": now_iso,
            "updated_at": now_iso,
            "is_demo": True,
            "is_archived": False,
        },
    ]

    update_json("customers", lambda d: d["records"].extend(demo_customers))
    update_json("quotations", lambda d: d["records"].extend(demo_quotations))
    update_json("bookings", lambda d: d["records"].extend(demo_bookings))
    update_json("invoices", lambda d: d["records"].extend(demo_invoices))
    update_json("payments", lambda d: d["records"].extend(demo_payments))
    update_json("expenses", lambda d: d["records"].extend(demo_expenses))

    log_activity(
        action="load_demo_data",
        module="settings",
        user_id=actor_id,
        username=actor_username,
        metadata={"counts": {"customers": 2, "bookings": 2, "quotations": 1, "invoices": 1, "payments": 3, "expenses": 2}},
    )

    return {"customers": 2, "bookings": 2, "quotations": 1, "invoices": 1, "payments": 3, "expenses": 2}


def clear_demo_dataset(actor_id: str, actor_username: str) -> Dict[str, int]:
    """Remove all records marked is_demo=True across business entities."""
    removed: Dict[str, int] = {}
    for entity in ("customers", "quotations", "bookings", "invoices", "payments", "expenses", "packages"):
        def _strip(doc: Dict[str, Any]) -> int:
            before = len(doc["records"])
            doc["records"] = [r for r in doc["records"] if not r.get("is_demo", False)]
            return before - len(doc["records"])

        _, count = update_json(entity, _strip)
        removed[entity] = count

    log_activity(
        action="clear_demo_data",
        module="settings",
        user_id=actor_id,
        username=actor_username,
        metadata={"removed": removed},
    )
    return removed

