from __future__ import annotations

import logging
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy.orm import Session
from app.authentication.security import hash_password
from app.database.session import SessionLocal
from app.models.sql_models import (
    Addon,
    BusinessSetting,
    ExpenseCategory,
    Meal,
    Package,
    Permission,
    Role,
    Room,
    User,
)

logger = logging.getLogger("blueberry.seed")

DEFAULT_PERMISSIONS = [
    # Dashboard & Analytics
    ("dashboard:view", "View Dashboard", "dashboard"),
    ("analytics:view", "View Analytics", "analytics"),
    ("reports:view", "View & Export Reports", "reports"),
    # Enquiries
    ("enquiries:read", "View Booking Enquiries", "enquiries"),
    ("enquiries:write", "Review/Approve/Reject Enquiries", "enquiries"),
    # Bookings
    ("bookings:read", "View Bookings", "bookings"),
    ("bookings:write", "Create/Edit/Cancel Bookings", "bookings"),
    # Customers & Vehicles
    ("customers:read", "View Customers & Vehicles", "customers"),
    ("customers:write", "Create/Edit Customers & Vehicles", "customers"),
    ("vehicles:read", "View Vehicles", "vehicles"),
    ("vehicles:write", "Manage Vehicles", "vehicles"),
    # Packages
    ("packages:read", "View Packages", "packages"),
    ("packages:write", "Create/Edit Packages & Menu", "packages"),
    # Quotations
    ("quotations:read", "View Quotations", "quotations"),
    ("quotations:write", "Create/Edit/Convert Quotations", "quotations"),
    # Invoices & Billing
    ("invoices:read", "View Invoices", "invoices"),
    ("invoices:write", "Generate/Edit/Cancel Invoices", "invoices"),
    # Payments
    ("payments:read", "View Payments & Receipts", "payments"),
    ("payments:write", "Record Payments & Issue Receipts", "payments"),
    # Expenses
    ("expenses:read", "View Expenses", "expenses"),
    ("expenses:write", "Record/Edit Expenses", "expenses"),
    # System Administration
    ("staff:manage", "Manage Staff Users & Roles", "admin"),
    ("settings:manage", "Manage Resort & Tax Settings", "admin"),
    ("data:manage", "Clear / Export / Destructive Operations", "admin"),
    ("backups:manage", "Create / Restore / Download Backups", "admin"),
]

ROLE_PERMISSION_MAP = {
    "OWNER_ADMIN": [p[0] for p in DEFAULT_PERMISSIONS],
    "MANAGER": [
        "dashboard:view", "analytics:view", "reports:view",
        "enquiries:read", "enquiries:write",
        "bookings:read", "bookings:write",
        "customers:read", "customers:write",
        "vehicles:read", "vehicles:write",
        "packages:read", "packages:write",
        "quotations:read", "quotations:write",
        "invoices:read",
        "payments:read",
        "expenses:read",
    ],
    "RECEPTION_STAFF": [
        "dashboard:view",
        "enquiries:read", "enquiries:write",
        "bookings:read", "bookings:write",
        "customers:read", "customers:write",
        "vehicles:read", "vehicles:write",
        "packages:read",
        "quotations:read", "quotations:write",
        "invoices:read",
    ],
    "ACCOUNTS_STAFF": [
        "dashboard:view", "reports:view",
        "invoices:read", "invoices:write",
        "payments:read", "payments:write",
        "expenses:read", "expenses:write",
    ],
}

DEFAULT_PACKAGES = [
    {
        "package_code": "PKG-24HR-STAY",
        "name": "24-Hour Staycation Package",
        "description": "Full day resort stay including AC cottage / room, swimming pool, rain dance, and all four unlimited meals.",
        "category": "Stay",
        "weekday_rate": Decimal("1800.00"),
        "weekend_rate": Decimal("2500.00"),
        "adult_price": Decimal("1800.00"),
        "child_price": Decimal("1200.00"),
        "infant_price": Decimal("0.00"),
        "included_meals": "Breakfast, Lunch, High Tea, Dinner (Unlimited Food)",
        "room_inclusion": "AC Deluxe Room / Villa Inclusion",
        "activities": "Swimming Pool, Rain Dance, Music, Indoor Games (Carrom, Chess), Outdoor Games (Cricket, Badminton)",
        "check_in_policy": "12:00 PM",
        "check_out_policy": "11:00 AM",
        "additional_inclusions": "Children 1–5: Complimentary. Children 5–10: ₹1,200.",
        "is_active": True,
        "is_public": True,
    },
    {
        "package_code": "PKG-1DAY-OUTING",
        "name": "One-Day Outing / Picnic Package",
        "description": "Ideal for day picnics, family outings, and corporate day events without overnight stay.",
        "category": "Daycation",
        "weekday_rate": Decimal("1300.00"),
        "weekend_rate": Decimal("1300.00"),
        "adult_price": Decimal("1300.00"),
        "child_price": Decimal("800.00"),
        "infant_price": Decimal("0.00"),
        "included_meals": "Breakfast, Buffet Lunch, High Tea with Snacks",
        "room_inclusion": "Changing Room & Rest Area",
        "activities": "Swimming Pool, Rain Dance, Lawn Access, Indoor & Outdoor Games",
        "check_in_policy": "09:00 AM",
        "check_out_policy": "06:00 PM",
        "additional_inclusions": "Children 1–5: Complimentary.",
        "is_active": True,
        "is_public": True,
    },
]

