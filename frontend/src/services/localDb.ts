import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  generateInvoicePdfBlob,
  generateQuotationPdfBlob,
  generateReceiptPdfBlob,
  generateReportPdfBlob,
} from './pdfGenerator';

const STORAGE_KEY = 'blueberry_farm_local_db_v1';
const SESSION_KEY = 'blueberry_farm_local_session_v1';

interface LocalState {
  owner_setup_done: boolean;
  users: any[];
  settings: any;
  packages: any[];
  customers: any[];
  bookings: any[];
  enquiries: any[];
  quotations: any[];
  invoices: any[];
  payments: any[];
  expenses: any[];
  vehicles: any[];
  rooms: any[];
  meals: any[];
  addons: any[];
  notifications: any[];
  backups: Array<{
    id: string;
    filename: string;
    size_bytes: number;
    sha256: string;
    created_by: string;
    created_at: string;
    modified_ts: number;
    snapshot: string;
  }>;
  audit_logs: any[];
}

function nowISO(): string {
  return new Date().toISOString();
}

function todayLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function uid(): string {
  return 'id-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function rand4(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

function createDefaultState(): LocalState {
  const yr = new Date().getFullYear();
  const now = nowISO();
  return {
    owner_setup_done: true,
    users: [
      {
        id: 'owner-admin-1',
        username: 'admin',
        password_plain: 'Admin@123',
        full_name: 'Pranit Dabhade',
        email: 'info@blueberryfarmandresort.com',
        role: 'OWNER_ADMIN',
        is_active: true,
        permissions: [
          'dashboard:view',
          'enquiries:read',
          'enquiries:write',
          'bookings:read',
          'bookings:write',
          'bookings:cancel',
          'customers:read',
          'customers:write',
          'packages:read',
          'packages:write',
          'quotations:read',
          'quotations:write',
          'invoices:read',
          'invoices:write',
          'payments:read',
          'payments:write',
          'expenses:read',
          'expenses:write',
          'vehicles:read',
          'vehicles:write',
          'reports:view',
          'settings:manage',
        ],
      },
    ],
    settings: {
      business_name: 'Blueberry Farm and Resort',
      tagline: 'Nature Stay, Farm & Events Resort Karjat',
      address_line: 'At. Post - Mandawane, Tal - Karjat, Dist - Raigad, Maharashtra',
      phone: '8669408484',
      website: 'blueberryfarmandresort.com',
      email: 'info@blueberryfarmandresort.com',
      payment_info: {
        bank_name: 'State Bank of India',
        account_name: 'Blueberry Farm and Resort',
        account_number: '',
        ifsc_code: '',
        upi_id: '8669408484@ybl',
        gpay_number: '8669408484',
      },
      gst: {
        enabled: false,
        gstin: '',
        cgst_rate: 6,
        sgst_rate: 6,
        igst_rate: 12,
      },
      documents: {
        has_signature_image: true,
        signature_data_url: '',
        invoice_title: 'TAX INVOICE',
      },
      meal_addons: [
        { name: 'Barbeque Starter (Veg/Non-Veg)', rate: 350, unit: 'person' },
        { name: 'Birthday Cake & Decor Setup', rate: 1500, unit: 'setup' },
        { name: 'Bonfire & Acoustic Night', rate: 1200, unit: 'night' },
        { name: 'Extra Chicken / Mutton Thali', rate: 450, unit: 'plate' },
      ],
    },
    packages: [
      {
        id: 'pkg-24hr',
        package_code: 'PKG-24HR-STAY',
        name: '24-Hour Staycation Package',
        category: 'Stay',
        weekday_rate: 2500,
        weekend_rate: 2800,
        child_price: 1250,
        infant_price: 0,
        min_guests: 2,
        max_guests: 50,
        description: '24-hour AC room/villa stay with Breakfast, Lunch, Hi-Tea, Dinner & Pool Access.',
        inclusions: ['AC Rooms', 'Swimming Pool', 'All 4 Meals', 'Indoor & Outdoor Games', 'Rain Dance'],
        is_active: true,
        created_at: now,
      },
      {
        id: 'pkg-1day',
        package_code: 'PKG-1DAY-PICNIC',
        name: '1-Day Picnic Package',
        category: 'Day Outing',
        weekday_rate: 1200,
        weekend_rate: 1400,
        child_price: 700,
        infant_price: 0,
        min_guests: 4,
        max_guests: 80,
        description: 'Day outing (9 AM to 6 PM) with Breakfast, Lunch, Hi-Tea & Swimming Pool.',
        inclusions: ['Swimming Pool', 'Breakfast, Lunch & Hi-Tea', 'Rain Dance', 'Lawn Access'],
        is_active: true,
        created_at: now,
      },
      {
        id: 'pkg-group',
        package_code: 'PKG-GROUP-EVENT',
        name: 'Group & Corporate Event Package',
        category: 'Events',
        weekday_rate: 2200,
        weekend_rate: 2500,
        child_price: 1100,
        infant_price: 0,
        min_guests: 20,
        max_guests: 120,
        description: 'Exclusive farmhouse booking for family reunions, corporate offsites & celebrations.',
        inclusions: ['Entire Property Access', 'All Meals & BBQ', 'Sound System', 'Bonfire'],
        is_active: true,
        created_at: now,
      },
    ],
    customers: [],
    bookings: [],
    enquiries: [],
    quotations: [],
    invoices: [],
    payments: [],
    expenses: [],
    vehicles: [],
    rooms: [
      { id: 'rm-101', room_number: '101', room_name: 'Blueberry Villa Suite 1', room_type: 'Villa Suite', capacity: 4, is_ac: true, cleaning_status: 'Clean', is_active: true, amenities: 'AC, Attached Bath, Pool View' },
      { id: 'rm-102', room_number: '102', room_name: 'Blueberry Villa Suite 2', room_type: 'Villa Suite', capacity: 4, is_ac: true, cleaning_status: 'Clean', is_active: true, amenities: 'AC, Attached Bath, Garden View' },
      { id: 'rm-103', room_number: '103', room_name: 'Family Cottage', room_type: 'Cottage', capacity: 6, is_ac: true, cleaning_status: 'Clean', is_active: true, amenities: 'AC, Balcony, Family Beds' },
      { id: 'rm-201', room_number: '201', room_name: 'Group Dormitory Hall', room_type: 'Dormitory', capacity: 16, is_ac: true, cleaning_status: 'Clean', is_active: true, amenities: 'AC, 16 Beds, 3 Washrooms' },
    ],
    meals: [
      { id: 'ml-1', meal_code: 'MEAL-BF', name: 'Maharashtrian Breakfast', meal_type: 'Breakfast', diet_type: 'Veg', price: 200, is_included: true, is_active: true },
      { id: 'ml-2', meal_code: 'MEAL-LN', name: 'Farmhouse Lunch (Veg / Non-Veg)', meal_type: 'Lunch', diet_type: 'Both', price: 450, is_included: true, is_active: true },
      { id: 'ml-3', meal_code: 'MEAL-DN', name: 'Dinner Buffet & Sweet', meal_type: 'Dinner', diet_type: 'Both', price: 450, is_included: true, is_active: true },
    ],
    addons: [
      { id: 'add-1', addon_code: 'ADD-BBQ', name: 'Live Barbeque Setup', category: 'Food', pricing_type: 'PER_PERSON', price: 350, is_public: true, is_active: true, description: 'Charcoal grill with veg & chicken marinades' },
      { id: 'add-2', addon_code: 'ADD-DECOR', name: 'Birthday / Anniversary Decor', category: 'Celebration', pricing_type: 'FIXED', price: 2000, is_public: true, is_active: true, description: 'Balloons, LED backdrop & cake table setup' },
    ],
    notifications: [
      {
        id: 'notif-welcome',
        title: `Blueberry Farm Admin Ready (${yr})`,
        message: 'All data is saved locally in your browser. Use Storage & Backups to export JSON backups anytime.',
        type: 'system',
        link: '/admin/settings',
        is_read: false,
        created_at: now,
      },
    ],
    backups: [],
    audit_logs: [],
  };
}

export function loadLocalState(): LocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const init = createDefaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
      return init;
    }
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    const defaults = createDefaultState();
    return {
      ...defaults,
      ...parsed,
      settings: {
        ...defaults.settings,
        ...(parsed.settings || {}),
        payment_info: {
          ...defaults.settings.payment_info,
          ...(parsed.settings?.payment_info || {}),
        },
        gst: {
          ...defaults.settings.gst,
          ...(parsed.settings?.gst || {}),
        },
        documents: {
          ...defaults.settings.documents,
          ...(parsed.settings?.documents || {}),
        },
      },
    };
  } catch {
    const init = createDefaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }
}

