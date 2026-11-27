from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, model_validator

from app.models.entities import (
    BookingStatus,
    ExpenseCategory,
    PaymentMethod,
    QuotationStatus,
    UserRole,
)


# ==========================================
# AUTH & STAFF
# ==========================================
class SetupOwnerRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=2, max_length=100)
    email: Optional[str] = None
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None


class CreateStaffRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=2, max_length=100)
    email: Optional[str] = None
    role: UserRole
    password: str = Field(min_length=8, max_length=128)
    is_active: bool = True


class UpdateStaffRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# ==========================================
# CUSTOMERS
# ==========================================
class CustomerCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    mobile: str = Field(min_length=7, max_length=20)
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    customer_type: str = "Individual"
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    mobile: Optional[str] = Field(default=None, min_length=7, max_length=20)
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    customer_type: Optional[str] = None
    notes: Optional[str] = None


# ==========================================
# PACKAGES
# ==========================================
class PackageCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str = Field(min_length=2, max_length=1000)
    category: str = "Stay"
    weekday_rate: float = Field(ge=0)
    weekend_rate: float = Field(ge=0)
    adult_price: float = Field(ge=0)
    child_price: float = Field(ge=0, default=1200.0)
    infant_price: float = Field(ge=0, default=0.0)
    included_meals: str = ""
    room_inclusion: str = ""
    activities: str = ""
    check_in_policy: str = "12:00 PM"
    check_out_policy: str = "10:00 AM"
    additional_inclusions: Optional[str] = None
    exclusions: Optional[str] = None
    is_active: bool = True


class PackageUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    description: Optional[str] = None
    category: Optional[str] = None
    weekday_rate: Optional[float] = Field(default=None, ge=0)
    weekend_rate: Optional[float] = Field(default=None, ge=0)
    adult_price: Optional[float] = Field(default=None, ge=0)
    child_price: Optional[float] = Field(default=None, ge=0)
    infant_price: Optional[float] = Field(default=None, ge=0)
    included_meals: Optional[str] = None
    room_inclusion: Optional[str] = None
    activities: Optional[str] = None
    check_in_policy: Optional[str] = None
    check_out_policy: Optional[str] = None
    additional_inclusions: Optional[str] = None
    exclusions: Optional[str] = None
    is_active: Optional[bool] = None


class PackageQuoteRequest(BaseModel):
    package_id: str
    check_in_date: str
    check_out_date: str
    adults: int = Field(ge=0, default=1)
    children: int = Field(ge=0, default=0)
    infants: int = Field(ge=0, default=0)
    special_dates: List[str] = Field(default_factory=list)


# ==========================================
# LINE ITEM INPUT
# ==========================================
class LineItemInput(BaseModel):
    id: Optional[str] = None
    description: str = Field(min_length=1, max_length=500)
    inclusion_text: Optional[str] = None
    quantity: float = Field(ge=0, default=1.0)
    rate: float = Field(ge=0, default=0.0)
    unit: str = "person"
    discount: float = Field(ge=0, default=0.0)
    tax_rate: float = Field(ge=0, default=0.0)


# ==========================================
# BOOKINGS
# ==========================================
class BookingCreate(BaseModel):
    customer_id: str
    booking_date: Optional[str] = None
    check_in_date: str
    check_out_date: str
    check_in_time: str = "12:00 PM"
    check_out_time: str = "10:00 AM"
    package_id: Optional[str] = None
    package_name: str = "Custom Stay"
    adults: int = Field(ge=0, default=1)
    children: int = Field(ge=0, default=0)
    infants: int = Field(ge=0, default=0)
    rooms: int = Field(ge=0, default=1)
    dormitory_guests: int = Field(ge=0, default=0)
    special_requests: Optional[str] = None
    food_requirements: Optional[str] = None
    additional_services: Optional[str] = None
    booking_source: str = "Direct"
    assigned_staff: Optional[str] = None
    booking_status: BookingStatus = BookingStatus.CONFIRMED
    total_booking_amount: float = Field(ge=0, default=0.0)


class BookingUpdate(BaseModel):
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    adults: Optional[int] = Field(default=None, ge=0)
    children: Optional[int] = Field(default=None, ge=0)
    infants: Optional[int] = Field(default=None, ge=0)
    rooms: Optional[int] = Field(default=None, ge=0)
    dormitory_guests: Optional[int] = Field(default=None, ge=0)
    special_requests: Optional[str] = None
    food_requirements: Optional[str] = None
    additional_services: Optional[str] = None
    booking_source: Optional[str] = None
    assigned_staff: Optional[str] = None
    booking_status: Optional[BookingStatus] = None
    total_booking_amount: Optional[float] = Field(default=None, ge=0)