DEFAULT_SETTINGS = {
    "business_profile": {
        "name": "Blueberry Farm and Resort",
        "tagline": "Nature Stay, Farm & Events Resort Karjat",
        "address": "At. Post – Mandawane, Tal – Karjat, Dist – Raigad, Maharashtra",
        "phone": "8669408484",
        "whatsapp": "8669408484",
        "email": "info@blueberryfarmandresort.com",
        "website": "blueberryfarmandresort.com",
        "check_in_default": "12:00 PM",
        "check_out_default": "11:00 AM",
    },
    "payment_info": {
        "upi_id": "blueberryfarm@oksbi",
        "gpay_number": "8669408484",
        "bank_name": "State Bank of India",
        "account_name": "Blueberry Farm and Resort",
        "account_number": "39882200192",
        "ifsc_code": "SBIN0000301",
        "branch": "Karjat",
    },
    "tax_gst": {
        "enabled": False,
        "gstin": "",
        "cgst_rate": 6.0,
        "sgst_rate": 6.0,
        "igst_rate": 12.0,
        "invoice_prefix": "INV-2026-",
        "quotation_prefix": "QT-2026-",
        "receipt_prefix": "REC-2026-",
    },
    "meal_addons": [
        {"name": "Bhaji (Veg Pakora)", "rate": 150.0, "unit": "plate"},
        {"name": "Chicken 65", "rate": 320.0, "unit": "plate"},
        {"name": "Paneer Chilli", "rate": 260.0, "unit": "plate"},
        {"name": "Fish Fry / Surmai", "rate": 380.0, "unit": "plate"},
        {"name": "Chicken Tandoori", "rate": 350.0, "unit": "plate"},
        {"name": "Veg Thali", "rate": 250.0, "unit": "plate"},
        {"name": "Non-Veg Thali", "rate": 350.0, "unit": "plate"},
        {"name": "Tea / Coffee", "rate": 40.0, "unit": "cup"},
        {"name": "Water Bottle", "rate": 20.0, "unit": "bottle"},
        {"name": "Extra Bed / Mattress", "rate": 400.0, "unit": "night"},
        {"name": "Bonfire Setup", "rate": 800.0, "unit": "event"},
        {"name": "DJ / Sound System", "rate": 2500.0, "unit": "event"},
    ],
}

DEFAULT_EXPENSE_CATEGORIES = [
    "Food and groceries",
    "Staff salaries",
    "Electricity",
    "Water",
    "Maintenance",
    "Cleaning",
    "Marketing",
    "Transportation",
    "Repairs",
    "Supplies",
    "Miscellaneous",
]