export function saveLocalState(state: LocalState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportFullJsonBackup(): { filename: string; content: string } {
  const state = loadLocalState();
  const payload = {
    app: 'Blueberry Farm and Resort',
    exported_at: nowISO(),
    version: '2.0-local',
    data: { ...state, backups: [] },
  };
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  return {
    filename: `blueberry_backup_${ts}.json`,
    content: JSON.stringify(payload, null, 2),
  };
}

export function importFullJsonBackup(jsonText: string): void {
  const parsed = JSON.parse(jsonText);
  const incoming = parsed?.data ? parsed.data : parsed;
  if (!incoming || typeof incoming !== 'object' || !incoming.settings) {
    throw new Error('Invalid Blueberry Farm JSON backup file.');
  }
  const current = loadLocalState();
  const merged: LocalState = {
    ...createDefaultState(),
    ...incoming,
    backups: current.backups,
  };
  saveLocalState(merged);
}

function makeError(status: number, detail: string, config: InternalAxiosRequestConfig): any {
  const err: any = new Error(detail);
  err.isAxiosError = true;
  err.config = config;
  err.response = { status, statusText: 'Error', data: { detail }, headers: {}, config };
  return err;
}

function ok(data: any, config: InternalAxiosRequestConfig, status = 200): AxiosResponse {
  return { data, status, statusText: 'OK', headers: {}, config };
}

function parseBody(data: any): any {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return data;
}

function resolveOrCreateCustomer(state: LocalState, body: any, source: string): any {
  let cust = null;
  if (body.customer_id) {
    cust = state.customers.find((c) => c.id === body.customer_id || c.customer_code === body.customer_id);
  }
  const name = String(body.customer_name || body.full_name || '').trim();
  const mob = String(body.customer_mobile || body.mobile || '').replace(/\D/g, '').slice(-10);
  if (!cust && mob) {
    cust = state.customers.find((c) => c.mobile === mob);
  }
  if (!cust && name) {
    cust = {
      id: uid(),
      customer_code: `CUST-${rand4()}`,
      full_name: name,
      mobile: mob || 'N/A',
      whatsapp_number: mob || '',
      email: body.customer_email || '',
      address: body.customer_address || '',
      city: body.city || '',
      state: 'Maharashtra',
      pin_code: '',
      company_name: body.company_name || '',
      gstin: (body.customer_gstin || '').toUpperCase(),
      notes: '',
      customer_source: source,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.customers.unshift(cust);
  }
  return cust;
}

function computeLineItems(rawItems: any[]): { items: any[]; subtotal: number; discountTotal: number } {
  let subtotal = 0;
  let discountTotal = 0;
  const items = (rawItems || []).map((it) => {
    const qty = Number(it.quantity || 1);
    const rate = Number(it.rate || 0);
    const disc = Number(it.discount || 0);
    const amt = Math.max(0, qty * rate - disc);
    subtotal += qty * rate;
    discountTotal += disc;
    return {
      id: it.id || uid(),
      description: it.description || 'Item',
      inclusion_text: it.inclusion_text || '',
      quantity: qty,
      rate,
      unit: it.unit || 'person',
      discount: disc,
      tax_rate: Number(it.tax_rate || 0),
      amount: amt,
    };
  });
  return { items, subtotal, discountTotal };
}

function parseQuery(url: string, params?: Record<string, any>): { path: string; q: Record<string, string> } {
  const [rawPath, qs] = url.split('?');
  const path = rawPath.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const q: Record<string, string> = {};
  if (qs) {
    const sp = new URLSearchParams(qs);
    sp.forEach((v, k) => {
      q[k] = v;
    });
  }
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q[k] = String(v);
    });
  }
  return { path, q };
}

function buildReportData(state: LocalState, reportType: string): any {
  const titleMap: Record<string, string> = {
    daily_collection: 'Daily Collection Report',
    monthly_collection: 'Monthly Collection Report',
    bookings: 'Booking Report',
    quotations: 'Quotation Report',
    invoices: 'Invoice Report',
    outstanding_balances: 'Outstanding Balance Report',
    expenses: 'Expense Report',
    profit_and_loss: 'Profit and Loss Summary',
    customers: 'Customer Report',
    package_performance: 'Package Performance Report',
  };
  const title = titleMap[reportType] || 'Resort Report';

  if (reportType === 'bookings') {
    return {
      report_type: reportType,
      title,
      columns: ['Ref', 'Guest', 'Check-in', 'Check-out', 'Status', 'Payment', 'Total', 'Due'],
      rows: state.bookings.map((b) => [
        b.booking_reference,
        b.customer_name,
        b.check_in_date,
        b.check_out_date,
        b.booking_status,
        b.payment_status,
        b.total_booking_amount,
        b.balance_due,
      ]),
      summary: {
        total_bookings: state.bookings.length,
        total_value: state.bookings.reduce((s, b) => s + Number(b.total_booking_amount || 0), 0),
      },
    };
  }
  if (reportType === 'invoices' || reportType === 'outstanding_balances') {
    const list =
      reportType === 'outstanding_balances'
        ? state.invoices.filter((i) => Number(i.balance_due) > 0 && i.payment_status !== 'Cancelled')
        : state.invoices;
    return {
      report_type: reportType,
      title,
      columns: ['Invoice No', 'Date', 'Guest', 'Total', 'Paid', 'Balance', 'Status'],
      rows: list.map((i) => [
        i.invoice_number,
        i.invoice_date,
        i.customer_name,
        i.grand_total,
        i.total_amount_paid,
        i.balance_due,
        i.payment_status,
      ]),
      summary: {
        count: list.length,
        total_invoiced: list.reduce((s, i) => s + Number(i.grand_total || 0), 0),
        total_due: list.reduce((s, i) => s + Number(i.balance_due || 0), 0),
      },
    };
  }
  if (reportType === 'expenses') {
    return {
      report_type: reportType,
      title,
      columns: ['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount'],
      rows: state.expenses.map((e) => [e.expense_date, e.category, e.description, e.vendor || '-', e.payment_method, e.amount]),
      summary: {
        count: state.expenses.length,
        total_expenses: state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
      },
    };
  }
  if (reportType === 'quotations') {
    return {
      report_type: reportType,
      title,
      columns: ['Quote No', 'Date', 'Guest', 'Check-in', 'Total', 'Status'],
      rows: state.quotations.map((q) => [q.quotation_number, q.quotation_date, q.customer_name, q.check_in_date, q.grand_total, q.status]),
      summary: { count: state.quotations.length },
    };
  }
  if (reportType === 'customers') {
    return {
      report_type: reportType,
      title,
      columns: ['Code', 'Name', 'Mobile', 'City', 'Source'],
      rows: state.customers.map((c) => [c.customer_code, c.full_name, c.mobile, c.city || '-', c.customer_source || '-']),
      summary: { total_customers: state.customers.length },
    };
  }
  // Default / Collection / P&L
  const totalIn = state.payments
    .filter((p) => (p.payment_type || '').toLowerCase() !== 'refund')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalOut = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  return {
    report_type: reportType,
    title,
    columns: ['Date', 'Receipt', 'Guest', 'Type', 'Method', 'Amount'],
    rows: state.payments.map((p) => [p.payment_date, p.receipt_number, p.customer_name, p.payment_type, p.payment_method, p.amount]),
    summary: {
      total_collected: totalIn,
      total_expenses: totalOut,
      net_profit: totalIn - totalOut,
    },
  };
}