# ==========================================
# QUOTATIONS
# ==========================================
class QuotationCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_address: Optional[str] = None
    customer_gstin: Optional[str] = None
    booking_id: Optional[str] = None
    quotation_date: Optional[str] = None
    valid_until: Optional[str] = None
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    check_in_date: str
    check_out_date: str
    check_in_time: Optional[str] = "12:00 PM"
    check_out_time: Optional[str] = "10:00 AM"
    adults: int = Field(ge=0, default=1)
    children: int = Field(ge=0, default=0)
    infants: int = Field(ge=0, default=0)
    rooms: int = Field(ge=0, default=1)
    dormitory_guests: int = Field(ge=0, default=0)
    special_requirements: Optional[str] = None
    line_items: List[LineItemInput] = Field(min_length=1)
    discount_amount: float = Field(ge=0, default=0.0)
    discount_percentage: float = Field(ge=0, default=0.0)
    additional_charges: float = Field(ge=0, default=0.0)
    apply_gst: Optional[bool] = None
    interstate: bool = False
    advance_required: float = Field(ge=0, default=0.0)
    terms_and_conditions: Optional[str] = None
    notes: Optional[str] = None
    status: QuotationStatus = QuotationStatus.DRAFT


class QuotationCalculateRequest(BaseModel):
    customer_id: Optional[str] = None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    line_items: List[LineItemInput] = Field(default_factory=list)
    additional_charges: float = Field(ge=0, default=0.0)
    apply_gst: Optional[bool] = None


class QuotationUpdate(BaseModel):
    valid_until: Optional[str] = None
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    adults: Optional[int] = Field(default=None, ge=0)
    children: Optional[int] = Field(default=None, ge=0)
    infants: Optional[int] = Field(default=None, ge=0)
    rooms: Optional[int] = Field(default=None, ge=0)
    dormitory_guests: Optional[int] = Field(default=None, ge=0)
    special_requirements: Optional[str] = None
    line_items: Optional[List[LineItemInput]] = None
    discount_amount: Optional[float] = Field(default=None, ge=0)
    discount_percentage: Optional[float] = Field(default=None, ge=0)
    additional_charges: Optional[float] = Field(default=None, ge=0)
    apply_gst: Optional[bool] = None
    interstate: Optional[bool] = None
    advance_required: Optional[float] = Field(default=None, ge=0)
    terms_and_conditions: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[QuotationStatus] = None


# ==========================================
# INVOICES
# ==========================================
class InvoiceCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_mobile: Optional[str] = Field(default=None, max_length=20)
    customer_address: Optional[str] = Field(default=None, max_length=400)
    customer_gstin: Optional[str] = Field(default=None, max_length=20)
    booking_id: Optional[str] = None
    booking_reference: Optional[str] = None
    quotation_id: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    document_title: Optional[str] = None  # Auto-determined if None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    line_items: List[LineItemInput] = Field(min_length=1)
    discount_amount: float = Field(ge=0, default=0.0)
    discount_percentage: float = Field(ge=0, default=0.0)
    additional_charges: float = Field(ge=0, default=0.0)
    apply_gst: Optional[bool] = None
    interstate: bool = False
    initial_payment_amount: float = Field(ge=0, default=0.0)
    initial_payment_method: PaymentMethod = PaymentMethod.UPI
    initial_payment_reference: Optional[str] = None
    transaction_id: Optional[str] = None
    notes: Optional[str] = None
    finalize: bool = True

    @model_validator(mode="after")
    def _ensure_customer_ref(self) -> "InvoiceCreate":
        if not (self.customer_id and self.customer_id.strip()) and not (self.customer_name and self.customer_name.strip()):
            raise ValueError("Either an existing customer_id or customer_name must be provided.")
        return self


class InvoiceAdjustmentRequest(BaseModel):
    adjustment_type: str = Field(pattern="^(Credit Note|Correction|Cancellation)$")
    reason: str = Field(min_length=3, max_length=500)
    amount: float = Field(ge=0)


# ==========================================
# PAYMENTS
# ==========================================
class PaymentCreate(BaseModel):
    customer_id: str
    booking_id: Optional[str] = None
    invoice_id: Optional[str] = None
    payment_date: Optional[str] = None
    amount: float = Field(gt=0)
    payment_type: str = Field(default="Payment", pattern="^(Advance|Partial|Full|Payment|Refund)$")
    payment_method: PaymentMethod = PaymentMethod.UPI
    transaction_id: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


# ==========================================
# EXPENSES
# ==========================================
class ExpenseCreate(BaseModel):
    expense_date: Optional[str] = None
    category: ExpenseCategory = ExpenseCategory.OTHER_EXPENSES
    description: str = Field(min_length=2, max_length=400)
    vendor: Optional[str] = None
    amount: float = Field(gt=0)
    payment_method: PaymentMethod = PaymentMethod.CASH
    notes: Optional[str] = None


class ExpenseUpdate(BaseModel):
    expense_date: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    description: Optional[str] = Field(default=None, min_length=2, max_length=400)
    vendor: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    payment_method: Optional[PaymentMethod] = None
    notes: Optional[str] = None


# ==========================================
# SETTINGS
# ==========================================
class SettingsUpdateRequest(BaseModel):
    business_name: Optional[str] = None
    address_line: Optional[str] = None
    full_address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    payment_info: Optional[Dict[str, Any]] = None
    gst: Optional[Dict[str, Any]] = None
    documents: Optional[Dict[str, Any]] = None
    backup: Optional[Dict[str, Any]] = None
    meal_addons: Optional[List[Dict[str, Any]]] = None