DEFAULT_ROOMS = [
    {"room_number": "Cottage 1", "room_name": "Sunrise AC Cottage", "accommodation_type": "Cottage", "room_category": "Deluxe AC", "capacity": 4, "number_of_beds": 2, "is_ac": True, "base_rate": 2500.0, "extra_guest_charge": 800.0, "amenities": "AC, Attached Bathroom, Double Bed, Hot Water, Garden View"},
    {"room_number": "Cottage 2", "room_name": "Valley View Cottage", "accommodation_type": "Cottage", "room_category": "Deluxe AC", "capacity": 4, "number_of_beds": 2, "is_ac": True, "base_rate": 2500.0, "extra_guest_charge": 800.0, "amenities": "AC, Attached Bathroom, Double Bed, Hot Water, Pool Proximity"},
    {"room_number": "Cottage 3", "room_name": "Palm Grove Cottage", "accommodation_type": "Cottage", "room_category": "Deluxe AC", "capacity": 4, "number_of_beds": 2, "is_ac": True, "base_rate": 2500.0, "extra_guest_charge": 800.0, "amenities": "AC, Attached Bathroom, Double Bed, Hot Water"},
    {"room_number": "Cottage 4", "room_name": "River Breeze Cottage", "accommodation_type": "Cottage", "room_category": "Deluxe AC", "capacity": 4, "number_of_beds": 2, "is_ac": True, "base_rate": 2500.0, "extra_guest_charge": 800.0, "amenities": "AC, Attached Bathroom, Double Bed, Hot Water"},
    {"room_number": "Suite 101", "room_name": "Family Grand Suite", "accommodation_type": "Suite", "room_category": "Family AC", "capacity": 8, "number_of_beds": 4, "is_ac": True, "base_rate": 5000.0, "extra_guest_charge": 800.0, "amenities": "AC, 2 Attached Bathrooms, 4 Queen Beds, Balcony"},
    {"room_number": "Dormitory A", "room_name": "Lush Lawn Dormitory", "accommodation_type": "Dormitory", "room_category": "Dormitory", "capacity": 20, "number_of_beds": 20, "is_ac": True, "base_rate": 15000.0, "extra_guest_charge": 600.0, "amenities": "AC, 4 Bathrooms, Individual Beds, Storage Lockers"},
]

DEFAULT_MEALS = [
    {"meal_code": "MEAL-CHICKEN-CURRY", "name": "Maharashtrian Chicken Curry", "category": "Lunch", "dietary_type": "Non-Vegetarian", "price": 0.0, "price_unit": "Per Person", "is_package_includable": True, "serving_time": "1:30 PM", "description": "Authentic country chicken in rich roasted coconut onion gravy."},
    {"meal_code": "MEAL-CHICKEN-65", "name": "Chicken 65 Platter", "category": "Extra Meals", "dietary_type": "Non-Vegetarian", "price": 320.0, "price_unit": "Per Plate", "is_package_includable": False, "serving_time": "Anytime", "description": "Spicy, crispy fried chicken tossed with curry leaves and green chillies."},
    {"meal_code": "MEAL-PANEER-BHAJI", "name": "Paneer Masala / Bhaji", "category": "Lunch", "dietary_type": "Vegetarian", "price": 0.0, "price_unit": "Per Person", "is_package_includable": True, "serving_time": "1:30 PM", "description": "Fresh cottage cheese cubes in rich tomato cashew gravy."},
    {"meal_code": "MEAL-KANDA-BHAJI", "name": "Crisp Kanda Bhaji (Onion Pakoda)", "category": "Hi-Tea / Snacks", "dietary_type": "Vegetarian", "price": 0.0, "price_unit": "Per Person", "is_package_includable": True, "serving_time": "5:00 PM", "description": "Hot, crispy shredded onion fritters served with green chutney and cutting chai."},
    {"meal_code": "MEAL-MISAL-PAV", "name": "Karjat Kat Misal Pav", "category": "Breakfast", "dietary_type": "Vegetarian", "price": 0.0, "price_unit": "Per Person", "is_package_includable": True, "serving_time": "8:30 AM", "description": "Fiery sprouted moth bean curry topped with farsan, chopped onions, and fresh pav."},
    {"meal_code": "MEAL-KANDA-POHA", "name": "Authentic Kanda Poha", "category": "Breakfast", "dietary_type": "Vegetarian", "price": 0.0, "price_unit": "Per Person", "is_package_includable": True, "serving_time": "8:30 AM", "description": "Flattened rice cooked with turmeric, mustard seeds, onions, potatoes, and fresh coriander."},
]

