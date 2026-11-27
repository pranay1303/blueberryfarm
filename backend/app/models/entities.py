from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRole(str, Enum):
    OWNER_ADMIN = "OWNER_ADMIN"
    MANAGER = "MANAGER"
    RECEPTION_STAFF = "RECEPTION_STAFF"
    ACCOUNTS_STAFF = "ACCOUNTS_STAFF"


class BookingStatus(str, Enum):
    ENQUIRY = "Enquiry"
    QUOTATION_SENT = "Quotation Sent"
    AWAITING_CONFIRMATION = "Awaiting Confirmation"
    CONFIRMED = "Confirmed"
    CHECKED_IN = "Checked In"
    CHECKED_OUT = "Checked Out"
    CANCELLED = "Cancelled"


class PaymentStatus(str, Enum):
    UNPAID = "Unpaid"
    PARTIALLY_PAID = "Partially Paid"
    PAID = "Paid"
    REFUNDED = "Refunded"


class QuotationStatus(str, Enum):
    DRAFT = "Draft"
    SENT = "Sent"
    VIEWED = "Viewed"
    ACCEPTED = "Accepted"
    REJECTED = "Rejected"
    EXPIRED = "Expired"
    CONVERTED = "Converted"


class PaymentMethod(str, Enum):
    CASH = "Cash"
    UPI = "UPI"
    GPAY = "Google Pay"
    BANK_TRANSFER = "Bank Transfer"
    CARD = "Card"
    OTHER = "Other"


class ExpenseCategory(str, Enum):
    FOOD_AND_GROCERIES = "Food and groceries"
    STAFF_SALARIES = "Staff salaries"
    ELECTRICITY = "Electricity"
    WATER = "Water"
    MAINTENANCE = "Maintenance"
    CLEANING = "Cleaning"
    MARKETING = "Marketing"
    TRANSPORTATION = "Transportation"
    REPAIRS = "Repairs"
    SUPPLIES = "Supplies"
    OTHER_EXPENSES = "Other expenses"


# ==========================================
# CUSTOMER MODEL
# ==========================================
class CustomerModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    customer_id: str
    full_name: str
    mobile: str
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    customer_type: str = "Individual"  # Individual, Corporate, Agent, Family
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# PACKAGE MODEL
# ==========================================
class PackageModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    package_id: str
    name: str
    description: str
    category: str = "Stay"  # Stay, Daycation, Event, Camping
    weekday_rate: float
    weekend_rate: float
    adult_price: float
    child_price: float = 1200.0  # ₹1,200 for children 5-10
    infant_price: float = 0.0  # ₹0 for children 1-5
    included_meals: str = "Breakfast, Lunch, High Tea, Dinner"
    room_inclusion: str = "Air-conditioned Room"
    activities: str = "Swimming Pool, Rain Dance, Indoor & Outdoor Games, Farm Walk"
    check_in_policy: str = "12:00 PM"
    check_out_policy: str = "10:00 AM (Next Day)"
    additional_inclusions: Optional[str] = None
    exclusions: Optional[str] = None
    is_active: bool = True
    is_demo: bool = False
    created_at: str
    updated_at: str
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# QUOTATION LINE ITEM
# ==========================================
class QuotationLineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    description: str
    quantity: float = 1.0
    rate: float = 0.0
    unit: str = "person"  # person, room, day, item, fixed
    discount: float = 0.0
    tax_rate: float = 0.0
    amount: float = 0.0  # Computed: (quantity * rate) - discount


