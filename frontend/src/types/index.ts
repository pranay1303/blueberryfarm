export type UserRole = 'OWNER_ADMIN' | 'MANAGER' | 'RECEPTION_STAFF' | 'ACCOUNTS_STAFF';

export interface User {
  id: string;
  username: string;
  email?: string | null;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  permissions: string[];
}

export interface Customer {
  id: string;
  customer_id: string;
  full_name: string;
  mobile: string;
  whatsapp_number?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  company_name?: string | null;
  gstin?: string | null;
  customer_type: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  bookings_count?: number;
  total_paid?: number;
  outstanding_balance?: number;
}

export interface PackageItem {
  id: string;
  package_id: string;
  name: string;
  description: string;
  category: string;
  weekday_rate: number;
  weekend_rate: number;
  adult_price: number;
  child_price: number;
  infant_price: number;
  included_meals: string;
  room_inclusion: string;
  activities: string;
  check_in_policy: string;
  check_out_policy: string;
  additional_inclusions?: string | null;
  exclusions?: string | null;
  is_active: boolean;
}

export interface Booking {
  id: string;
  booking_reference: string;
  customer_id: string;
  customer_name: string;
  contact_number: string;
  customer_email?: string | null;
  customer_address?: string | null;
  company_name?: string | null;
  booking_date: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  package_id?: string | null;
  package_name: string;
  adults: number;
  children: number;
  infants: number;
  rooms: number;
  dormitory_guests: number;
  special_requests?: string | null;
  food_requirements?: string | null;
  additional_services?: string | null;
  booking_source: string;
  assigned_staff?: string | null;
  booking_status: string;
  payment_status: string;
  total_booking_amount: number;
  advance_paid: number;
  remaining_balance: number;
  quotation_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface LineItem {
  id?: string;
  description: string;
  inclusion_text?: string | null;
  quantity: number;
  rate: number;
  unit: string;
  discount: number;
  tax_rate: number;
  amount?: number;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  quotation_date: string;
  valid_until: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string | null;
  customer_address?: string | null;
  company_name?: string | null;
  package_id?: string | null;
  package_name?: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time?: string;
  check_out_time?: string;
  adults: number;
  children: number;
  infants: number;
  rooms: number;
  dormitory_guests: number;
  special_requirements?: string | null;
  line_items: LineItem[];
  subtotal: number;
  discount_total: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_total: number;
  additional_charges: number;
  grand_total: number;
  advance_required: number;
  terms_and_conditions?: string | null;
  status: string;
  converted_booking_id?: string | null;
  booking_id?: string | null;
  booking_reference?: string | null;
  converted_invoice_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  document_title: string;
  customer_id: string;
  customer_name: string;
  company_name?: string | null;
  address?: string | null;
  contact_number?: string | null;
  gstin?: string | null;
  booking_id?: string | null;
  booking_reference?: string | null;
  quotation_id?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  line_items: LineItem[];
  subtotal: number;
  discount_total: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_total: number;
  additional_charges: number;
  grand_total: number;
  advance_paid: number;
  previous_payments: number;
  current_payment: number;
  total_amount_paid: number;
  balance_due: number;
  payment_status: string;
  payment_method?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
  adjustments?: Array<{
    id: string;
    type: string;
    reason: string;
    amount: number;
    created_by: string;
    created_at: string;
  }>;
  is_finalized: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export interface PaymentRecord {
  id: string;
  payment_id: string;
  receipt_number?: string | null;
  booking_id?: string | null;
  invoice_id?: string | null;
  customer_id: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  payment_date: string;
  amount: number;
  payment_type: string;
  payment_method: string;
  transaction_id?: string | null;
  payment_reference?: string | null;
  received_by: string;
  notes?: string | null;
  created_at: string;
  is_demo?: boolean;
}

export interface ExpenseRecord {
  id: string;
  expense_id: string;
  expense_date: string;
  category: string;
  description: string;
  vendor?: string | null;
  amount: number;
  payment_method: string;
  receipt_attachment?: string | null;
  has_receipt?: boolean;
  entered_by: string;
  notes?: string | null;
  created_at: string;
  is_demo?: boolean;
}

export interface MealAddonPreset {
  name: string;
  rate: number;
  unit: string;
}

export interface ResortSettings {
  business_name: string;
  address_line: string;
  full_address: string;
  phone: string;
  website: string;
  email: string;
  payment_info: {
    gpay_number: string;
    upi_id: string;
    account_name: string;
    account_number: string;
    bank_name: string;
    ifsc_code: string;
  };
  gst: {
    enabled: boolean;
    gstin: string;
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    tax_inclusive: boolean;
    configured_by_owner: boolean;
  };
  documents: {
    quotation_prefix: string;
    invoice_prefix: string;
    booking_prefix: string;
    receipt_prefix: string;
    quotation_validity_days: number;
    default_terms: string;
    authorized_signatory_name: string;
    has_signature_image?: boolean;
  };
  backup: {
    auto_backup_enabled: boolean;
    frequency: string;
    retention_count: number;
  };
  meal_addons?: MealAddonPreset[];
}

export interface Vehicle {
  id: string;
  vehicle_type: string;
  registration_number: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_mobile?: string | null;
  enquiry_id?: string | null;
  booking_id?: string | null;
  arrival_status?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface BookingEnquiry {
  id: string;
  enquiry_reference: string;
  customer_id?: string;
  customer_code?: string | null;
  guest_name?: string;
  guest_mobile?: string;
  guest_email?: string;
  guest_address?: string;
  guest_city?: string;
  package_name?: string;
  customer?: {
    id: string;
    customer_code?: string;
    full_name: string;
    mobile: string;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pin_code?: string | null;
  } | null;
  package?: {
    id: string;
    name: string;
    weekday_rate: number;
    weekend_rate: number;
  } | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time?: string;
  check_out_time?: string;
  adults: number;
  children: number;
  infants: number;
  total_guests: number;
  number_of_rooms?: number;
  dormitory_guests?: number;
  vehicles?: {
    id?: string;
    type?: string;
    vehicle_type?: string;
    registration_number: string;
    notes?: string;
  }[];
  occasion?: string | null;
  food_preferences?: string | null;
  special_requirements?: string | null;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUESTED' | string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_remarks?: string | null;
  booking_reference?: string | null;
  created_at?: string | null;
}

export interface PublicEnquiryPayload {
  full_name: string;
  mobile: string;
  email?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  company_name?: string;
  gstin?: string;
  check_in_date: string;
  check_in_time?: string;
  check_out_date: string;
  check_out_time?: string;
  package_id?: string;
  adults: number;
  children: number;
  infants: number;
  number_of_rooms?: number;
  dormitory_guests?: number;
  vehicle_count?: number;
  vehicles?: {
    vehicle_type: string;
    registration_number: string;
    notes?: string;
  }[];
  occasion?: string;
  food_preferences?: string;
  special_requirements?: string;
  website_url_hp?: string;
}