DEFAULT_ADDONS = [
    {"addon_code": "ADDON-BONFIRE", "name": "Evening Bonfire Setup", "category": "Activities", "pricing_type": "Fixed", "price": 800.0, "description": "Rustic wood bonfire arrangement near the cottage lawn under the night stars.", "requires_admin_approval": True, "is_public": True},
    {"addon_code": "ADDON-BIRTHDAY-DECOR", "name": "Birthday Balloon & Ribbon Decoration", "category": "Decoration", "pricing_type": "Fixed", "price": 1500.0, "description": "Festive balloon arch, birthday banner, and fairy lights in the cottage or poolside.", "requires_admin_approval": True, "is_public": True},
    {"addon_code": "ADDON-ANNIVERSARY-DECOR", "name": "Romantic Anniversary Floral Setup", "category": "Decoration", "pricing_type": "Fixed", "price": 2000.0, "description": "Rose petal bed decor, heart balloon frame, and ambient candlelight arrangement.", "requires_admin_approval": True, "is_public": True},
    {"addon_code": "ADDON-BARBECUE-GRILL", "name": "Live Barbecue Grill Setup", "category": "Dining", "pricing_type": "Fixed", "price": 1200.0, "description": "Charcoal grill with skewers, marinades, and chef assistance for live evening BBQ.", "requires_admin_approval": True, "is_public": True},
    {"addon_code": "ADDON-CUSTOM-CAKE", "name": "Fresh Celebration Cake (1 Kg)", "category": "Celebration", "pricing_type": "Per Unit", "price": 750.0, "description": "Freshly baked customized chocolate / black forest / pineapple cake.", "requires_admin_approval": True, "is_public": True},
    {"addon_code": "ADDON-EXTRA-MATTRESS", "name": "Extra Bedding / Mattress Set", "category": "Logistics", "pricing_type": "Per Room", "price": 400.0, "description": "Comfortable foam mattress with clean bedsheet, pillow, and blanket.", "requires_admin_approval": False, "is_public": True},
]


def seed_database(db: Session) -> None:
    """Seed initial roles, permissions, Pranit owner account, packages, and settings."""
    # 1. Permissions
    perm_objs: Dict[str, Permission] = {}
    for code, name, mod in DEFAULT_PERMISSIONS:
        perm = db.query(Permission).filter(Permission.code == code).first()
        if not perm:
            perm = Permission(code=code, name=name, module=mod, description=f"Allows {name.lower()}")
            db.add(perm)
            db.flush()
        perm_objs[code] = perm

    # 2. Roles
    role_objs: Dict[str, Role] = {}
    for r_name, p_codes in ROLE_PERMISSION_MAP.items():
        role = db.query(Role).filter(Role.name == r_name).first()
        if not role:
            role = Role(name=r_name, description=f"{r_name.replace('_', ' ').title()} role")
            db.add(role)
            db.flush()
        role.permissions = [perm_objs[c] for c in p_codes if c in perm_objs]
        role_objs[r_name] = role

    # 3. Owner Account (Pranit / admin)
    owner = db.query(User).filter(User.username == "admin").first()
    if not owner:
        owner = User(
            username="admin",
            full_name="Pranit Dabhade",
            email="blueberrryfarmandresort.gmail.com",
            mobile="8669408484",
            password_hash=hash_password("Admin@123"),
            role="OWNER_ADMIN",
            role_id=role_objs["OWNER_ADMIN"].id,
            is_active=True,
        )
        db.add(owner)
        logger.info("Initialized Owner / Super Admin account: admin (Pranit Dabhade)")

    # 4. Packages
    for p_data in DEFAULT_PACKAGES:
        pkg = db.query(Package).filter(Package.package_code == p_data["package_code"]).first()
        if not pkg:
            pkg = Package(**p_data)
            db.add(pkg)

    # 5. Business Settings
    for key, val in DEFAULT_SETTINGS.items():
        s = db.query(BusinessSetting).filter(BusinessSetting.key == key).first()
        if not s:
            s = BusinessSetting(key=key, value_json=val)
            db.add(s)

    # 6. Expense Categories
    for c_name in DEFAULT_EXPENSE_CATEGORIES:
        cat = db.query(ExpenseCategory).filter(ExpenseCategory.name == c_name).first()
        if not cat:
            cat = ExpenseCategory(name=c_name, description=c_name)
            db.add(cat)

    # 7. Rooms
    for r_data in DEFAULT_ROOMS:
        rm = db.query(Room).filter(Room.room_number == r_data["room_number"]).first()
        if not rm:
            rm = Room(**r_data)
            db.add(rm)

    # 8. Meals
    for m_data in DEFAULT_MEALS:
        ml = db.query(Meal).filter(Meal.meal_code == m_data["meal_code"]).first()
        if not ml:
            ml = Meal(**m_data)
            db.add(ml)

    # 9. Add-on Services
    for a_data in DEFAULT_ADDONS:
        ad = db.query(Addon).filter(Addon.addon_code == a_data["addon_code"]).first()
        if not ad:
            ad = Addon(**a_data)
            db.add(ad)

    db.commit()
    logger.info("Database seeding completed.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_database(db)
        print("Database seeded successfully with roles, Pranit owner account, packages, and settings!")
    finally:
        db.close()