export const localStorageAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const method = (config.method || 'get').toUpperCase();
  const { path, q } = parseQuery(config.url || '/', config.params);
  const body = parseBody(config.data);
  const state = loadLocalState();

  const getSessionUser = () => {
    try {
      const sid = localStorage.getItem(SESSION_KEY);
      if (!sid) return null;
      return state.users.find((u) => u.id === sid) || null;
    } catch {
      return null;
    }
  };

  // ---------------- HEALTH ----------------
  if (path === '/health') {
    return ok({ status: 'ok', app: state.settings.business_name, storage: 'localStorage' }, config);
  }

  // ---------------- AUTH ----------------
  if (path === '/auth/setup-status') {
    return ok({ setup_required: !state.owner_setup_done, initialized: state.owner_setup_done }, config);
  }

  if (path === '/auth/setup-owner' && method === 'POST') {
    const owner = {
      ...state.users[0],
      username: (body.username || 'admin').trim(),
      full_name: (body.full_name || 'Pranit Dabhade').trim(),
      email: (body.email || state.settings.email).trim(),
      password_plain: body.password || 'Admin@123',
    };
    state.users = [owner];
    state.owner_setup_done = true;
    saveLocalState(state);
    localStorage.setItem(SESSION_KEY, owner.id);
    return ok({ user: owner, access_token: 'local-token-' + owner.id }, config, 201);
  }

  if (path === '/auth/login' && method === 'POST') {
    const uname = String(body.username || '').trim().toLowerCase();
    const pwd = String(body.password || '');
    const user = state.users.find(
      (u) => (u.username.toLowerCase() === uname || (u.email || '').toLowerCase() === uname) && u.is_active
    );
    if (!user || (user.password_plain && user.password_plain !== pwd)) {
      throw makeError(401, 'Invalid username or password. Default is admin / Admin@123', config);
    }
    localStorage.setItem(SESSION_KEY, user.id);
    return ok({ user, access_token: 'local-token-' + user.id }, config);
  }

  if (path === '/auth/logout' && method === 'POST') {
    localStorage.removeItem(SESSION_KEY);
    return ok({ message: 'Logged out.' }, config);
  }

  if (path === '/auth/refresh' && method === 'POST') {
    const user = getSessionUser();
    if (!user) throw makeError(401, 'Not authenticated.', config);
    return ok({ user, access_token: 'local-token-' + user.id }, config);
  }

  if (path === '/auth/me') {
    const user = getSessionUser();
    if (!user) throw makeError(401, 'Not authenticated.', config);
    return ok({ user }, config);
  }

  // ---------------- DASHBOARD & SEARCH ----------------
  if (path === '/dashboard' && method === 'GET') {
    const today = todayLocalISO();
    const activeBookings = state.bookings.filter((b) => b.booking_status !== 'Cancelled');
    const activeInvoices = state.invoices.filter((i) => i.payment_status !== 'Cancelled');
    const totalInvoiced = activeInvoices.reduce((s, i) => s + Number(i.grand_total || 0), 0);
    const totalCollected = activeInvoices.reduce((s, i) => s + Number(i.total_amount_paid || 0), 0);
    const pendingBalances = activeInvoices.reduce((s, i) => s + Number(i.balance_due || 0), 0);
    const totalExpenses = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const upcomingCheckins = activeBookings
      .filter((b) => b.check_in_date >= today && b.booking_status !== 'Checked Out')
      .slice(0, 6);
    const upcomingCheckouts = activeBookings
      .filter((b) => b.check_out_date >= today && b.booking_status === 'Checked In')
      .slice(0, 6);

    const expenseBreakdown = Object.entries(
      state.expenses.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
        return acc;
      }, {})
    ).map(([category, amount]) => ({ category, amount }));

    const paymentDist = [
      { name: 'Paid', value: activeInvoices.filter((i) => i.payment_status === 'Paid').length },
      { name: 'Partially Paid', value: activeInvoices.filter((i) => i.payment_status === 'Partially Paid').length },
      { name: 'Unpaid', value: activeInvoices.filter((i) => i.payment_status === 'Unpaid').length },
    ].filter((x) => x.value > 0);

    const recentActivity = [
      ...activeBookings.slice(0, 4).map((b) => ({
        type: 'booking',
        title: `Booking ${b.booking_reference} — ${b.customer_name}`,
        subtitle: `${b.check_in_date} to ${b.check_out_date} • ${b.booking_status}`,
        amount: Number(b.total_booking_amount || 0),
        timestamp: b.created_at || nowISO(),
      })),
      ...activeInvoices.slice(0, 4).map((i) => ({
        type: 'invoice',
        title: `Invoice ${i.invoice_number} — ${i.customer_name}`,
        subtitle: `${i.payment_status} • Due Rs. ${Number(i.balance_due || 0)}`,
        amount: Number(i.grand_total || 0),
        timestamp: i.created_at || nowISO(),
      })),
    ].slice(0, 6);

    const insights: string[] = [];
    if (activeBookings.length === 0) {
      insights.push('Welcome to Blueberry Farm Admin! Create your first Quotation, Booking, or Invoice to see live insights here.');
    } else {
      insights.push(`${activeBookings.length} active booking(s) recorded with ₹${totalCollected.toLocaleString('en-IN')} collected.`);
      if (pendingBalances > 0) {
        insights.push(`₹${pendingBalances.toLocaleString('en-IN')} pending across unpaid or partially paid invoices.`);
      }
    }

    return ok(
      {
        kpis: {
          total_bookings: activeBookings.length,
          confirmed_bookings: activeBookings.filter((b) => b.booking_status === 'Confirmed').length,
          todays_bookings: activeBookings.filter((b) => b.check_in_date === today).length,
          upcoming_checkins_count: upcomingCheckins.length,
          upcoming_checkouts_count: upcomingCheckouts.length,
          total_quotations: state.quotations.length,
          total_invoices: activeInvoices.length,
          total_customers: state.customers.length,
          total_enquiries: state.enquiries.length,
          pending_enquiries: state.enquiries.filter((e) => e.status === 'PENDING_REVIEW').length,
          total_vehicles: state.vehicles.length,
          total_invoiced_revenue: totalInvoiced,
          total_collected_revenue: totalCollected,
          monthly_revenue: totalCollected,
          pending_balances: pendingBalances,
          total_expenses: totalExpenses,
          estimated_operating_profit: totalCollected - totalExpenses,
        },
        charts: {
          monthly_series: [
            {
              label: new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
              invoiced_revenue: totalInvoiced,
              collected_revenue: totalCollected,
              expenses: totalExpenses,
              profit: totalCollected - totalExpenses,
              bookings: activeBookings.length,
            },
          ],
          payment_status_distribution: paymentDist,
          package_popularity: state.packages.map((p) => ({
            name: p.name,
            bookings: activeBookings.filter((b) => b.package_name === p.name).length,
            revenue: activeBookings
              .filter((b) => b.package_name === p.name)
              .reduce((s, b) => s + Number(b.total_booking_amount || 0), 0),
          })),
          expense_breakdown: expenseBreakdown,
        },
        upcoming_checkins: upcomingCheckins.map((b) => ({
          ...b,
          remaining_balance: Number(b.balance_due || 0),
        })),
        upcoming_checkouts: upcomingCheckouts.map((b) => ({
          ...b,
          remaining_balance: Number(b.balance_due || 0),
        })),
        recent_activity: recentActivity,
        insights,
      },
      config
    );
  }

  if (path === '/search' && method === 'GET') {
    const term = (q.q || '').toLowerCase();
    return ok(
      {
        customers: state.customers.filter(
          (c) => (c.full_name || '').toLowerCase().includes(term) || (c.mobile || '').includes(term)
        ),
        bookings: state.bookings.filter(
          (b) =>
            (b.booking_reference || '').toLowerCase().includes(term) ||
            (b.customer_name || '').toLowerCase().includes(term)
        ),
        quotations: state.quotations.filter(
          (qt) =>
            (qt.quotation_number || '').toLowerCase().includes(term) ||
            (qt.customer_name || '').toLowerCase().includes(term)
        ),
        invoices: state.invoices.filter(
          (inv) =>
            (inv.invoice_number || '').toLowerCase().includes(term) ||
            (inv.customer_name || '').toLowerCase().includes(term)
        ),
      },
      config
    );
  }

  // ---------------- SETTINGS & SIGNATURE ----------------
  if (path === '/settings' && method === 'GET') {
    return ok({ settings: state.settings }, config);
  }

  if (path === '/settings' && method === 'PUT') {
    state.settings = {
      ...state.settings,
      ...body,
      payment_info: {
        ...state.settings.payment_info,
        ...(body.payment_info || {}),
      },
      gst: {
        ...state.settings.gst,
        ...(body.gst || {}),
      },
      documents: {
        ...state.settings.documents,
        ...(body.documents || {}),
      },
    };
    saveLocalState(state);
    return ok({ settings: state.settings }, config);
  }

  if (path === '/settings/signature' && method === 'POST') {
    const file = body instanceof FormData ? (body.get('file') as File | null) : null;
    if (file) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read signature image'));
        reader.readAsDataURL(file);
      });
      state.settings.documents = {
        ...state.settings.documents,
        has_signature_image: true,
        signature_data_url: dataUrl,
      };
      saveLocalState(state);
    }
    return ok({ message: 'Signature updated.', settings: state.settings }, config);
  }

  if (path === '/settings/signature' && method === 'DELETE') {
    state.settings.documents = {
      ...state.settings.documents,
      has_signature_image: false,
      signature_data_url: '',
    };
    saveLocalState(state);
    return ok({ message: 'Signature removed.', settings: state.settings }, config);
  }

  if (path === '/settings/demo-data' && method === 'POST') {
    if (!state.customers.some((c) => c.full_name.startsWith('DEMO'))) {
      const cid = uid();
      const today = todayLocalISO();
      state.customers.unshift({
        id: cid,
        customer_code: `CUST-DEMO-${rand4()}`,
        full_name: 'DEMO - Aarav Kulkarni',
        mobile: '9820011223',
        email: 'aarav.demo@example.com',
        address: 'Flat 402, Green Park Residency, Panvel',
        city: 'Panvel',
        state: 'Maharashtra',
        customer_source: 'DEMO',
        is_demo: true,
        created_at: nowISO(),
      });
      state.bookings.unshift({
        id: uid(),
        booking_reference: `BKG-DEMO-${rand4()}`,
        customer_id: cid,
        customer_name: 'DEMO - Aarav Kulkarni',
        customer_mobile: '9820011223',
        package_id: 'pkg-24hr',
        package_name: '24-Hour Staycation Package',
        check_in_date: today,
        check_out_date: today,
        adults: 4,
        children: 1,
        infants: 0,
        rooms: 1,
        dormitory_guests: 0,
        booking_status: 'Confirmed',
        payment_status: 'Paid',
        total_booking_amount: 11250,
        advance_paid: 11250,
        balance_due: 0,
        special_requests: 'DEMO dataset booking',
        is_demo: true,
        created_at: nowISO(),
      });
      saveLocalState(state);
    }
    return ok({ message: 'Demo records loaded successfully.' }, config);
  }

  if (path === '/settings/demo-data' && method === 'DELETE') {
    state.bookings = state.bookings.filter((b) => !b.is_demo && !String(b.booking_reference).includes('DEMO'));
    state.customers = state.customers.filter((c) => !c.is_demo && !String(c.full_name).startsWith('DEMO'));
    saveLocalState(state);
    return ok({ message: 'Demo records cleared.' }, config);
  }

  // ---------------- CUSTOMERS ----------------
  if (path === '/customers' && method === 'GET') {
    let items = [...state.customers];
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(
        (c) =>
          (c.full_name || '').toLowerCase().includes(s) ||
          (c.mobile || '').includes(s) ||
          (c.customer_code || '').toLowerCase().includes(s)
      );
    }
    return ok({ items, total: items.length }, config);
  }

  if (path === '/customers' && method === 'POST') {
    const mob = String(body.mobile || '').replace(/\D/g, '').slice(-10);
    if (mob && state.customers.some((c) => c.mobile === mob)) {
      throw makeError(409, `Customer with mobile ${mob} already exists.`, config);
    }
    const cust = {
      id: uid(),
      customer_code: `CUST-${rand4()}`,
      full_name: String(body.full_name || '').trim(),
      mobile: mob || 'N/A',
      whatsapp_number: body.whatsapp_number || mob || '',
      email: body.email || '',
      address: body.address || '',
      city: body.city || '',
      state: body.state || 'Maharashtra',
      pin_code: body.pin_code || '',
      company_name: body.company_name || '',
      gstin: (body.gstin || '').toUpperCase(),
      notes: body.notes || '',
      customer_source: 'Admin Desk',
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.customers.unshift(cust);
    saveLocalState(state);
    return ok({ customer: cust }, config, 201);
  }

  if (path.startsWith('/customers/') && method === 'PUT') {
    const id = path.split('/')[2];
    const cust = state.customers.find((c) => c.id === id || c.customer_code === id);
    if (!cust) throw makeError(404, 'Customer not found.', config);
    Object.assign(cust, body, { updated_at: nowISO() });
    saveLocalState(state);
    return ok({ customer: cust }, config);
  }

  if (path.startsWith('/customers/') && method === 'GET') {
    const id = path.split('/')[2];
    const cust = state.customers.find((c) => c.id === id || c.customer_code === id);
    if (!cust) throw makeError(404, 'Customer not found.', config);
    return ok(
      {
        customer: {
          ...cust,
          bookings: state.bookings.filter((b) => b.customer_id === cust.id),
          invoices: state.invoices.filter((i) => i.customer_id === cust.id),
        },
      },
      config
    );
  }

  // ---------------- PACKAGES ----------------
  if (path === '/packages' && method === 'GET') {
    let items = [...state.packages];
    if (q.active_only === 'true') items = items.filter((p) => p.is_active !== false);
    return ok({ items, total: items.length }, config);
  }

  if (path === '/packages' && method === 'POST') {
    const pkg = {
      id: uid(),
      package_code: body.package_code || `PKG-${rand4()}`,
      name: body.name || 'Custom Package',
      category: body.category || 'Stay',
      weekday_rate: Number(body.weekday_rate || 0),
      weekend_rate: Number(body.weekend_rate || 0),
      child_price: Number(body.child_price || 0),
      infant_price: Number(body.infant_price || 0),
      description: body.description || '',
      inclusions: body.inclusions || [],
      is_active: true,
      created_at: nowISO(),
    };
    state.packages.unshift(pkg);
    saveLocalState(state);
    return ok({ package: pkg }, config, 201);
  }

  if (path.startsWith('/packages/') && method === 'PUT') {
    const id = path.split('/')[2];
    const pkg = state.packages.find((p) => p.id === id || p.package_code === id);
    if (!pkg) throw makeError(404, 'Package not found.', config);
    Object.assign(pkg, body);
    saveLocalState(state);
    return ok({ package: pkg }, config);
  }

  if (path === '/packages/calculate' && method === 'POST') {
    const pkg = state.packages.find((p) => p.id === body.package_id || p.package_code === body.package_id) || state.packages[0];
    const adults = Number(body.adults || 2);
    const children = Number(body.children || 0);
    const infants = Number(body.infants || 0);
    const adultRate = Number(pkg?.weekday_rate || 2000);
    const childRate = Number(pkg?.child_price || 1000);
    const infantRate = Number(pkg?.infant_price || 0);
    return ok(
      {
        adult_rate: adultRate,
        child_rate: childRate,
        infant_rate: infantRate,
        total_package_amount: adults * adultRate + children * childRate + infants * infantRate,
      },
      config
    );
  }

  // ---------------- BOOKINGS & CALENDAR ----------------
  if ((path === '/bookings/calendar/month' || path === '/bookings/calendar-month') && method === 'GET') {
    const year = Number(q.year || new Date().getFullYear());
    const month = Number(q.month || new Date().getMonth() + 1);
    const numDays = new Date(year, month, 0).getDate();
    const todayStr = todayLocalISO();
    const days: Record<string, any> = {};

    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPast = dateStr < todayStr;
      const activeBookings = state.bookings.filter(
        (b) => b.booking_status !== 'Cancelled' && b.check_in_date <= dateStr && b.check_out_date >= dateStr
      );
      const activeEnquiries = state.enquiries.filter(
        (e) =>
          ['PENDING_REVIEW', 'MORE_INFO_REQUESTED'].includes(e.status) &&
          e.check_in_date <= dateStr &&
          e.check_out_date >= dateStr
      );
      const activeQuotations = state.quotations.filter(
        (qt) =>
          ['Draft', 'Sent', 'Accepted'].includes(qt.status) &&
          qt.check_in_date &&
          qt.check_out_date &&
          qt.check_in_date <= dateStr &&
          qt.check_out_date >= dateStr
      );

      let statusCode = 'AVAILABLE';
      if (isPast) statusCode = 'PAST';
      else if (activeBookings.length > 0) statusCode = 'BOOKED';
      else if (activeEnquiries.length > 0 || activeQuotations.length > 0) statusCode = 'TENTATIVE';

      days[dateStr] = {
        date: dateStr,
        day: d,
        is_past: isPast,
        status: statusCode,
        bookings: activeBookings,
        enquiries: activeEnquiries,
        quotations: activeQuotations,
      };
    }

    return ok({ year, month, today: todayStr, days }, config);
  }

  if (path === '/bookings' && method === 'GET') {
    let items = [...state.bookings];
    const today = todayLocalISO();
    if (q.view === 'upcoming_checkins') {
      items = items.filter((b) => b.booking_status !== 'Cancelled' && b.check_in_date >= today);
    } else if (q.view === 'upcoming_checkouts') {
      items = items.filter((b) => ['Confirmed', 'Checked In'].includes(b.booking_status) && b.check_out_date >= today);
    }
    if (q.booking_status && q.booking_status !== 'All') items = items.filter((b) => b.booking_status === q.booking_status);
    if (q.payment_status && q.payment_status !== 'All') items = items.filter((b) => b.payment_status === q.payment_status);
    if (q.date_from) items = items.filter((b) => b.check_in_date >= q.date_from);
    if (q.date_to) items = items.filter((b) => b.check_in_date <= q.date_to);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(
        (b) =>
          (b.booking_reference || '').toLowerCase().includes(s) ||
          (b.customer_name || '').toLowerCase().includes(s) ||
          (b.customer_mobile || '').includes(s)
      );
    }
    return ok({ items, total: items.length }, config);
  }

  if (path === '/bookings' && method === 'POST') {
    const cust = resolveOrCreateCustomer(state, body, 'Direct Booking');
    if (!cust) throw makeError(404, 'Selected customer does not exist.', config);
    const pkg = state.packages.find((p) => p.id === body.package_id || p.package_code === body.package_id);
    const total = Number(body.total_booking_amount || 0);
    const adv = Number(body.advance_paid || 0);
    const due = Math.max(0, total - adv);
    const pStatus = total > 0 && adv >= total ? 'Paid' : adv > 0 ? 'Partially Paid' : 'Unpaid';
    const b = {
      id: uid(),
      booking_reference: `BKG-${new Date().getFullYear()}-${rand4()}`,
      customer_id: cust.id,
      customer_name: cust.full_name,
      customer_mobile: cust.mobile,
      package_id: pkg?.id || null,
      package_name: pkg?.name || 'Custom Stay Package',
      check_in_date: body.check_in_date,
      check_in_time: body.check_in_time || '12:00 PM',
      check_out_date: body.check_out_date,
      check_out_time: body.check_out_time || '11:00 AM',
      adults: Number(body.adults || 2),
      children: Number(body.children || 0),
      infants: Number(body.infants || 0),
      total_guests: Number(body.adults || 2) + Number(body.children || 0) + Number(body.infants || 0),
      rooms: Number(body.rooms || 1),
      dormitory_guests: Number(body.dormitory_guests || 0),
      booking_status: body.booking_status || 'Confirmed',
      payment_status: pStatus,
      total_booking_amount: total,
      total_amount: total,
      advance_paid: adv,
      balance_due: due,
      assigned_staff: body.assigned_staff || 'Pranit Dabhade',
      special_requests: body.special_requests || '',
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.bookings.unshift(b);
    saveLocalState(state);
    return ok({ booking: b }, config, 201);
  }

  if (path.match(/^\/bookings\/[^/]+\/cancel$/) && method === 'POST') {
    const id = path.split('/')[2];
    const b = state.bookings.find((x) => x.id === id || x.booking_reference === id);
    if (!b) throw makeError(404, 'Booking not found.', config);
    b.booking_status = 'Cancelled';
    b.updated_at = nowISO();
    saveLocalState(state);
    return ok({ booking: b, message: 'Booking cancelled.' }, config);
  }

  if (path.startsWith('/bookings/') && method === 'PUT') {
    const id = path.split('/')[2];
    const b = state.bookings.find((x) => x.id === id || x.booking_reference === id);
    if (!b) throw makeError(404, 'Booking not found.', config);
    Object.assign(b, body, { updated_at: nowISO() });
    if (body.total_booking_amount !== undefined) {
      b.total_booking_amount = Number(body.total_booking_amount);
      b.total_amount = b.total_booking_amount;
      b.balance_due = Math.max(0, b.total_booking_amount - Number(b.advance_paid || 0));
      b.payment_status = b.total_booking_amount > 0 && b.advance_paid >= b.total_booking_amount ? 'Paid' : b.advance_paid > 0 ? 'Partially Paid' : 'Unpaid';
    }
    saveLocalState(state);
    return ok({ booking: b }, config);
  }

  if (path.startsWith('/bookings/') && method === 'GET') {
    const id = path.split('/')[2];
    const b = state.bookings.find((x) => x.id === id || x.booking_reference === id);
    if (!b) throw makeError(404, 'Booking not found.', config);
    return ok({ booking: b }, config);
  }

  // ---------------- QUOTATIONS ----------------
  if (path === '/quotations/calculate' && method === 'POST') {
    const { subtotal, discountTotal } = computeLineItems(body.line_items || []);
    const add = Number(body.additional_charges || 0);
    const grand = Math.max(0, subtotal - discountTotal + add);
    return ok({ totals: { subtotal, additional_charges: add, tax_total: 0, grand_total: grand } }, config);
  }

  if (path === '/quotations' && method === 'GET') {
    let items = [...state.quotations];
    if (q.status_filter && q.status_filter !== 'All') items = items.filter((qt) => qt.status === q.status_filter);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(
        (qt) =>
          (qt.quotation_number || '').toLowerCase().includes(s) ||
          (qt.customer_name || '').toLowerCase().includes(s) ||
          (qt.customer_mobile || '').includes(s)
      );
    }
    return ok({ items, total: items.length }, config);
  }

  if (path === '/quotations' && method === 'POST') {
    const cust = resolveOrCreateCustomer(state, body, 'Direct Quotation');
    if (!cust) throw makeError(422, 'Customer name or selection is required.', config);
    const { items, subtotal, discountTotal } = computeLineItems(body.line_items || []);
    const add = Number(body.additional_charges || 0);
    const grand = Math.max(0, subtotal - discountTotal + add);
    const qt = {
      id: uid(),
      quotation_number: `QT-${new Date().getFullYear()}-${rand4()}`,
      customer_id: cust.id,
      customer_name: cust.full_name,
      customer_mobile: cust.mobile,
      customer_address: cust.address || '',
      quotation_date: body.quotation_date || todayLocalISO(),
      valid_until: body.valid_until || todayLocalISO(),
      check_in_date: body.check_in_date || todayLocalISO(),
      check_out_date: body.check_out_date || todayLocalISO(),
      package_name: body.package_name || 'Custom Stay Package',
      adults: Number(body.adults || 2),
      children: Number(body.children || 0),
      infants: Number(body.infants || 0),
      rooms: Number(body.rooms || 1),
      dormitory_guests: Number(body.dormitory_guests || 0),
      line_items: items,
      subtotal,
      discount: discountTotal,
      discount_total: discountTotal,
      additional_charges: add,
      tax_amount: 0,
      tax_total: 0,
      grand_total: grand,
      advance_required: Number(body.advance_required || 0),
      terms_and_conditions: body.terms_and_conditions || '',
      notes: body.notes || '',
      status: body.status || 'Draft',
      booking_id: null,
      converted_booking_id: null,
      booking_reference: null,
      created_by: 'Pranit Dabhade',
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.quotations.unshift(qt);
    saveLocalState(state);
    return ok({ quotation: qt }, config, 201);
  }

  if (path.match(/^\/quotations\/[^/]+\/pdf$/) && method === 'GET') {
    const id = path.split('/')[2];
    const qt = state.quotations.find((x) => x.id === id || x.quotation_number === id);
    if (!qt) throw makeError(404, 'Quotation not found.', config);
    const blob = await generateQuotationPdfBlob(qt, state.settings);
    return ok(blob, config);
  }

  if (path.match(/^\/quotations\/[^/]+\/convert-to-booking$/) && method === 'POST') {
    const id = path.split('/')[2];
    const qt = state.quotations.find((x) => x.id === id || x.quotation_number === id);
    if (!qt) throw makeError(404, 'Quotation not found.', config);

    if (qt.booking_id) {
      const existing = state.bookings.find((b) => b.id === qt.booking_id);
      if (existing) {
        return ok(
          {
            message: `Quotation already converted to booking ${existing.booking_reference}.`,
            booking: existing,
            quotation: qt,
            already_converted: true,
          },
          config
        );
      }
    }

    const ref = `BKG-${new Date().getFullYear()}-${rand4()}`;
    const b = {
      id: uid(),
      booking_reference: ref,
      customer_id: qt.customer_id,
      customer_name: qt.customer_name,
      customer_mobile: qt.customer_mobile,
      package_name: qt.package_name || 'Custom Stay Package',
      check_in_date: qt.check_in_date,
      check_out_date: qt.check_out_date,
      adults: qt.adults || 2,
      children: qt.children || 0,
      infants: qt.infants || 0,
      total_guests: (qt.adults || 0) + (qt.children || 0) + (qt.infants || 0),
      rooms: qt.rooms || 1,
      booking_status: 'Confirmed',
      payment_status: 'Unpaid',
      total_booking_amount: qt.grand_total,
      total_amount: qt.grand_total,
      advance_paid: 0,
      balance_due: qt.grand_total,
      special_requests: qt.notes || '',
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.bookings.unshift(b);
    qt.status = 'Converted';
    qt.booking_id = b.id;
    qt.converted_booking_id = b.id;
    qt.booking_reference = b.booking_reference;
    saveLocalState(state);
    return ok({ message: `Converted to Booking ${ref}`, booking: b, quotation: qt }, config);
  }

  if (path.match(/^\/quotations\/[^/]+\/duplicate$/) && method === 'POST') {
    const id = path.split('/')[2];
    const qt = state.quotations.find((x) => x.id === id || x.quotation_number === id);
    if (!qt) throw makeError(404, 'Quotation not found.', config);
    const copy = {
      ...JSON.parse(JSON.stringify(qt)),
      id: uid(),
      quotation_number: `QT-${new Date().getFullYear()}-${rand4()}`,
      quotation_date: todayLocalISO(),
      status: 'Draft',
      booking_id: null,
      converted_booking_id: null,
      booking_reference: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.quotations.unshift(copy);
    saveLocalState(state);
    return ok({ quotation: copy }, config);
  }

  if (path.startsWith('/quotations/') && method === 'PUT') {
    const id = path.split('/')[2];
    const qt = state.quotations.find((x) => x.id === id || x.quotation_number === id);
    if (!qt) throw makeError(404, 'Quotation not found.', config);
    if (body.line_items) {
      const { items, subtotal, discountTotal } = computeLineItems(body.line_items);
      qt.line_items = items;
      qt.subtotal = subtotal;
      qt.discount = discountTotal;
      qt.discount_total = discountTotal;
      qt.grand_total = Math.max(0, subtotal - discountTotal + Number(body.additional_charges ?? qt.additional_charges ?? 0));
    }
    Object.assign(qt, { ...body, line_items: qt.line_items, subtotal: qt.subtotal, grand_total: qt.grand_total, updated_at: nowISO() });
    saveLocalState(state);
    return ok({ quotation: qt }, config);
  }

  // ---------------- INVOICES ----------------
  if (path === '/invoices' && method === 'GET') {
    let items = [...state.invoices];
    if (q.payment_status && q.payment_status !== 'All') items = items.filter((i) => i.payment_status === q.payment_status);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(
        (i) =>
          (i.invoice_number || '').toLowerCase().includes(s) ||
          (i.customer_name || '').toLowerCase().includes(s) ||
          (i.contact_number || '').includes(s)
      );
    }
    return ok({ items, total: items.length }, config);
  }

  if (path === '/invoices' && method === 'POST') {
    const cust = resolveOrCreateCustomer(state, body, 'Direct Invoice');
    if (!cust) throw makeError(422, 'Customer name or selection is required.', config);
    const { items, subtotal, discountTotal } = computeLineItems(body.line_items || []);
    const add = Number(body.additional_charges || 0);
    const taxable = Math.max(0, subtotal - discountTotal) + add;
    let cgst = 0;
    let sgst = 0;
    if (body.apply_gst && state.settings.gst?.enabled) {
      cgst = Math.round(((taxable * Number(state.settings.gst.cgst_rate || 6)) / 100) * 100) / 100;
      sgst = Math.round(((taxable * Number(state.settings.gst.sgst_rate || 6)) / 100) * 100) / 100;
    }
    const taxTotal = cgst + sgst;
    const grand = Math.round((taxable + taxTotal) * 100) / 100;
    const initPay = Math.min(grand, Math.max(0, Number(body.initial_payment_amount || 0)));
    const due = Math.max(0, Math.round((grand - initPay) * 100) / 100);
    const payStatus = grand > 0 && initPay >= grand ? 'Paid' : initPay > 0 ? 'Partially Paid' : 'Unpaid';
    const docTitle = payStatus === 'Paid' ? 'PAID INVOICE' : payStatus === 'Partially Paid' ? 'PARTIALLY PAID INVOICE' : 'TAX INVOICE';

    const booking = body.booking_id
      ? state.bookings.find((b) => b.id === body.booking_id || b.booking_reference === body.booking_id)
      : null;

    const inv = {
      id: uid(),
      invoice_number: `INV-${new Date().getFullYear()}-${rand4()}`,
      invoice_date: body.invoice_date || todayLocalISO(),
      document_title: docTitle,
      customer_id: cust.id,
      customer_name: cust.full_name,
      contact_number: cust.mobile,
      customer_mobile: cust.mobile,
      address: cust.address || body.customer_address || '',
      customer_address: cust.address || body.customer_address || '',
      gstin: cust.gstin || body.customer_gstin || '',
      booking_id: booking?.id || null,
      booking_reference: booking?.booking_reference || body.booking_reference || null,
      quotation_id: body.quotation_id || null,
      check_in_date: body.check_in_date || booking?.check_in_date || null,
      check_out_date: body.check_out_date || booking?.check_out_date || null,
      line_items: items,
      subtotal,
      discount_total: discountTotal,
      discount_amount: discountTotal,
      taxable_amount: taxable,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: 0,
      tax_total: taxTotal,
      additional_charges: add,
      grand_total: grand,
      total_amount_paid: initPay,
      balance_due: due,
      payment_status: payStatus,
      notes: body.notes || '',
      is_finalized: Boolean(body.finalize),
      created_by: 'Pranit Dabhade',
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    state.invoices.unshift(inv);

    if (initPay > 0) {
      state.payments.unshift({
        id: uid(),
        payment_id: `PAY-${rand4()}`,
        receipt_number: `REC-${new Date().getFullYear()}-${rand4()}`,
        customer_id: cust.id,
        customer_name: cust.full_name,
        customer_mobile: cust.mobile,
        booking_id: booking?.id || null,
        invoice_id: inv.id,
        payment_date: inv.invoice_date,
        amount: initPay,
        payment_type: initPay >= grand ? 'Full' : 'Advance',
        payment_method: body.initial_payment_method || 'Google Pay',
        transaction_id: body.initial_payment_reference || body.transaction_id || '',
        received_by: 'Pranit Dabhade',
        notes: body.notes || '',
        created_at: nowISO(),
      });
    }

    if (booking) {
      booking.total_booking_amount = inv.grand_total;
      booking.total_amount = inv.grand_total;
      booking.advance_paid = inv.total_amount_paid;
      booking.balance_due = inv.balance_due;
      booking.payment_status = inv.payment_status;
    }

    saveLocalState(state);
    return ok({ invoice: inv, customer: cust }, config, 201);
  }

  if (path.match(/^\/invoices\/[^/]+\/pdf$/) && method === 'GET') {
    const id = path.split('/')[2];
    const inv = state.invoices.find((x) => x.id === id || x.invoice_number === id);
    if (!inv) throw makeError(404, 'Invoice not found.', config);
    const blob = await generateInvoicePdfBlob(inv, state.settings);
    return ok(blob, config);
  }

  if (path.match(/^\/invoices\/[^/]+\/adjust$/) && method === 'POST') {
    const id = path.split('/')[2];
    const inv = state.invoices.find((x) => x.id === id || x.invoice_number === id);
    if (!inv) throw makeError(404, 'Invoice not found.', config);
    if (body.adjustment_type === 'Cancellation') {
      inv.payment_status = 'Cancelled';
      inv.document_title = 'CANCELLED INVOICE';
      inv.cancellation_reason = body.reason || '';
    }
    inv.updated_at = nowISO();
    saveLocalState(state);
    return ok({ invoice: inv, message: `Invoice ${body.adjustment_type} completed.` }, config);
  }

  // ---------------- PAYMENTS ----------------
  if (path === '/payments' && method === 'GET') {
    let items = [...state.payments];
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(
        (p) =>
          (p.receipt_number || '').toLowerCase().includes(s) ||
          (p.customer_name || '').toLowerCase().includes(s) ||
          (p.transaction_id || '').toLowerCase().includes(s)
      );
    }
    return ok({ items, total: items.length }, config);
  }

  if (path === '/payments' && method === 'POST') {
    const inv = body.invoice_id
      ? state.invoices.find((i) => i.id === body.invoice_id || i.invoice_number === body.invoice_id)
      : null;
    const bkg = body.booking_id
      ? state.bookings.find((b) => b.id === body.booking_id || b.booking_reference === body.booking_id)
      : inv?.booking_id
      ? state.bookings.find((b) => b.id === inv.booking_id)
      : null;
    const cust = inv
      ? state.customers.find((c) => c.id === inv.customer_id)
      : bkg
      ? state.customers.find((c) => c.id === bkg.customer_id)
      : state.customers.find((c) => c.id === body.customer_id);

    if (!cust) throw makeError(400, 'Select a customer, booking, or invoice.', config);
    if (inv && inv.payment_status === 'Cancelled') throw makeError(400, 'Cannot record payment against a cancelled invoice.', config);

    const amt = Number(body.amount || 0);
    if (amt <= 0) throw makeError(422, 'Amount must be greater than zero.', config);
    const isRefund = String(body.payment_type || '').toLowerCase() === 'refund';

    const rec = {
      id: uid(),
      payment_id: `PAY-${rand4()}`,
      receipt_number: `REC-${new Date().getFullYear()}-${rand4()}`,
      customer_id: cust.id,
      customer_name: cust.full_name,
      customer_mobile: cust.mobile,
      booking_id: bkg?.id || null,
      invoice_id: inv?.id || null,
      payment_date: body.payment_date || todayLocalISO(),
      amount: amt,
      payment_type: body.payment_type || 'Advance',
      payment_method: body.payment_method || 'Google Pay',
      transaction_id: body.transaction_id || body.payment_reference || '',
      received_by: 'Pranit Dabhade',
      notes: body.notes || '',
      created_at: nowISO(),
    };
    state.payments.unshift(rec);

    if (inv) {
      inv.total_amount_paid = isRefund ? Math.max(0, inv.total_amount_paid - amt) : inv.total_amount_paid + amt;
      inv.balance_due = Math.max(0, inv.grand_total - inv.total_amount_paid);
      inv.payment_status = inv.total_amount_paid <= 0 && inv.grand_total > 0 ? 'Unpaid' : inv.balance_due <= 0 ? 'Paid' : 'Partially Paid';
      inv.document_title = inv.payment_status === 'Paid' ? 'PAID INVOICE' : inv.payment_status === 'Partially Paid' ? 'PARTIALLY PAID INVOICE' : 'TAX INVOICE';
    }
    if (bkg) {
      if (inv) {
        bkg.total_booking_amount = inv.grand_total;
        bkg.total_amount = inv.grand_total;
        bkg.advance_paid = inv.total_amount_paid;
        bkg.balance_due = inv.balance_due;
        bkg.payment_status = inv.payment_status;
      } else {
        bkg.advance_paid = isRefund ? Math.max(0, (bkg.advance_paid || 0) - amt) : (bkg.advance_paid || 0) + amt;
        bkg.balance_due = Math.max(0, (bkg.total_booking_amount || 0) - bkg.advance_paid);
        bkg.payment_status = bkg.advance_paid <= 0 && bkg.total_booking_amount > 0 ? 'Unpaid' : bkg.balance_due <= 0 ? 'Paid' : 'Partially Paid';
      }
    }

    saveLocalState(state);
    return ok({ payment: rec }, config, 201);
  }

  if (path.match(/^\/payments\/[^/]+\/receipt/) && method === 'GET') {
    const id = path.split('/')[2];
    const p = state.payments.find((x) => x.id === id || x.receipt_number === id);
    if (!p) throw makeError(404, 'Payment record not found.', config);
    const blob = await generateReceiptPdfBlob(p, state.settings);
    return ok(blob, config);
  }

  // ---------------- EXPENSES ----------------
  if (path === '/expenses' && method === 'GET') {
    let items = [...state.expenses];
    if (q.category && q.category !== 'All') items = items.filter((e) => e.category === q.category);
    if (q.search) {
      const s = q.search.toLowerCase();
      items = items.filter(
        (e) => (e.description || '').toLowerCase().includes(s) || (e.vendor || '').toLowerCase().includes(s)
      );
    }
    const totalAmount = items.reduce((s, e) => s + Number(e.amount || 0), 0);
    const byCat = Object.entries(
      items.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
        return acc;
      }, {})
    ).map(([category, amount]) => ({ category, amount }));
    return ok({ items, total: items.length, total_amount: totalAmount, by_category: byCat }, config);
  }

  if (path === '/expenses' && method === 'POST') {
    const exp = {
      id: uid(),
      expense_id: `EXP-${rand4()}`,
      expense_date: body.expense_date || todayLocalISO(),
      category: body.category || 'Other expenses',
      description: body.description || 'Expense',
      vendor: body.vendor || '',
      amount: Number(body.amount || 0),
      payment_method: body.payment_method || 'Cash',
      notes: body.notes || '',
      entered_by: 'Pranit Dabhade',
      has_receipt: false,
      created_at: nowISO(),
    };
    state.expenses.unshift(exp);
    saveLocalState(state);
    return ok({ expense: exp }, config, 201);
  }

  if (path.startsWith('/expenses/') && method === 'DELETE') {
    const id = path.split('/')[2];
    state.expenses = state.expenses.filter((e) => e.id !== id);
    saveLocalState(state);
    return ok({ message: 'Expense deleted.' }, config);
  }

  // ---------------- ENQUIRIES, VEHICLES, ROOMS, MEALS, ADDONS ----------------
  if (path === '/enquiries' && method === 'GET') {
    let items = [...state.enquiries];
    if (q.status_filter && q.status_filter !== 'ALL') items = items.filter((e) => e.status === q.status_filter);
    return ok({ items, total: items.length }, config);
  }

  if (path === '/vehicles' && method === 'GET') {
    return ok({ items: state.vehicles, total: state.vehicles.length }, config);
  }

  if (path === '/vehicles' && method === 'POST') {
    const v = {
      id: uid(),
      registration_number: String(body.registration_number || '').toUpperCase(),
      vehicle_type: body.vehicle_type || 'Car',
      customer_name: body.customer_name || 'Guest',
      customer_mobile: body.customer_mobile || '',
      notes: body.notes || '',
      created_at: nowISO(),
    };
    state.vehicles.unshift(v);
    saveLocalState(state);
    return ok({ id: v.id, registration_number: v.registration_number, message: 'Vehicle recorded.' }, config, 201);
  }

  if (path === '/rooms' && method === 'GET') {
    return ok({ items: state.rooms, total: state.rooms.length }, config);
  }

  if (path === '/rooms' && method === 'POST') {
    const rm = { id: uid(), ...body, is_active: true };
    state.rooms.push(rm);
    saveLocalState(state);
    return ok({ room: rm }, config, 201);
  }

  if (path.startsWith('/rooms/') && method === 'PUT') {
    const id = path.split('/')[2];
    const rm = state.rooms.find((r) => r.id === id);
    if (rm) Object.assign(rm, body);
    saveLocalState(state);
    return ok({ room: rm }, config);
  }

  if (path === '/meals' && method === 'GET') {
    return ok({ items: state.meals, total: state.meals.length }, config);
  }

  if (path === '/meals/kitchen-daily-report' && method === 'GET') {
    const rDate = q.report_date || todayLocalISO();
    const inHouse = state.bookings.filter(
      (b) => ['Confirmed', 'Checked In'].includes(b.booking_status) && b.check_in_date <= rDate && b.check_out_date >= rDate
    );
    return ok(
      {
        report_date: rDate,
        summary: {
          total_active_bookings: inHouse.length,
          total_headcount_to_feed: inHouse.reduce((s, b) => s + Number(b.total_guests || 0), 0),
          adults: inHouse.reduce((s, b) => s + Number(b.adults || 0), 0),
          children: inHouse.reduce((s, b) => s + Number(b.children || 0), 0),
          veg_count: inHouse.reduce((s, b) => s + Number(b.total_guests || 0), 0),
          non_veg_count: 0,
          jain_count: 0,
        },
        guest_groups: inHouse.map((b) => ({
          booking_reference: b.booking_reference,
          guest_name: b.customer_name,
          total_guests: b.total_guests,
          adults: b.adults,
          children: b.children,
          dietary_preference: 'Standard Maharashtrian',
          special_instructions: b.special_requests || 'None',
          check_in: b.check_in_date,
          check_out: b.check_out_date,
          package_name: b.package_name,
        })),
        custom_meal_orders: [],
      },
      config
    );
  }

  if (path === '/addons' && method === 'GET') {
    let items = [...state.addons];
    if (q.active_only === 'true') items = items.filter((a) => a.is_active !== false);
    return ok({ items, total: items.length }, config);
  }

  if (path === '/addons' && method === 'POST') {
    const a = { id: uid(), ...body, is_active: true };
    state.addons.unshift(a);
    saveLocalState(state);
    return ok({ addon: a }, config, 201);
  }

  if (path.startsWith('/addons/') && method === 'PUT') {
    const id = path.split('/')[2];
    const a = state.addons.find((x) => x.id === id);
    if (a) Object.assign(a, body);
    saveLocalState(state);
    return ok({ addon: a }, config);
  }

  // ---------------- NOTIFICATIONS ----------------
  if (path === '/notifications' && method === 'GET') {
    const unread = state.notifications.filter((n) => !n.is_read).length;
    return ok({ items: state.notifications, unread_count: unread }, config);
  }

  if (path === '/notifications/read-all' && method === 'POST') {
    state.notifications.forEach((n) => {
      n.is_read = true;
    });
    saveLocalState(state);
    return ok({ unread_count: 0 }, config);
  }

  if (path === '/notifications/clear-all' && method === 'POST') {
    state.notifications = [];
    saveLocalState(state);
    return ok({ unread_count: 0 }, config);
  }

  if (path.match(/^\/notifications\/[^/]+\/read$/) && method === 'POST') {
    const id = path.split('/')[2];
    const n = state.notifications.find((x) => x.id === id);
    if (n) n.is_read = true;
    saveLocalState(state);
    return ok({ unread_count: state.notifications.filter((x) => !x.is_read).length }, config);
  }

  if (path.startsWith('/notifications/') && method === 'DELETE') {
    const id = path.split('/')[2];
    state.notifications = state.notifications.filter((x) => x.id !== id);
    saveLocalState(state);
    return ok({ unread_count: state.notifications.filter((x) => !x.is_read).length }, config);
  }

  // ---------------- REPORTS ----------------
  if (path.match(/^\/reports\/[^/]+\/export$/) && method === 'GET') {
    const rType = path.split('/')[2];
    const report = buildReportData(state, rType);
    if ((q.format || 'pdf').toLowerCase() === 'json') {
      return ok(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), config);
    }
    const blob = await generateReportPdfBlob(report, state.settings);
    return ok(blob, config);
  }

  if (path.startsWith('/reports/') && method === 'GET') {
    const rType = path.split('/')[2];
    return ok(buildReportData(state, rType), config);
  }

  // ---------------- BACKUPS & STORAGE ----------------
  if (path === '/backups' && method === 'GET') {
    return ok(
      {
        backups: state.backups.map(({ snapshot: _s, ...rest }) => rest),
        last_automated_backup: state.backups[0]?.created_at || null,
      },
      config
    );
  }

  if (path === '/backups/create' && method === 'POST') {
    const { filename, content } = exportFullJsonBackup();
    const rec = {
      id: uid(),
      filename,
      size_bytes: new Blob([content]).size,
      sha256: 'local-json-' + Date.now().toString(16),
      created_by: 'Pranit Dabhade',
      created_at: nowISO(),
      modified_ts: Date.now() / 1000,
      snapshot: content,
    };
    state.backups.unshift(rec);
    saveLocalState(state);
    return ok({ filename: rec.filename, size_bytes: rec.size_bytes, message: 'JSON backup created.' }, config);
  }

  if (path.startsWith('/backups/download/') && method === 'GET') {
    const fn = decodeURIComponent(path.replace('/backups/download/', ''));
    const b = state.backups.find((x) => x.filename === fn);
    if (!b) throw makeError(404, 'Backup not found.', config);
    return ok(new Blob([b.snapshot], { type: 'application/json' }), config);
  }

  if (path.startsWith('/backups/verify/') && method === 'GET') {
    const fn = decodeURIComponent(path.replace('/backups/verify/', ''));
    const b = state.backups.find((x) => x.filename === fn);
    if (!b) throw makeError(404, 'Backup not found.', config);
    return ok({ valid: true, filename: fn, manifest: { sha256: b.sha256, size_bytes: b.size_bytes } }, config);
  }

  if (path.startsWith('/backups/restore/') && method === 'POST') {
    const fn = decodeURIComponent(path.replace('/backups/restore/', ''));
    const b = state.backups.find((x) => x.filename === fn);
    if (!b) throw makeError(404, 'Backup not found.', config);
    importFullJsonBackup(b.snapshot);
    return ok({ message: `Backup ${fn} restored successfully.`, restored: true }, config);
  }

  if ((path === '/backups/clear' && method === 'POST') || (path === '/backups' && method === 'DELETE')) {
    const count = state.backups.length;
    state.backups = [];
    saveLocalState(state);
    return ok({ success: true, message: `Cleared ${count} backups.`, cleared_records: count, cleared_files: count }, config);
  }

  if (path.startsWith('/backups/') && method === 'DELETE') {
    const fn = decodeURIComponent(path.replace('/backups/', ''));
    state.backups = state.backups.filter((x) => x.filename !== fn);
    saveLocalState(state);
    return ok({ success: true, message: `Backup ${fn} deleted.` }, config);
  }

  if (path === '/storage/summary' && method === 'GET') {
    const rawSize = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
    const totalRecords =
      state.enquiries.length +
      state.bookings.length +
      state.customers.length +
      state.vehicles.length +
      state.quotations.length +
      state.invoices.length +
      state.payments.length +
      state.expenses.length;
    return ok(
      {
        storage_mode: 'Browser LocalStorage (JSON)',
        total_bytes: rawSize,
        total_business_records: totalRecords,
        sections: {
          bookings: { count: state.bookings.length, label: 'Bookings' },
          enquiries: { count: state.enquiries.length, label: 'Booking Enquiries' },
          customers: { count: state.customers.length, label: 'Customers' },
          quotations: { count: state.quotations.length, label: 'Quotations' },
          invoices: { count: state.invoices.length, label: 'Invoices & Bills' },
          payments: { count: state.payments.length, label: 'Payments & Receipts' },
          expenses: { count: state.expenses.length, label: 'Expenses' },
          vehicles: { count: state.vehicles.length, label: 'Vehicle Registry' },
        },
      },
      config
    );
  }

  if (path === '/storage/clear' && method === 'POST') {
    const sec = body.section;
    let cleared = 0;
    if (sec === 'bookings') { cleared = state.bookings.length; state.bookings = []; }
    else if (sec === 'enquiries') { cleared = state.enquiries.length; state.enquiries = []; }
    else if (sec === 'customers') { cleared = state.customers.length; state.customers = []; }
    else if (sec === 'vehicles') { cleared = state.vehicles.length; state.vehicles = []; }
    else if (sec === 'quotations') { cleared = state.quotations.length; state.quotations = []; }
    else if (sec === 'invoices') { cleared = state.invoices.length; state.invoices = []; }
    else if (sec === 'payments') {
      cleared = state.payments.length;
      state.payments = [];
      state.invoices.forEach((i) => {
        if (i.payment_status !== 'Cancelled') {
          i.total_amount_paid = 0;
          i.balance_due = i.grand_total;
          i.payment_status = 'Unpaid';
          i.document_title = 'TAX INVOICE';
        }
      });
      state.bookings.forEach((b) => {
        b.advance_paid = 0;
        b.balance_due = b.total_booking_amount;
        b.payment_status = 'Unpaid';
      });
    }
    else if (sec === 'expenses') { cleared = state.expenses.length; state.expenses = []; }
    else if (sec === 'all_business') {
      cleared = state.bookings.length + state.quotations.length + state.invoices.length + state.payments.length + state.expenses.length + state.customers.length;
      state.bookings = []; state.quotations = []; state.invoices = []; state.payments = []; state.expenses = []; state.customers = []; state.enquiries = []; state.vehicles = [];
    }
    saveLocalState(state);
    return ok({ success: true, cleared_count: cleared, message: `Cleared ${cleared} records.` }, config);
  }

  if (path === '/audit-logs' && method === 'GET') {
    return ok({ entries: state.audit_logs, items: state.audit_logs, total: state.audit_logs.length }, config);
  }

  // Fallback empty list for any other GET
  if (method === 'GET') {
    return ok({ items: [], total: 0 }, config);
  }

  return ok({ ok: true }, config);
};