# ==========================================
# QUOTATION MODEL
# ==========================================
class QuotationModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    quotation_number: str
    quotation_date: str
    valid_until: str
    customer_id: str
    customer_name: str
    customer_mobile: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None

    # Booking details
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    check_in_date: str
    check_out_date: str
    check_in_time: Optional[str] = "12:00 PM"
    check_out_time: Optional[str] = "10:00 AM"
    adults: int = 1
    children: int = 0
    infants: int = 0
    rooms: int = 1
    dormitory_guests: int = 0
    special_requirements: Optional[str] = None

    # Line items & Financials
    line_items: List[QuotationLineItem] = Field(default_factory=list)
    subtotal: float = 0.0
    discount_total: float = 0.0
    taxable_amount: float = 0.0
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    igst_amount: float = 0.0
    tax_total: float = 0.0
    additional_charges: float = 0.0
    grand_total: float = 0.0
    advance_required: float = 0.0

    terms_and_conditions: Optional[str] = None
    status: QuotationStatus = QuotationStatus.DRAFT
    converted_booking_id: Optional[str] = None
    converted_invoice_id: Optional[str] = None
    created_by: str = "system"
    created_at: str
    updated_at: str
    is_demo: bool = False
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# BOOKING MODEL
# ==========================================
class BookingModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    booking_reference: str
    customer_id: str
    customer_name: str
    contact_number: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    company_name: Optional[str] = None

    booking_date: str
    check_in_date: str
    check_out_date: str
    check_in_time: str = "12:00 PM"
    check_out_time: str = "10:00 AM"

    package_id: Optional[str] = None
    package_name: str = "Custom Stay"
    adults: int = 1
    children: int = 0
    infants: int = 0
    rooms: int = 1
    dormitory_guests: int = 0

    special_requests: Optional[str] = None
    food_requirements: Optional[str] = None
    additional_services: Optional[str] = None
    booking_source: str = "Direct"  # Direct, Phone, Website, Referral, OTA, Agent
    assigned_staff: Optional[str] = None

    booking_status: BookingStatus = BookingStatus.CONFIRMED
    payment_status: PaymentStatus = PaymentStatus.UNPAID

    total_booking_amount: float = 0.0
    advance_paid: float = 0.0
    remaining_balance: float = 0.0

    quotation_id: Optional[str] = None
    invoice_id: Optional[str] = None

    created_by: str = "system"
    created_at: str
    updated_at: str
    is_demo: bool = False
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# INVOICE LINE ITEM
# ==========================================
class InvoiceLineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    description: str
    inclusion_text: Optional[str] = None  # e.g. "Stay includes All Meals including Breakfast, Lunch, HiTea, Dinner."
    quantity: float = 1.0
    rate: float = 0.0
    unit: str = "person"
    discount: float = 0.0
    tax_rate: float = 0.0
    amount: float = 0.0


# ==========================================
# INVOICE MODEL
# ==========================================
class InvoiceModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    invoice_number: str
    invoice_date: str
    document_title: str = "PAID INVOICE"  # PAID INVOICE, INVOICE, PROFORMA INVOICE

    customer_id: str
    customer_name: str
    company_name: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    gstin: Optional[str] = None

    booking_id: Optional[str] = None
    booking_reference: Optional[str] = None
    quotation_id: Optional[str] = None

    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None

    line_items: List[InvoiceLineItem] = Field(default_factory=list)

    subtotal: float = 0.0
    discount_total: float = 0.0
    taxable_amount: float = 0.0
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    igst_amount: float = 0.0
    tax_total: float = 0.0
    additional_charges: float = 0.0
    grand_total: float = 0.0

    advance_paid: float = 0.0
    previous_payments: float = 0.0
    current_payment: float = 0.0
    total_amount_paid: float = 0.0
    balance_due: float = 0.0
    payment_status: PaymentStatus = PaymentStatus.UNPAID

    # Payment details shown on invoice
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    gpay_number: Optional[str] = "8669408484"
    account_name: Optional[str] = "Pranit Dabhade"
    account_number: Optional[str] = "---------------------"
    authorized_signatory: Optional[str] = "Pranit Dabhade"

    notes: Optional[str] = None
    is_finalized: bool = False
    created_by: str = "system"
    created_at: str
    updated_at: str
    is_demo: bool = False
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# PAYMENT RECORD
# ==========================================
class PaymentRecordModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    payment_id: str
    receipt_number: Optional[str] = None
    booking_id: Optional[str] = None
    invoice_id: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    payment_date: str
    amount: float
    payment_type: str = "Payment"  # Advance, Partial, Full, Refund
    payment_method: PaymentMethod = PaymentMethod.UPI
    transaction_id: Optional[str] = None
    payment_reference: Optional[str] = None
    received_by: str = "system"
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    is_demo: bool = False
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# EXPENSE MODEL
# ==========================================
class ExpenseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    expense_id: str
    expense_date: str
    category: ExpenseCategory = ExpenseCategory.OTHER_EXPENSES
    description: str
    vendor: Optional[str] = None
    amount: float
    payment_method: PaymentMethod = PaymentMethod.CASH
    receipt_attachment: Optional[str] = None
    entered_by: str = "system"
    notes: Optional[str] = None
    created_at: str
    updated_at: str
    is_demo: bool = False
    is_archived: bool = False
    archived_at: Optional[str] = None
    archived_by: Optional[str] = None


# ==========================================
# USER RECORD
# ==========================================
class UserModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    username: str
    email: Optional[str] = None
    full_name: str
    role: UserRole = UserRole.RECEPTION_STAFF
    password_hash: str
    is_active: bool = True
    must_change_password: bool = False
    last_login_at: Optional[str] = None
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    is_archived: bool = False

