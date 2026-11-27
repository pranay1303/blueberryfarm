from __future__ import annotations

import concurrent.futures
import io
import zipfile
from pathlib import Path

import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.pdf.document_pdf import generate_invoice_pdf
from app.storage.json_store import (
    allocate_sequence,
    create_backup,
    read_object,
    read_records,
    restore_backup,
    update_json,
    verify_backup,
)


def _setup_owner_and_login(client: TestClient) -> dict:
    r0 = client.get("/api/auth/setup-status")
    assert r0.status_code == 200
    assert r0.json()["needs_initial_setup"] is True

    r1 = client.post(
        "/api/auth/setup-owner",
        json={
            "username": "owner",
            "full_name": "Pranit Dabhade",
            "email": "blueberrryfarmandresort.gmail.com",
            "password": "OwnerPassword!2026",
        },
    )
    assert r1.status_code == 201
    data = r1.json()
    assert "password_hash" not in data["user"]
    return data


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_auth_rbac_and_session_revocation(isolated_env):
    with TestClient(app) as client:
        owner_data = _setup_owner_and_login(client)
        owner_tok = owner_data["access_token"]

        # Owner can also sign in using slugified full name (pranit-dabhade)
        r_slug_login = client.post(
            "/api/auth/login",
            json={"username": "pranit-dabhade", "password": "OwnerPassword!2026"},
        )
        assert r_slug_login.status_code == 200
        assert r_slug_login.json()["user"]["username"] == "owner"

        # Create Reception Staff
        r_staff = client.post(
            "/api/staff",
            headers=_auth_headers(owner_tok),
            json={
                "username": "reception1",
                "full_name": "Reception User",
                "role": "RECEPTION_STAFF",
                "password": "StaffPassword!123",
            },
        )
        assert r_staff.status_code == 201
        assert "password_hash" not in r_staff.json()["user"]

        # Login as reception
        r_login = client.post(
            "/api/auth/login",
            json={"username": "reception1", "password": "StaffPassword!123"},
        )
        assert r_login.status_code == 200
        rec_tok = r_login.json()["access_token"]

        # Reception CANNOT access staff list, backups, or expenses
        assert client.get("/api/staff", headers=_auth_headers(rec_tok)).status_code == 403
        assert client.get("/api/backups", headers=_auth_headers(rec_tok)).status_code == 403
        assert client.get("/api/expenses", headers=_auth_headers(rec_tok)).status_code == 403

        # Logout revokes session token immediately
        assert client.post("/api/auth/logout", headers=_auth_headers(rec_tok)).status_code == 200
        assert client.get("/api/auth/me", headers=_auth_headers(rec_tok)).status_code == 401

        # Rate limiting check
        for _ in range(5):
            client.post("/api/auth/login", json={"username": "owner", "password": "wrong"})
        r_limited = client.post("/api/auth/login", json={"username": "owner", "password": "wrong"})
        assert r_limited.status_code == 429


def test_concurrent_json_writes_and_corruption_recovery(isolated_env):
    # 12 threads allocating sequences and appending customers concurrently
    def worker(idx: int) -> int:
        seq = allocate_sequence("customer")
        update_json(
            "customers",
            lambda d: d["records"].append({"id": f"C-{idx}", "seq": seq}),
        )
        return seq

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        seqs = list(pool.map(worker, range(24)))

    assert sorted(seqs) == list(range(1, 25))
    recs = read_records("customers")
    assert len(recs) == 24

    # Simulate corruption on customers.json and verify automatic .bak recovery
    cust_path = isolated_env / "data" / "customers.json"
    cust_path.write_text("{corrupted json!!!", encoding="utf-8")
    recovered = read_records("customers")
    assert len(recovered) == 24


