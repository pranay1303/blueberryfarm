from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.mysql import JSON
from sqlalchemy.orm import relationship

from app.core.config import ist_now
from app.database.session import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


# ==============================================================================
# 1. USERS, ROLES & PERMISSIONS
# ==============================================================================

class Role(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(50), unique=True, nullable=False, index=True)  # OWNER_ADMIN, MANAGER, RECEPTION_STAFF, ACCOUNTS_STAFF
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=ist_now)

    users = relationship("User", back_populates="role_rel")
    permissions = relationship("Permission", secondary="role_permissions", back_populates="roles")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    code = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    module = Column(String(50), nullable=False)
    description = Column(String(255), nullable=True)

    roles = relationship("Role", secondary="role_permissions", back_populates="permissions")


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id = Column(String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(String(36), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    mobile = Column(String(20), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="RECEPTION_STAFF")  # Stored role string for quick lookup
    role_id = Column(String(36), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    role_rel = relationship("Role", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user")


# ==============================================================================
# 2. CUSTOMERS & VEHICLES
# ==============================================================================

class Customer(Base):
    __tablename__ = "customers"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    customer_code = Column(String(30), unique=True, nullable=False, index=True)  # e.g. CUST-0001
    full_name = Column(String(100), nullable=False, index=True)
    mobile = Column(String(20), nullable=False, index=True)
    email = Column(String(100), nullable=True, index=True)
    whatsapp = Column(String(20), nullable=True)
    address_line = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True, default="Maharashtra")
    pin_code = Column(String(20), nullable=True)
    company_name = Column(String(150), nullable=True)
    gstin = Column(String(30), nullable=True)
    customer_source = Column(String(50), nullable=True, default="Website Booking")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    vehicles = relationship("Vehicle", back_populates="customer", cascade="all, delete-orphan")
    enquiries = relationship("BookingEnquiry", back_populates="customer")
    bookings = relationship("Booking", back_populates="customer")
    quotations = relationship("Quotation", back_populates="customer")
    invoices = relationship("Invoice", back_populates="customer")
    payments = relationship("Payment", back_populates="customer")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    customer_id = Column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    enquiry_id = Column(String(36), ForeignKey("booking_enquiries.id", ondelete="SET NULL"), nullable=True, index=True)
    vehicle_type = Column(String(50), nullable=False, default="Car")  # Car, SUV, Bike, Tempo Traveller, Bus, Other
    registration_number = Column(String(50), nullable=False, index=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=ist_now)

    customer = relationship("Customer", back_populates="vehicles")
    booking = relationship("Booking", back_populates="vehicles")
    enquiry = relationship("BookingEnquiry", back_populates="vehicles")


# ==============================================================================
# 3. PACKAGES & PRICING MASTER
# ==============================================================================

class Package(Base):
    __tablename__ = "packages"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    package_code = Column(String(30), unique=True, nullable=False, index=True)  # PKG-24HR, PKG-1DAY
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), default="Stay")  # Stay, Daycation, Event, Camping
    weekday_rate = Column(Numeric(12, 2), nullable=False, default=1800.00)
    weekend_rate = Column(Numeric(12, 2), nullable=False, default=2500.00)
    adult_price = Column(Numeric(12, 2), nullable=False, default=1800.00)
    child_price = Column(Numeric(12, 2), nullable=False, default=1200.00)
    infant_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    included_meals = Column(String(255), nullable=True)
    room_inclusion = Column(String(255), nullable=True)
    activities = Column(String(255), nullable=True)
    check_in_policy = Column(String(50), nullable=True, default="12:00 PM")
    check_out_policy = Column(String(50), nullable=True, default="11:00 AM")
    additional_inclusions = Column(Text, nullable=True)
    exclusions = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    bookings = relationship("Booking", back_populates="package")
    enquiries = relationship("BookingEnquiry", back_populates="package")
    prices = relationship("PackagePrice", back_populates="package", cascade="all, delete-orphan")


class PackagePrice(Base):
    __tablename__ = "package_prices"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    package_id = Column(String(36), ForeignKey("packages.id", ondelete="CASCADE"), nullable=False, index=True)
    season_name = Column(String(100), default="Standard")
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    weekday_rate = Column(Numeric(12, 2), nullable=False)
    weekend_rate = Column(Numeric(12, 2), nullable=False)
    child_rate = Column(Numeric(12, 2), nullable=False)
    infant_rate = Column(Numeric(12, 2), nullable=False, default=0.00)
    created_at = Column(DateTime, default=ist_now)

    package = relationship("Package", back_populates="prices")


# ==============================================================================
# 4. PUBLIC BOOKING ENQUIRIES & APPROVAL WORKFLOW
# ==============================================================================

class BookingEnquiry(Base):
    __tablename__ = "booking_enquiries"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    enquiry_reference = Column(String(40), unique=True, nullable=False, index=True)  # ENQ-2026-XXXX
    customer_id = Column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    package_id = Column(String(36), ForeignKey("packages.id", ondelete="SET NULL"), nullable=True, index=True)

    guest_name = Column(String(100), nullable=False)
    guest_mobile = Column(String(20), nullable=False, index=True)
    guest_email = Column(String(100), nullable=True)
    guest_address = Column(String(255), nullable=True)
    guest_city = Column(String(100), nullable=True)
    guest_pin = Column(String(20), nullable=True)

    check_in_date = Column(Date, nullable=False, index=True)
    check_in_time = Column(String(30), default="12:00 PM")
    check_out_date = Column(Date, nullable=False, index=True)
    check_out_time = Column(String(30), default="11:00 AM")

    adults = Column(Integer, default=2, nullable=False)
    children = Column(Integer, default=0, nullable=False)
    infants = Column(Integer, default=0, nullable=False)
    total_guests = Column(Integer, default=2, nullable=False)
    number_of_rooms = Column(Integer, default=1, nullable=False)
    dormitory_guests = Column(Integer, default=0, nullable=False)

    vehicle_count = Column(Integer, default=0, nullable=False)
    occasion = Column(String(100), nullable=True)
    food_preferences = Column(String(255), nullable=True)
    special_requirements = Column(Text, nullable=True)

    # Status: PENDING_REVIEW, APPROVED, REJECTED, MORE_INFO_REQUESTED, CONVERTED
    status = Column(String(40), default="PENDING_REVIEW", nullable=False, index=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    customer = relationship("Customer", back_populates="enquiries")
    package = relationship("Package", back_populates="enquiries")
    vehicles = relationship("Vehicle", back_populates="enquiry")
    booking = relationship("Booking", back_populates="enquiry", uselist=False)


# ==============================================================================
# 5. BOOKINGS & GUESTS
# ==============================================================================

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    booking_reference = Column(String(40), unique=True, nullable=False, index=True)  # BKG-2026-XXXX
    customer_id = Column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    enquiry_id = Column(String(36), ForeignKey("booking_enquiries.id", ondelete="SET NULL"), nullable=True, unique=True)
    package_id = Column(String(36), ForeignKey("packages.id", ondelete="SET NULL"), nullable=True)

    check_in_date = Column(Date, nullable=False, index=True)
    check_in_time = Column(String(30), default="12:00 PM")
    check_out_date = Column(Date, nullable=False, index=True)
    check_out_time = Column(String(30), default="11:00 AM")

    adults = Column(Integer, default=2, nullable=False)
    children = Column(Integer, default=0, nullable=False)
    infants = Column(Integer, default=0, nullable=False)
    total_guests = Column(Integer, default=2, nullable=False)
    number_of_rooms = Column(Integer, default=1, nullable=False)
    dormitory_guests = Column(Integer, default=0, nullable=False)

    assigned_staff = Column(String(100), nullable=True)
    occasion = Column(String(100), nullable=True)
    special_requests = Column(Text, nullable=True)

    # Status: Confirmed, Checked In, Checked Out, Cancelled
    booking_status = Column(String(40), default="Confirmed", nullable=False, index=True)
    # Payment status: Unpaid, Partially Paid, Paid, Refunded
    payment_status = Column(String(40), default="Unpaid", nullable=False, index=True)

    total_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    advance_paid = Column(Numeric(12, 2), default=0.00, nullable=False)
    balance_due = Column(Numeric(12, 2), default=0.00, nullable=False)

    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    customer = relationship("Customer", back_populates="bookings")
    enquiry = relationship("BookingEnquiry", back_populates="booking")
    package = relationship("Package", back_populates="bookings")
    vehicles = relationship("Vehicle", back_populates="booking")
    guests = relationship("BookingGuest", back_populates="booking", cascade="all, delete-orphan")
    quotations = relationship("Quotation", back_populates="booking")
    invoices = relationship("Invoice", back_populates="booking")
    payments = relationship("Payment", back_populates="booking")


class BookingGuest(Base):
    __tablename__ = "booking_guests"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    id_proof_type = Column(String(50), nullable=True)
    id_proof_number = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=ist_now)

    booking = relationship("Booking", back_populates="guests")


# ==============================================================================
# 6. QUOTATIONS & LINE ITEMS
# ==============================================================================

class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    quotation_number = Column(String(40), unique=True, nullable=False, index=True)  # QT-2026-XXXX
    customer_id = Column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)

    quotation_date = Column(Date, nullable=False)
    valid_until = Column(Date, nullable=False)
    check_in_date = Column(Date, nullable=True)
    check_out_date = Column(Date, nullable=True)

    package_name = Column(String(100), nullable=True)
    adults = Column(Integer, default=2)
    children = Column(Integer, default=0)
    infants = Column(Integer, default=0)

    subtotal = Column(Numeric(12, 2), default=0.00, nullable=False)
    discount = Column(Numeric(12, 2), default=0.00, nullable=False)
    tax_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    grand_total = Column(Numeric(12, 2), default=0.00, nullable=False)
    advance_required = Column(Numeric(12, 2), default=0.00, nullable=False)

    terms_and_conditions = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    # Status: Draft, Pending Approval, Approved, Sent, Accepted, Rejected, Expired, Converted
    status = Column(String(40), default="Draft", nullable=False, index=True)
    created_by = Column(String(100), nullable=True)
    pdf_path = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    customer = relationship("Customer", back_populates="quotations")
    booking = relationship("Booking", back_populates="quotations")
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    quotation_id = Column(String(36), ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    inclusion_text = Column(String(255), nullable=True)
    quantity = Column(Numeric(10, 2), default=1.00, nullable=False)
    rate = Column(Numeric(12, 2), default=0.00, nullable=False)
    unit = Column(String(30), default="person")
    discount = Column(Numeric(12, 2), default=0.00)
    tax_rate = Column(Numeric(5, 2), default=0.00)
    amount = Column(Numeric(12, 2), default=0.00, nullable=False)

    quotation = relationship("Quotation", back_populates="items")


# ==============================================================================
# 7. INVOICES & LINE ITEMS
# ==============================================================================

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    invoice_number = Column(String(40), unique=True, nullable=False, index=True)  # INV-2026-XXXX
    customer_id = Column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    quotation_id = Column(String(36), ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True)

    invoice_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=True)
    document_title = Column(String(50), default="TAX INVOICE")  # PAID INVOICE, PARTIALLY PAID INVOICE, PROFORMA INVOICE, CANCELLED INVOICE

    customer_name = Column(String(100), nullable=False)
    customer_mobile = Column(String(20), nullable=True)
    customer_address = Column(String(255), nullable=True)
    customer_gstin = Column(String(30), nullable=True)

    check_in_date = Column(Date, nullable=True)
    check_out_date = Column(Date, nullable=True)
    booking_reference = Column(String(40), nullable=True)

    subtotal = Column(Numeric(12, 2), default=0.00, nullable=False)
    discount_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    cgst_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    sgst_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    igst_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    tax_total = Column(Numeric(12, 2), default=0.00, nullable=False)
    grand_total = Column(Numeric(12, 2), default=0.00, nullable=False)

    total_amount_paid = Column(Numeric(12, 2), default=0.00, nullable=False)
    balance_due = Column(Numeric(12, 2), default=0.00, nullable=False)

    # Status: Paid, Partially Paid, Unpaid, Refunded, Cancelled
    payment_status = Column(String(40), default="Unpaid", nullable=False, index=True)
    is_finalized = Column(Boolean, default=False, nullable=False)
    cancellation_reason = Column(String(255), nullable=True)
    pdf_path = Column(String(255), nullable=True)

    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

    customer = relationship("Customer", back_populates="invoices")
    booking = relationship("Booking", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(10, 2), default=1.00, nullable=False)
    rate = Column(Numeric(12, 2), default=0.00, nullable=False)
    unit = Column(String(30), default="person")
    discount = Column(Numeric(12, 2), default=0.00)
    tax_rate = Column(Numeric(5, 2), default=0.00)
    amount = Column(Numeric(12, 2), default=0.00, nullable=False)

    invoice = relationship("Invoice", back_populates="items")


