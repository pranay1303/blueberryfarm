from __future__ import annotations

import uuid
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client: TestClient):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@123"})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# 1. PUBLIC CUSTOMER PORTAL TESTS (NO AUTH REQUIRED)
# ==============================================================================

def test_public_resort_info(client: TestClient):
    res = client.get("/api/public/resort-info")
    assert res.status_code == 200
    data = res.json()
    assert "resort" in data
    assert "Blueberry Farm" in data["resort"]["name"]
    assert "Karjat" in data["resort"]["address"]
    assert "Mandawane" in data["resort"]["address"]


def test_public_packages_catalog(client: TestClient):
    res = client.get("/api/public/packages")
    assert res.status_code == 200
    data = res.json()
    packages = data.get("items", [])
    assert len(packages) >= 2
    pkg_codes = [p["package_code"] for p in packages]
    assert "PKG-24HR-STAY" in pkg_codes


def test_public_enquiry_submission(client: TestClient):
    payload = {
        "full_name": "Vikram Adhav",
        "mobile": "9819912345",
        "whatsapp": "9819912345",
        "email": "vikram.adhav@example.com",
        "address": "Baner Road",
        "city": "Pune",
        "state": "Maharashtra",
        "pin_code": "411045",
        "check_in_date": "2026-12-15",
        "check_out_date": "2026-12-16",
        "package_id": "PKG-24HR-STAY",
        "adults": 4,
        "children": 2,
        "infants": 1,
        "occasion": "Family gathering",
        "food_preferences": "Both Veg and Non-Veg (Maharashtrian style)",
        "special_requirements": "Need 2 ground floor rooms for senior citizens.",
        "vehicles": [
            {"vehicle_type": "SUV", "registration_number": "MH 12 AB 1234", "notes": "Toyota Fortuner"},
            {"vehicle_type": "Car", "registration_number": "MH 14 CD 5678", "notes": "Hyundai Creta"},
        ],
        "website_url_hp": "",  # Spam honeypot
    }

    res = client.post("/api/public/enquiries", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["enquiry_reference"].startswith("ENQ-")
    assert data["summary"]["total_guests"] == 7  # 4 adults + 2 children + 1 infant


def test_public_enquiry_spam_rejection(client: TestClient):
    payload = {
        "full_name": "Spam Bot",
        "mobile": "9999999999",
        "check_in_date": "2026-12-15",
        "check_out_date": "2026-12-16",
        "adults": 2,
        "website_url_hp": "http://spamsite.xyz",  # Trap honeypot
    }
    res = client.post("/api/public/enquiries", json=payload)
    assert res.status_code == 201
    # Honeypot silently trapped without processing
    assert res.json()["enquiry_reference"] == "ENQ-CONFIRMED"


# ==============================================================================
# 2. ADMIN AUTHENTICATION & SLUG LOGIN
# ==============================================================================

def test_admin_login_with_slug(client: TestClient):
    res = client.post("/api/auth/login", json={"username": "pranit-dabhade", "password": "Admin@123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "OWNER_ADMIN"


def test_admin_me_and_session(client: TestClient, auth_headers: dict):
    res = client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["username"] == "admin"


# ==============================================================================
# 3. ENQUIRY REVIEW & APPROVAL WORKFLOW
# ==============================================================================

def test_enquiry_review_and_approval(client: TestClient, auth_headers: dict):
    # 1. Fetch pending enquiries
    res = client.get("/api/enquiries?status=PENDING_REVIEW", headers=auth_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) > 0

    enquiry = items[0]
    enquiry_id = enquiry["id"]

    # 2. Approve enquiry via review endpoint
    app_res = client.post(
        f"/api/enquiries/{enquiry_id}/review",
        headers=auth_headers,
        json={"status": "APPROVED", "remarks": "Approved for Vikram Adhav family. Rooms allocated."},
    )
    assert app_res.status_code == 200, app_res.text
    app_data = app_res.json()
    assert app_data["status"] == "APPROVED"
    assert app_data["booking_reference"].startswith("BKG-")


# ==============================================================================
# 4. CRM & VEHICLES IN MYSQL
# ==============================================================================

def test_vehicles_listing_and_lookup(client: TestClient, auth_headers: dict):
    res = client.get("/api/vehicles?search=MH12", headers=auth_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
    assert any("MH12AB1234" in v["registration_number"] for v in items)


def test_customers_crm_listing(client: TestClient, auth_headers: dict):
    res = client.get("/api/customers", headers=auth_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
    names = [c["full_name"] for c in items]
    assert any("Vikram Adhav" in n for n in names)


# ==============================================================================
# 5. FINANCIAL OPERATIONS & REPORTLAB PDFS
# ==============================================================================

def test_direct_invoice_creation_without_pre_registration(client: TestClient, auth_headers: dict):
    payload = {
        "customer_name": "Suresh Deshmukh Direct",
        "customer_mobile": "9822012345",
        "customer_address": "Thane West, Maharashtra",
        "line_items": [
            {
                "item_type": "package",
                "description": "24-Hour Farm Stay Package",
                "quantity": 3,
                "unit": "Person",
                "rate": 1800,
            },
            {
                "item_type": "food",
                "description": "Chicken 65 Add-on Platter",
                "quantity": 2,
                "unit": "Plate",
                "rate": 350,
            },
        ],
        "initial_payment_amount": 3000,
        "initial_payment_method": "UPI",
        "notes": "Direct walk-in billing.",
    }
    res = client.post("/api/invoices", headers=auth_headers, json=payload)
    assert res.status_code == 201, res.text
    inv = res.json()["invoice"]
    assert inv["invoice_number"].startswith("INV-")
    assert inv["customer_name"] == "Suresh Deshmukh Direct"
    assert inv["subtotal"] == 6100.0  # 3*1800 + 2*350 = 5400 + 700 = 6100
    assert inv["payment_status"] == "Partially Paid"
    assert inv["balance_due"] == 3100.0

    # Verify ReportLab PDF download
    pdf_res = client.get(f"/api/invoices/{inv['id']}/pdf", headers=auth_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000  # Valid PDF binary bytes


def test_payment_recording_and_receipt(client: TestClient, auth_headers: dict):
    invs_res = client.get("/api/invoices", headers=auth_headers)
    inv = invs_res.json()["items"][0]

    pay_res = client.post(
        "/api/payments",
        headers=auth_headers,
        json={
            "customer_id": inv["customer_id"],
            "invoice_id": inv["id"],
            "amount": 1000.0,
            "payment_type": "Partial",
            "payment_method": "Cash",
            "notes": "Cash collected at counter.",
        },
    )
    assert pay_res.status_code == 201, pay_res.text
    pay = pay_res.json()["payment"]
    assert pay["receipt_number"].startswith("REC-")


def test_expense_management(client: TestClient, auth_headers: dict):
    res = client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "category": "Food and groceries",
            "description": "Fresh vegetables and dairy from Karjat market",
            "vendor": "Karjat APMC Mandi",
            "amount": 4200.0,
            "payment_method": "Cash",
        },
    )
    assert res.status_code == 201, res.text
    exp = res.json()["expense"]
    assert exp["expense_code"].startswith("EXP-")
    assert exp["amount"] == 4200.0


# ==============================================================================
# 6. DASHBOARD ANALYTICS & METRICS
# ==============================================================================

def test_analytics_dashboard_metrics(client: TestClient, auth_headers: dict):
    res = client.get("/api/analytics/dashboard", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    metrics = data["metrics"]
    assert metrics["total_enquiries"] >= 1
    assert metrics["total_bookings"] >= 1
    assert metrics["total_invoiced"] > 0
    assert metrics["total_collected"] > 0
    assert "monthly_trends" in data


# ==============================================================================
# 7. ROOMS, MEALS, ADDONS & CMS
# ==============================================================================

def test_rooms_catalog_and_availability(client: TestClient, auth_headers: dict):
    # List rooms
    res = client.get("/api/rooms", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    rooms = data.get("items", data)
    assert len(rooms) >= 1
    first_room = rooms[0]
    assert "room_number" in first_room
    assert "room_name" in first_room

    # Check availability
    avail_res = client.get("/api/rooms/availability?check_in=2026-12-01&check_out=2026-12-02", headers=auth_headers)
    assert avail_res.status_code == 200
    avail_data = avail_res.json()
    assert "rooms" in avail_data
    assert len(avail_data["rooms"]) >= 1


def test_meals_catalog_and_kitchen_report(client: TestClient, auth_headers: dict):
    # List meals
    res = client.get("/api/meals", headers=auth_headers)
    assert res.status_code == 200
    meals = res.json()
    assert len(meals) >= 1

    # Kitchen daily operations report
    kitchen_res = client.get("/api/meals/kitchen-daily-report?target_date=2026-12-01", headers=auth_headers)
    assert kitchen_res.status_code == 200
    report = kitchen_res.json()
    assert "summary" in report
    assert "total_headcount_to_feed" in report["summary"]


def test_addons_catalog_and_creation(client: TestClient, auth_headers: dict):
    # List addons
    res = client.get("/api/addons", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    addons = data.get("items", data)
    assert len(addons) >= 1

    # Create new test addon
    test_code = f"ADD-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "addon_code": test_code,
        "name": "Campfire Guitars & Live Music",
        "category": "Celebration",
        "pricing_type": "Fixed",
        "price": 1500.0,
        "description": "Live acoustic music performance by the campfire.",
        "requires_admin_approval": True,
        "is_public": True,
        "is_active": True,
    }
    create_res = client.post("/api/addons", json=payload, headers=auth_headers)
    assert create_res.status_code == 201
    created_addon = create_res.json().get("addon", create_res.json())
    assert created_addon["addon_code"] == test_code


def test_website_cms_content_and_update(client: TestClient, auth_headers: dict):
    # Get hero banner
    res = client.get("/api/cms/content/hero_banner")
    assert res.status_code == 200
    data = res.json()
    assert "title" in data or "content" in data

    # Update CMS section
    update_payload = {
        "title": "Welcome to Blueberry Farm & Resort",
        "content_json": {
            "title": "Escape to Nature, Pool & Authentic Farm Stay",
            "tagline": "Karjat lush greenery just 90 mins from Mumbai & Pune",
        },
        "is_published": True,
    }
    put_res = client.put("/api/cms/content/hero_banner", json=update_payload, headers=auth_headers)
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["success"] is True


def test_public_booking_tracking(client: TestClient):
    # Track with invalid query
    empty_res = client.get("/api/public/track-booking?query=")
    assert empty_res.status_code == 400

    # Track with non-existent query
    notfound_res = client.get("/api/public/track-booking?query=NONEXISTENT123")
    assert notfound_res.status_code == 200
    assert notfound_res.json()["found"] is False

    # Submit a new public enquiry to test enquiry-based tracking directly
    tomorrow = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
    day_after = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
    enq_res = client.post("/api/public/enquiries", json={
        "full_name": "Siddharth Shinde",
        "mobile": "9820011999",
        "check_in_date": tomorrow,
        "check_out_date": day_after,
        "adults": 3,
        "children": 1,
        "package_code": "PKG-24HR-STAY",
    })
    assert enq_res.status_code == 201
    enq_ref = enq_res.json()["enquiry_reference"]

    # Track by Enquiry Reference (e.g. ENQ-2026-XXXX)
    track_enq_res = client.get(f"/api/public/track-booking?query={enq_ref}")
    assert track_enq_res.status_code == 200
    enq_track_data = track_enq_res.json()
    assert enq_track_data["found"] is True
    assert enq_track_data["type"] == "ENQUIRY"
    assert enq_track_data["reference"] == enq_ref
    assert enq_track_data["booking_status"] == "PENDING_REVIEW"
    assert enq_track_data["booking_reference"] is None

    # Track with existing mobile number
    mob_res = client.get("/api/public/track-booking?query=9819912345")
    assert mob_res.status_code == 200
    track_data = mob_res.json()
    assert track_data["found"] is True
    assert "reference" in track_data
    assert "booking_status" in track_data