def test_full_business_flow_packages_bookings_quotations_invoices_payments_refunds_gst(isolated_env):
    with TestClient(app) as client:
        owner_tok = _setup_owner_and_login(client)["access_token"]
        hdr = _auth_headers(owner_tok)

        # 1. Verify initial packages (24-hr 1800/2500, One-day 1300/1300, child 1200, infant 0)
        pkgs = client.get("/api/packages", headers=hdr).json()["items"]
        assert len(pkgs) == 2
        pkg_24 = pkgs[0]
        assert pkg_24["weekday_rate"] == 1800.0
        assert pkg_24["weekend_rate"] == 2500.0

        # Weekend quote check (2026-11-14 is Saturday)
        q_res = client.post(
            "/api/packages/quote",
            headers=hdr,
            json={
                "package_id": pkg_24["id"],
                "check_in_date": "2026-11-14",
                "check_out_date": "2026-11-15",
                "adults": 4,
                "children": 2,
                "infants": 1,
            },
        )
        assert q_res.status_code == 200
        quote = q_res.json()["quote"]
        # 4 * 2500 + 2 * 1200 + 1 * 0 = 12400
        assert quote["total_package_amount"] == 12400.0

        # 2. Create customer & verify duplicate prevention
        c_res = client.post(
            "/api/customers",
            headers=hdr,
            json={
                "full_name": "Plus 91 Design",
                "mobile": "9876543210",
                "address": "Flat no:-1001, Patel Heights, Plot no:-30, Sector 19, Ulwe",
                "city": "Navi Mumbai",
                "pin_code": "410206",
                "company_name": "Plus 91 Design",
            },
        )
        assert c_res.status_code == 201
        cust = c_res.json()["customer"]

        c_dup = client.post(
            "/api/customers",
            headers=hdr,
            json={"full_name": "Duplicate", "mobile": "+91 9876543210"},
        )
        assert c_dup.status_code == 409

        # 3. Create quotation (GST disabled by default -> 0 tax)
        qt_res = client.post(
            "/api/quotations",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "package_id": pkg_24["id"],
                "check_in_date": "2026-11-14",
                "check_out_date": "2026-11-15",
                "adults": 10,
                "children": 0,
                "infants": 0,
                "rooms": 3,
                "line_items": [
                    {
                        "description": "One Day Staycation",
                        "inclusion_text": "Stay includes All Meals including Breakfast, Lunch, HiTea, Dinner.",
                        "quantity": 10,
                        "rate": 2500,
                        "discount": 0,
                    }
                ],
                "advance_required": 10000,
            },
        )
        assert qt_res.status_code == 201
        qt = qt_res.json()["quotation"]
        assert qt["grand_total"] == 25000.0
        assert qt["tax_total"] == 0.0

        # Download quotation PDF
        qt_pdf = client.get(f"/api/quotations/{qt['id']}/pdf", headers=hdr)
        assert qt_pdf.status_code == 200
        assert qt_pdf.content.startswith(b"%PDF-")

        # 4. Convert quotation to booking without duplicating customer
        conv = client.post(f"/api/quotations/{qt['id']}/convert-to-booking", headers=hdr)
        assert conv.status_code == 200
        bkg = conv.json()["booking"]
        assert bkg["customer_id"] == cust["id"]
        assert bkg["total_booking_amount"] == 25000.0
        assert len(client.get("/api/customers", headers=hdr).json()["items"]) == 1

        # 5. Record advance payment on booking
        p1 = client.post(
            "/api/payments",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "booking_id": bkg["id"],
                "amount": 10000,
                "payment_type": "Advance",
                "payment_method": "Google Pay",
                "transaction_id": "GPAY-TXN-1001",
            },
        )
        assert p1.status_code == 201
        assert p1.json()["booking"]["remaining_balance"] == 15000.0

        # Prevent duplicate transaction ID
        p_dup = client.post(
            "/api/payments",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "booking_id": bkg["id"],
                "amount": 10000,
                "payment_type": "Advance",
                "payment_method": "Google Pay",
                "transaction_id": "GPAY-TXN-1001",
            },
        )
        assert p_dup.status_code == 409

        # 6. Generate Invoice from booking (auto-links ₹10,000 advance!)
        inv_res = client.post(
            "/api/invoices",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "booking_id": bkg["id"],
                "quotation_id": qt["id"],
                "line_items": [
                    {
                        "description": "One Day Staycation",
                        "inclusion_text": "Stay includes All Meals including Breakfast, Lunch, HiTea, Dinner.",
                        "quantity": 10,
                        "rate": 2500,
                        "discount": 0,
                    }
                ],
                "finalize": True,
            },
        )
        assert inv_res.status_code == 201
        inv = inv_res.json()["invoice"]
        assert inv["grand_total"] == 25000.0
        assert inv["total_amount_paid"] == 10000.0
        assert inv["balance_due"] == 15000.0
        assert inv["payment_status"] == "Partially Paid"
        assert inv["document_title"] == "INVOICE"

        # Finalized invoice cannot be silently edited
        assert client.put(f"/api/invoices/{inv['id']}", headers=hdr, json={}).status_code == 403

        # 7. Final payment settles invoice -> becomes PAID INVOICE
        p2 = client.post(
            "/api/payments",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "invoice_id": inv["id"],
                "amount": 15000,
                "payment_type": "Full",
                "payment_method": "UPI",
                "transaction_id": "UPI-FINAL-2002",
            },
        )
        assert p2.status_code == 201
        assert p2.json()["invoice"]["balance_due"] == 0.0
        assert p2.json()["invoice"]["payment_status"] == "Paid"
        assert p2.json()["invoice"]["document_title"] == "PAID INVOICE"

        # 8. Refund adjustment increases balance due back by refund amount
        p_ref = client.post(
            "/api/payments",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "invoice_id": inv["id"],
                "amount": 2000,
                "payment_type": "Refund",
                "payment_method": "Bank Transfer",
                "transaction_id": "REF-3003",
            },
        )
        assert p_ref.status_code == 201
        assert p_ref.json()["invoice"]["balance_due"] == 2000.0
        assert p_ref.json()["invoice"]["total_amount_paid"] == 23000.0

        # Receipt PDF works
        rcp_pdf = client.get(f"/api/payments/{p2.json()['payment']['id']}/receipt-pdf", headers=hdr)
        assert rcp_pdf.status_code == 200
        assert rcp_pdf.content.startswith(b"%PDF-")

        # 9. Enable GST in settings and test tax calculation
        client.put(
            "/api/settings",
            headers=hdr,
            json={"gst": {"enabled": True, "cgst_rate": 6.0, "sgst_rate": 6.0, "igst_rate": 0.0}},
        )
        qt_gst = client.post(
            "/api/quotations/calculate",
            headers=hdr,
            json={
                "customer_id": cust["id"],
                "check_in_date": "2026-11-20",
                "check_out_date": "2026-11-21",
                "line_items": [{"description": "Room Stay", "quantity": 2, "rate": 5000, "discount": 1000}],
                "apply_gst": True,
            },
        ).json()["totals"]
        # (2*5000 - 1000) = 9000 taxable; 6% CGST (540) + 6% SGST (540) = 1080 tax; grand = 10080
        assert qt_gst["taxable_amount"] == 9000.0
        assert qt_gst["cgst_amount"] == 540.0
        assert qt_gst["sgst_amount"] == 540.0
        assert qt_gst["grand_total"] == 10080.0

        # 10. Expense & Analytics distinction (collected cash vs invoiced vs expenses)
        exp_res = client.post(
            "/api/expenses",
            headers=hdr,
            json={
                "category": "Food and groceries",
                "description": "Kitchen supplies",
                "amount": 4000,
                "payment_method": "Cash",
            },
        )
        assert exp_res.status_code == 201

        dash = client.get("/api/dashboard?preset=all", headers=hdr).json()
        assert dash["kpis"]["total_invoiced_revenue"] == 25000.0
        assert dash["kpis"]["total_collected_revenue"] == 23000.0
        assert dash["kpis"]["pending_balances"] == 2000.0
        assert dash["kpis"]["total_expenses"] == 4000.0
        assert dash["kpis"]["estimated_operating_profit"] == 19000.0

        # 11. Reports & Exports (PDF, XLSX, JSON)
        for fmt in ("pdf", "xlsx", "json"):
            rep = client.get(f"/api/reports/profit_and_loss/export?format={fmt}", headers=hdr)
            assert rep.status_code == 200
            assert len(rep.content) > 100

        # 12. Audit logs never contain password hashes or JWT tokens
        logs = client.get("/api/audit-logs?log_type=activity", headers=hdr).json()
        assert logs["total"] > 0
        raw_log_text = str(logs)
        assert "OwnerPassword" not in raw_log_text
        assert owner_tok not in raw_log_text

        # 13. Backup, Verify, Mutate, Restore
        bkp = client.post("/api/backups", headers=hdr).json()["backup"]
        ver = client.post(f"/api/backups/{bkp['filename']}/verify", headers=hdr).json()
        assert ver["valid"] is True

        # Add an extra customer after backup, then restore backup and confirm rollback
        client.post("/api/customers", headers=hdr, json={"full_name": "After Backup", "mobile": "9999988888"})
        assert len(client.get("/api/customers", headers=hdr).json()["items"]) == 2
        rst = client.post(f"/api/backups/{bkp['filename']}/restore", headers=hdr)
        assert rst.status_code == 200
        assert len(client.get("/api/customers", headers=hdr).json()["items"]) == 1