# ==============================================================================
# 8. PAYMENTS & REFUNDS
# ==============================================================================

class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    receipt_number = Column(String(40), unique=True, nullable=False, index=True)  # REC-2026-XXXX
    customer_id = Column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)

    payment_date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_type = Column(String(40), default="Advance")  # Advance, Partial, Full, Balance, Refund
    payment_method = Column(String(50), default="Google Pay")  # Cash, UPI, Google Pay, Bank Transfer, Card, Other
    transaction_id = Column(String(100), nullable=True)
    received_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    receipt_pdf_path = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=ist_now)

    customer = relationship("Customer", back_populates="payments")
    booking = relationship("Booking", back_populates="payments")
    invoice = relationship("Invoice", back_populates="payments")
    refunds = relationship("Refund", back_populates="payment")


class Refund(Base):
    __tablename__ = "refunds"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    refund_number = Column(String(40), unique=True, nullable=False, index=True)
    payment_id = Column(String(36), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    refund_date = Column(Date, nullable=False)
    refund_method = Column(String(50), default="UPI")
    transaction_id = Column(String(100), nullable=True)
    reason = Column(String(255), nullable=True)
    processed_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=ist_now)

    payment = relationship("Payment", back_populates="refunds")


# ==============================================================================
# 9. EXPENSES & CATEGORIES
# ==============================================================================