def test_pdf_all_12_invoice_cases(isolated_env):
    """Test all 12 PDF test cases from Section 13 and verify selectable text + layout integrity."""
    resort_settings = read_object("settings")
    base_inv = {
        "invoice_number": "INV-0123",
        "invoice_date": "2026-11-08",
        "customer_name": "Plus 91 Design",
        "company_name": "Plus 91 Design",
        "address": "Flat no:-1001, Patel Heights, Plot no:-30, Sector 19, Ulwe, Navi Mumbai - 410206",
        "contact_number": "8669408484",
        "check_in_date": "2026-11-07",
        "check_out_date": "2026-11-08",
        "booking_reference": "BFR-0123",
        "gpay_number": "8669408484",
        "account_name": "Pranit Dabhade",
        "account_number": "---------------------",
    }

    cases = [
        # 1. Single-item invoice
        {**base_inv, "document_title": "PAID INVOICE", "payment_status": "Paid", "line_items": [{"description": "One Day Staycation", "inclusion_text": "Stay includes All Meals including Breakfast, Lunch, HiTea, Dinner.", "quantity": 10, "rate": 2500, "amount": 25000}], "subtotal": 25000, "grand_total": 25000, "total_amount_paid": 25000, "balance_due": 0},
        # 2. Multiple-item invoice
        {**base_inv, "document_title": "INVOICE", "payment_status": "Paid", "line_items": [{"description": "24 Hours Stay Package", "quantity": 4, "rate": 2500, "amount": 10000}, {"description": "Decoration", "quantity": 1, "rate": 3500, "amount": 3500}], "subtotal": 13500, "grand_total": 13500, "total_amount_paid": 13500, "balance_due": 0},
        # 3. Long description
        {**base_inv, "line_items": [{"description": "Corporate Retreat Full Day Package", "inclusion_text": "Includes morning tea, welcome drinks, buffet breakfast, swimming pool, rain dance, lawn games, veg/non-veg lunch, high tea, evening snacks, and conference hall setup for 40 guests.", "quantity": 1, "rate": 45000, "amount": 45000}], "subtotal": 45000, "grand_total": 45000, "total_amount_paid": 45000, "balance_due": 0},
        # 4. Large customer address
        {**base_inv, "address": "Tower B, Wing 4, Floor 18, Flat 1804, Grandeur Paradise Residential Complex, Near Palm Beach Road, Sector 48, Seawoods Nerul West, Navi Mumbai, Dist. Thane, Maharashtra - 400706", "line_items": [{"description": "Room Stay", "quantity": 2, "rate": 2500, "amount": 5000}], "subtotal": 5000, "grand_total": 5000, "total_amount_paid": 5000, "balance_due": 0},
        # 5. Partial payment
        {**base_inv, "document_title": "INVOICE", "payment_status": "Partially Paid", "line_items": [{"description": "Stay Package", "quantity": 6, "rate": 2500, "amount": 15000}], "subtotal": 15000, "grand_total": 15000, "advance_paid": 5000, "total_amount_paid": 5000, "balance_due": 10000},
        # 6. Fully paid
        {**base_inv, "document_title": "PAID INVOICE", "payment_status": "Paid", "line_items": [{"description": "Stay Package", "quantity": 2, "rate": 1800, "amount": 3600}], "subtotal": 3600, "grand_total": 3600, "total_amount_paid": 3600, "balance_due": 0},
        # 7. Unpaid
        {**base_inv, "document_title": "PROFORMA INVOICE", "payment_status": "Unpaid", "line_items": [{"description": "Stay Package", "quantity": 4, "rate": 1800, "amount": 7200}], "subtotal": 7200, "grand_total": 7200, "total_amount_paid": 0, "balance_due": 7200},
        # 8. Discount applied
        {**base_inv, "line_items": [{"description": "24-Hour Package", "quantity": 5, "rate": 2500, "discount": 1500, "amount": 11000}], "subtotal": 12500, "discount_total": 1500, "grand_total": 11000, "total_amount_paid": 11000, "balance_due": 0},
        # 9. Tax applied
        {**base_inv, "line_items": [{"description": "Stay", "quantity": 2, "rate": 5000, "amount": 10000}], "subtotal": 10000, "taxable_amount": 10000, "cgst_amount": 600, "sgst_amount": 600, "tax_total": 1200, "grand_total": 11200, "total_amount_paid": 11200, "balance_due": 0},
        # 10. Zero-value complimentary guest
        {**base_inv, "line_items": [{"description": "Adult Stay", "quantity": 2, "rate": 1800, "amount": 3600}, {"description": "Child (Age 1-5) Complimentary", "quantity": 1, "rate": 0, "amount": 0}], "subtotal": 3600, "grand_total": 3600, "total_amount_paid": 3600, "balance_due": 0},
        # 11. Large guest count
        {**base_inv, "line_items": [{"description": "School Picnic Group", "quantity": 250, "rate": 1300, "amount": 325000}], "subtotal": 325000, "grand_total": 325000, "total_amount_paid": 325000, "balance_due": 0},
        # 12. Multiple-page invoice (28 items)
        {**base_inv, "line_items": [{"description": f"Service Item #{i}", "inclusion_text": "Detailed farm resort hospitality service line", "quantity": 1, "rate": 500, "amount": 500} for i in range(1, 29)], "subtotal": 14000, "grand_total": 14000, "total_amount_paid": 14000, "balance_due": 0},
    ]

    for idx, inv_data in enumerate(cases, start=1):
        pdf_bytes = generate_invoice_pdf(inv_data, resort_settings)
        assert pdf_bytes.startswith(b"%PDF-"), f"Case {idx} did not return valid PDF"
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        full_text = "\n".join(page.get_text() for page in doc)
        assert "Blueberry Farm and Resort" in full_text, f"Case {idx} missing resort name"
        assert "8669408484" in full_text, f"Case {idx} missing footer phone"
        assert "blueberrryfarmandresort.gmail.com" in full_text, f"Case {idx} missing footer email"
        assert "Authorized Signature" in full_text, f"Case {idx} missing signature section"
        if idx == 12:
            assert len(doc) >= 2, "Case 12 (28 items) should span multiple pages"
            assert f"Page {len(doc)} of {len(doc)}" in full_text