class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), nullable=True)


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    expense_code = Column(String(40), unique=True, nullable=False, index=True)  # EXP-2026-XXXX
    expense_date = Column(Date, nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)  # Food and groceries, Utilities, Maintenance, etc.
    description = Column(String(255), nullable=False)
    vendor = Column(String(150), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(50), default="Cash")
    receipt_attachment = Column(String(255), nullable=True)
    entered_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=ist_now)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)


# ==============================================================================
# 10. BUSINESS SETTINGS, AUDIT LOGS, NOTIFICATIONS & DELETION LOGS
# ==============================================================================

class BusinessSetting(Base):
    __tablename__ = "business_settings"

    key = Column(String(100), primary_key=True)
    value_json = Column(JSON, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    timestamp = Column(DateTime, default=ist_now, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(50), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    module = Column(String(50), nullable=False, index=True)
    record_id = Column(String(100), nullable=True)
    result = Column(String(20), default="SUCCESS")
    metadata_json = Column(JSON, nullable=True)

    user = relationship("User", back_populates="audit_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info")  # enquiry, booking, payment, alert
    link = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=ist_now, index=True)


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    filename = Column(String(255), nullable=False, unique=True)
    file_path = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    backup_type = Column(String(50), default="FULL_MYSQL")
    status = Column(String(30), default="VERIFIED")
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=ist_now)


class DataDeletionLog(Base):
    __tablename__ = "data_deletion_logs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    performed_by = Column(String(100), nullable=False)
    operation_category = Column(String(50), nullable=False)  # customers, bookings, quotations, invoices, all
    affected_table = Column(String(100), nullable=False)
    affected_count = Column(Integer, default=0, nullable=False)
    backup_id = Column(String(255), nullable=True)
    result = Column(String(30), default="SUCCESS")
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=ist_now)


# ==============================================================================
# 9. ROOMS, ACCOMMODATION & OCCUPANCY
# ==============================================================================

class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    room_number = Column(String(50), unique=True, nullable=False, index=True)  # e.g. "Cottage 1", "Room 101"
    room_name = Column(String(100), nullable=False)
    accommodation_type = Column(String(50), default="Cottage")  # Cottage, Room, Suite, Dormitory
    room_category = Column(String(50), default="Deluxe AC")     # Deluxe AC, Family AC, Dormitory, Standard
    capacity = Column(Integer, default=4, nullable=False)
    number_of_beds = Column(Integer, default=2, nullable=False)
    is_ac = Column(Boolean, default=True, nullable=False)
    base_rate = Column(Numeric(12, 2), default=2500.00, nullable=False)
    extra_guest_charge = Column(Numeric(12, 2), default=800.00, nullable=False)
    cleaning_status = Column(String(50), default="Clean")       # Clean, Dirty, Inspected, Maintenance
    amenities = Column(String(255), default="AC, Attached Bathroom, Double Bed, Hot Water")
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ist_now)

    allocations = relationship("RoomAllocation", back_populates="room", cascade="all, delete-orphan")
    blocks = relationship("RoomBlock", back_populates="room", cascade="all, delete-orphan")