def test_direct_customer_invoice_auto_registers_customer(isolated_env):
    with TestClient(app) as client:
        tok = _setup_owner_and_login(client)["access_token"]
        hdr = _auth_headers(tok)

        # Create an invoice directly by customer_name without pre-creating in Customers
        res1 = client.post(
            "/api/invoices",
            headers=hdr,
            json={
                "customer_name": "Walk-In Guest Rakesh",
                "customer_address": "Karjat, Maharashtra",
                "line_items": [{"description": "One Day Staycation", "quantity": 2, "rate": 1300, "discount": 0}],
                "initial_payment_amount": 2600,
                "initial_payment_method": "Cash",
                "finalize": True,
            },
        )
        assert res1.status_code == 201
        body1 = res1.json()
        assert body1["invoice"]["customer_name"] == "Walk-In Guest Rakesh"
        assert body1["invoice"]["document_title"] == "PAID INVOICE"
        assert body1["customer"]["full_name"] == "Walk-In Guest Rakesh"
        created_cust_id = body1["customer"]["id"]

        # Customer now exists in /api/customers automatically
        custs = client.get("/api/customers", headers=hdr).json()["items"]
        assert any(c["id"] == created_cust_id and c["full_name"] == "Walk-In Guest Rakesh" for c in custs)

        # Direct invoice with a mobile creates once and subsequent invoice with same mobile reuses it
        res2 = client.post(
            "/api/invoices",
            headers=hdr,
            json={
                "customer_name": "Sneha More",
                "customer_mobile": "9811223344",
                "line_items": [{"description": "Day Package", "quantity": 1, "rate": 1300}],
            },
        )
        assert res2.status_code == 201
        sneha_id = res2.json()["customer"]["id"]

        res3 = client.post(
            "/api/invoices",
            headers=hdr,
            json={
                "customer_name": "Sneha More",
                "customer_mobile": "+91 9811223344",
                "line_items": [{"description": "Extra Meal", "quantity": 1, "rate": 500}],
            },
        )
        assert res3.status_code == 201
        assert res3.json()["invoice"]["customer_id"] == sneha_id

        # Verify storage summary and selective clear with pre-clear safety backup
        summary_res = client.get("/api/storage/summary", headers=hdr)
        assert summary_res.status_code == 200
        sum_data = summary_res.json()
        assert "sections" in sum_data
        assert sum_data["sections"]["invoices"]["count"] >= 3
        assert sum_data["sections"]["customers"]["count"] >= 2

        # Clear only invoices section
        clear_res = client.post("/api/storage/clear", headers=hdr, json={"section": "invoices"})
        assert clear_res.status_code == 200
        clear_data = clear_res.json()
        assert clear_data["section"] == "invoices"
        assert clear_data["cleared_count"] >= 3
        assert "safety_backup" in clear_data

        # Invoices should now be empty, but customers still exist
        inv_after = client.get("/api/invoices", headers=hdr).json()["items"]
        assert len(inv_after) == 0

        cust_after = client.get("/api/customers", headers=hdr).json()["items"]
        assert len(cust_after) >= 2