class RoomAllocation(Base):
    __tablename__ = "room_allocations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    check_in_date = Column(Date, nullable=False, index=True)
    check_out_date = Column(Date, nullable=False, index=True)
    allocated_guests = Column(Integer, default=2, nullable=False)
    allocation_status = Column(String(50), default="Allocated")  # Allocated, Checked In, Checked Out, Cancelled
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=ist_now)

    room = relationship("Room", back_populates="allocations")
    booking = relationship("Booking")


class RoomBlock(Base):
    __tablename__ = "room_blocks"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    room_id = Column(String(36), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = Column(String(255), nullable=False)  # Maintenance, Cleaning, Owner Private Use
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    blocked_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=ist_now)

    room = relationship("Room", back_populates="blocks")


# ==============================================================================
# 10. MEALS & KITCHEN OPERATIONS
# ==============================================================================

class Meal(Base):
    __tablename__ = "meals"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    meal_code = Column(String(50), unique=True, nullable=False, index=True)  # MEAL-CHICKEN-CURRY
    name = Column(String(100), nullable=False)
    category = Column(String(50), default="Lunch")  # Breakfast, Lunch, Hi-Tea, Dinner, Extra Meals, Snacks
    dietary_type = Column(String(50), default="Vegetarian")  # Vegetarian, Non-Vegetarian, Jain, All
    price = Column(Numeric(12, 2), default=0.00, nullable=False)
    price_unit = Column(String(30), default="Per Plate")  # Per Plate, Per Person, Per Kg
    is_package_includable = Column(Boolean, default=True, nullable=False)
    serving_time = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ist_now)

    requests = relationship("BookingMealRequest", back_populates="meal")


class BookingMealRequest(Base):
    __tablename__ = "booking_meal_requests"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_id = Column(String(36), ForeignKey("meals.id", ondelete="SET NULL"), nullable=True, index=True)
    meal_name = Column(String(100), nullable=False)
    meal_category = Column(String(50), default="Lunch")
    dietary_type = Column(String(50), default="Vegetarian")
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    is_chargeable = Column(Boolean, default=False, nullable=False)
    preparation_date = Column(Date, nullable=False, index=True)
    preparation_status = Column(String(50), default="Pending")  # Pending, Preparing, Ready, Served, Cancelled
    special_instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=ist_now)

    meal = relationship("Meal", back_populates="requests")
    booking = relationship("Booking")


# ==============================================================================
# 11. ADD-ON SERVICES MASTER & BOOKING ADD-ONS
# ==============================================================================

class Addon(Base):
    __tablename__ = "addons"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    addon_code = Column(String(50), unique=True, nullable=False, index=True)  # ADDON-BONFIRE, ADDON-CAKE
    name = Column(String(100), nullable=False)
    category = Column(String(50), default="Celebration")  # Celebration, Dining, Activities, Logistics
    pricing_type = Column(String(30), default="Fixed")    # Fixed, Per Person, Per Room, Per Unit
    price = Column(Numeric(12, 2), default=500.00, nullable=False)
    description = Column(Text, nullable=True)
    requires_admin_approval = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=ist_now)

    booking_addons = relationship("BookingAddon", back_populates="addon")


class BookingAddon(Base):
    __tablename__ = "booking_addons"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    booking_id = Column(String(36), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=True, index=True)
    enquiry_id = Column(String(36), ForeignKey("booking_enquiries.id", ondelete="SET NULL"), nullable=True, index=True)
    addon_id = Column(String(36), ForeignKey("addons.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    status = Column(String(50), default="REQUESTED")  # REQUESTED, APPROVED, REJECTED, COMPLETED
    approval_remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=ist_now)

    addon = relationship("Addon", back_populates="booking_addons")
    booking = relationship("Booking")


# ==============================================================================
# 12. WEBSITE CONTENT MANAGEMENT (CMS)
# ==============================================================================

class WebsiteContent(Base):
    __tablename__ = "website_content"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    section_key = Column(String(50), unique=True, nullable=False, index=True)  # hero, facilities, dining, faqs, testimonials, seo
    title = Column(String(150), nullable=False)
    content_json = Column(JSON, nullable=False)
    is_published = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=ist_now, onupdate=ist_now)

