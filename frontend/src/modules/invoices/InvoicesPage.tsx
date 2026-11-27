import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Lock, Plus, Receipt, Search, Share2, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateDisplay, formatINR, todayISO } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import { MealAddonPicker, type MealAddonPreset } from '../../components/MealAddonPicker';
import type { Booking, Customer, Invoice, LineItem, PackageItem, Quotation } from '../../types';

export const InvoicesPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [mealAddons, setMealAddons] = useState<MealAddonPreset[]>([]);
  const [gstRateTotal, setGstRateTotal] = useState(0);
  const [quickPkg, setQuickPkg] = useState({ package_id: '', adults: 2, children: 0, infants: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [payFilter, setPayFilter] = useState('All');

  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [customerMode, setCustomerMode] = useState<'direct' | 'existing'>('direct');
  const [saving, setSaving] = useState(false);

  const [pdfTarget, setPdfTarget] = useState<Invoice | null>(null);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: 0, payment_type: 'Full', payment_method: 'Google Pay', transaction_id: '', notes: '' });

  const [adjustTarget, setAdjustTarget] = useState<Invoice | null>(null);
  const [adjForm, setAdjForm] = useState({ adjustment_type: 'Credit Note', reason: '', amount: 0 });

  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    customer_mobile: '',
    customer_address: '',
    customer_gstin: '',
    booking_id: '',
    quotation_id: '',
    invoice_date: todayISO(),
    check_in_date: todayISO(),
    check_out_date: todayISO(),
    additional_charges: 0,
    apply_gst: false,
    initial_payment_amount: 0,
    initial_payment_method: 'Google Pay',
    initial_payment_reference: '',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: 'One Day Staycation', inclusion_text: 'Stay includes All Meals including Breakfast, Lunch, HiTea, Dinner.', quantity: 2, rate: 1800, unit: 'person', discount: 0, tax_rate: 0 },
  ]);

  // Live instant auto-calculations for the Invoice form
  const calcSubtotal = lineItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
  const calcDiscount = lineItems.reduce((sum, it) => sum + Math.min((Number(it.quantity) || 0) * (Number(it.rate) || 0), Number(it.discount) || 0), 0);
  const calcTaxable = Math.max(0, calcSubtotal - calcDiscount) + (Number(form.additional_charges) || 0);
  const calcTax = form.apply_gst && gstRateTotal > 0 ? Math.round((calcTaxable * gstRateTotal) / 100 * 100) / 100 : 0;
  const calcGrandTotal = Math.round((calcTaxable + calcTax) * 100) / 100;
  const calcBalanceDue = Math.max(0, Math.round((calcGrandTotal - (Number(form.initial_payment_amount) || 0)) * 100) / 100);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, cRes, pRes, sRes] = await Promise.all([
        api.get('/invoices', {
          params: {
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(payFilter !== 'All' ? { payment_status: payFilter } : {}),
          },
        }),
        api.get('/customers'),
        api.get('/packages', { params: { active_only: true } }).catch(() => ({ data: { items: [] } })),
        api.get('/settings').catch(() => ({ data: { settings: {} } })),
      ]);
      setInvoices(iRes.data.items || []);
      setCustomers(cRes.data.items || []);
      const pkgs = (pRes.data.items || []) as PackageItem[];
      setPackages(pkgs);
      setQuickPkg((prev) => (prev.package_id || pkgs.length === 0 ? prev : { ...prev, package_id: pkgs[0].id }));
      const cfg = sRes.data?.settings || {};
      if (Array.isArray(cfg.meal_addons)) {
        setMealAddons(cfg.meal_addons);
      }
      if (cfg.gst?.enabled) {
        const rate = (Number(cfg.gst.cgst_rate) || 0) + (Number(cfg.gst.sgst_rate) || 0);
        setGstRateTotal(rate > 0 ? rate : Number(cfg.gst.igst_rate) || 0);
      } else {
        setGstRateTotal(0);
      }
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load invoices.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, payFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pre-fill when navigating from Booking or Quotation
  useEffect(() => {
    const fromBooking = searchParams.get('fromBooking');
    const fromQuotation = searchParams.get('fromQuotation');
    if (fromBooking) {
      api.get(`/bookings/${fromBooking}`).then((res) => {
        const b = res.data.booking as Booking;
        setCustomerMode('existing');
        setForm({
          customer_id: b.customer_id,
          customer_name: b.customer_name || '',
          customer_mobile: b.contact_number || '',
          customer_address: '',
          customer_gstin: '',
          booking_id: b.id,
          quotation_id: b.quotation_id || '',
          invoice_date: todayISO(),
          check_in_date: b.check_in_date,
          check_out_date: b.check_out_date,
          additional_charges: 0,
          apply_gst: false,
          initial_payment_amount: 0,
          initial_payment_method: 'Google Pay',
          initial_payment_reference: '',
          notes: '',
        });
        setLineItems([
          {
            description: b.package_name,
            inclusion_text: `${b.adults} Adults, ${b.children} Children, ${b.infants} Infants (${b.rooms} Rooms)`,
            quantity: 1,
            rate: b.total_booking_amount,
            unit: 'stay',
            discount: 0,
            tax_rate: 0,
          },
        ]);
        setCreateOpen(true);
      }).catch(() => {});
    } else if (fromQuotation) {
      api.get(`/quotations/${fromQuotation}`).then((res) => {
        const q = res.data.quotation as Quotation;
        setCustomerMode('existing');
        setForm({
          customer_id: q.customer_id,
          customer_name: q.customer_name || '',
          customer_mobile: q.customer_mobile || '',
          customer_address: '',
          customer_gstin: '',
          booking_id: q.converted_booking_id || '',
          quotation_id: q.id,
          invoice_date: todayISO(),
          check_in_date: q.check_in_date,
          check_out_date: q.check_out_date,
          additional_charges: q.additional_charges || 0,
          apply_gst: q.tax_total > 0,
          initial_payment_amount: 0,
          initial_payment_method: 'Google Pay',
          initial_payment_reference: '',
          notes: '',
        });
        setLineItems(q.line_items.map((i) => ({ ...i })));
        setCreateOpen(true);
      }).catch(() => {});
    }
  }, [searchParams]);

  const handleAutoFillPackage = async () => {
    if (!quickPkg.package_id) return;
    try {
      const res = await api.post('/packages/quote', {
        package_id: quickPkg.package_id,
        check_in_date: form.check_in_date || todayISO(),
        check_out_date: form.check_out_date || form.check_in_date || todayISO(),
        adults: quickPkg.adults,
        children: quickPkg.children,
        infants: quickPkg.infants,
      });
      const pkg = res.data.package as PackageItem;
      const q = res.data.quote as { effective_adult_rate: number; effective_child_rate: number; effective_infant_rate: number };
      const items: LineItem[] = [];
      if (quickPkg.adults > 0) {
        items.push({
          description: `${pkg.name} (Adults)`,
          inclusion_text: pkg.included_meals ? `Includes ${pkg.included_meals}.` : '',
          quantity: quickPkg.adults,
          rate: q.effective_adult_rate,
          unit: 'person',
          discount: 0,
          tax_rate: 0,
        });
      }
      if (quickPkg.children > 0) {
        items.push({
          description: `${pkg.name} (Children 5–10)`,
          inclusion_text: 'Child 5–10 yrs package rate',
          quantity: quickPkg.children,
          rate: q.effective_child_rate,
          unit: 'child',
          discount: 0,
          tax_rate: 0,
        });
      }
      if (quickPkg.infants > 0) {
        items.push({
          description: 'Infants / Children (Age 1–5) Complimentary',
          inclusion_text: 'Complimentary stay & meals',
          quantity: quickPkg.infants,
          rate: q.effective_infant_rate,
          unit: 'child',
          discount: 0,
          tax_rate: 0,
        });
      }
      if (items.length > 0) setLineItems(items);
      showToast('Package rates auto-calculated!', 'info');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Could not auto-fill package rate.'), 'error');
    }
  };

  const handleAddMealOrAddon = (newItem: LineItem) => {
    setLineItems((prev) => {
      const idx = prev.findIndex(
        (x) => x.description.trim().toLowerCase() === newItem.description.trim().toLowerCase() && Number(x.rate) === Number(newItem.rate)
      );
      if (idx >= 0) {
        return prev.map((x, i) => (i === idx ? { ...x, quantity: Number(x.quantity) + Number(newItem.quantity) } : x));
      }
      // Replace blank starter row if user hasn't typed anything yet
      if (prev.length === 1 && !prev[0].description.trim() && prev[0].rate === 0) {
        return [newItem];
      }
      return [...prev, newItem];
    });
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customerMode === 'existing' && !form.customer_id) {
      showToast('Select an existing customer or switch to Enter Name Directly.', 'error');
      return;
    }
    if (customerMode === 'direct' && form.customer_name.trim().length < 2) {
      showToast('Please enter the Customer Name (at least 2 characters).', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/invoices', {
        ...form,
        customer_id: customerMode === 'existing' ? form.customer_id : null,
        customer_name: customerMode === 'direct' ? form.customer_name.trim() : null,
        customer_mobile: customerMode === 'direct' ? (form.customer_mobile.trim() || null) : null,
        customer_address: customerMode === 'direct' ? (form.customer_address.trim() || null) : null,
        customer_gstin: customerMode === 'direct' ? (form.customer_gstin.trim() || null) : null,
        booking_id: form.booking_id || null,
        quotation_id: form.quotation_id || null,
        line_items: lineItems,
        finalize: true,
      });
      showToast('Invoice generated successfully.', 'success');
      setCreateOpen(false);
      setSearchParams({});
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to create invoice.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setSaving(true);
    try {
      await api.post('/payments', {
        customer_id: payTarget.customer_id,
        invoice_id: payTarget.id,
        booking_id: payTarget.booking_id || null,
        amount: payForm.amount,
        payment_type: payForm.payment_type,
        payment_method: payForm.payment_method,
        transaction_id: payForm.transaction_id || null,
        notes: payForm.notes || null,
      });
      showToast('Payment recorded and invoice updated.', 'success');
      setPayTarget(null);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to record payment.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSaving(true);
    try {
      await api.post(`/invoices/${adjustTarget.id}/adjust`, adjForm);
      showToast('Audited invoice adjustment recorded.', 'success');
      setAdjustTarget(null);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to adjust invoice.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Invoices & Bills</h1>
          <p className="text-xs text-slate-500">Exact Blueberry template PDFs, payment tracking & finalized audit protection</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('invoices:write') && (
            <button
              type="button"
              onClick={() => {
                setCustomerMode('direct');
                setForm({
                  customer_id: '',
                  customer_name: '',
                  customer_mobile: '',
                  customer_address: '',
                  customer_gstin: '',
                  booking_id: '',
                  quotation_id: '',
                  invoice_date: todayISO(),
                  check_in_date: todayISO(),
                  check_out_date: todayISO(),
                  additional_charges: 0,
                  apply_gst: false,
                  initial_payment_amount: 0,
                  initial_payment_method: 'Google Pay',
                  initial_payment_reference: '',
                  notes: '',
                });
                setLineItems([
                  { description: 'One Day Staycation', inclusion_text: 'Stay includes All Meals including Breakfast, Lunch, HiTea, Dinner.', quantity: 2, rate: 1800, unit: 'person', discount: 0, tax_rate: 0 },
                ]);
                setCreateOpen(true);
              }}
              className="flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </button>
          )}
          <ClearDataButton section="invoices" label="Invoices & Bills" onCleared={load} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice no, customer, booking ref..."
            className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] bg-white pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={payFilter}
          onChange={(e) => setPayFilter(e.target.value)}
          className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
        >
          <option value="All">All Payment Statuses</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Refunded">Refunded</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading invoices..." />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No invoices generated yet"
          description="Generate an invoice from a booking, quotation, or manually."
        />
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-xs">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#0752A5]">{inv.invoice_number}</span>
                    <StatusBadge status={inv.payment_status} />
                    {inv.is_finalized && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        <Lock className="h-3 w-3" /> Finalized
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-base font-bold text-[#172033]">{inv.customer_name}</p>
                  <p className="text-xs text-slate-500">
                    Date: {formatDateDisplay(inv.invoice_date)}
                    {inv.booking_reference ? ` • Ref: ${inv.booking_reference}` : ''}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-lg font-bold text-[#172033]">{formatINR(inv.grand_total)}</p>
                  <p className="text-xs font-semibold text-emerald-700">Paid: {formatINR(inv.total_amount_paid)}</p>
                  {inv.balance_due > 0 && (
                    <p className="text-xs font-bold text-rose-700">Balance Due: {formatINR(inv.balance_due)}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E3E8F0] pt-3">
                <button
                  type="button"
                  onClick={() => setPdfTarget(inv)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0752A5] px-3 text-xs font-semibold text-white"
                >
                  <Share2 className="h-3.5 w-3.5" /> PDF / WhatsApp
                </button>
                <a
                  href={`https://wa.me/${(inv.contact_number || '').replace(/\D/g, '').length === 10 ? `91${(inv.contact_number || '').replace(/\D/g, '')}` : (inv.contact_number || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                    `*BLUEBERRY FARM & RESORT*\nInvoice: ${inv.invoice_number}\nGuest: ${inv.customer_name}\nDate: ${formatDateDisplay(inv.invoice_date)}\nTotal: ${formatINR(inv.grand_total)}\nPaid: ${formatINR(inv.total_amount_paid)}\nBalance Due: ${formatINR(inv.balance_due)}\nThank you for visiting!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  WhatsApp Text
                </a>
                {hasPermission('payments:write') && inv.balance_due > 0 && inv.document_title !== 'CANCELLED INVOICE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayTarget(inv);
                      setPayForm({ amount: inv.balance_due, payment_type: 'Full', payment_method: 'Google Pay', transaction_id: '', notes: '' });
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> Record Payment
                  </button>
                )}
                {user?.role === 'OWNER_ADMIN' && inv.document_title !== 'CANCELLED INVOICE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustTarget(inv);
                      setAdjForm({ adjustment_type: 'Credit Note', reason: '', amount: 0 });
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#E3E8F0] px-3 text-xs font-semibold text-slate-700"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" /> Credit Note / Adjust
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Generate Invoice" maxWidthClass="max-w-3xl">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] p-3">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase text-slate-600">Customer Details</span>
              {!form.booking_id && !form.quotation_id && customers.length > 0 && (
                <div className="inline-flex rounded-lg border border-[#E3E8F0] bg-white p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setCustomerMode('direct')}
                    className={`rounded-md px-2.5 py-1 font-semibold ${customerMode === 'direct' ? 'bg-[#0752A5] text-white' : 'text-slate-600'}`}
                  >
                    Enter Name Directly
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode('existing')}
                    className={`rounded-md px-2.5 py-1 font-semibold ${customerMode === 'existing' ? 'bg-[#0752A5] text-white' : 'text-slate-600'}`}
                  >
                    Select Existing ({customers.length})
                  </button>
                </div>
              )}
            </div>

            {customerMode === 'direct' ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Customer Name *</label>
                    <input
                      required
                      placeholder="Type customer full name (e.g. Rajesh Sharma)"
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Mobile Number (optional)</label>
                    <input
                      type="tel"
                      placeholder="10-digit mobile (optional)"
                      value={form.customer_mobile}
                      onChange={(e) => setForm({ ...form, customer_mobile: e.target.value })}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Address / City (optional)</label>
                    <input
                      placeholder="Optional guest address"
                      value={form.customer_address}
                      onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">GSTIN (optional)</label>
                    <input
                      placeholder="Optional 15-char GSTIN"
                      value={form.customer_gstin}
                      onChange={(e) => setForm({ ...form, customer_gstin: e.target.value.toUpperCase() })}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm uppercase"
                    />
                  </div>
                </div>
                {form.customer_name.trim().length >= 2 &&
                  customers.filter((c) => c.full_name.toLowerCase().includes(form.customer_name.trim().toLowerCase())).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Existing match:</span>
                      {customers
                        .filter((c) => c.full_name.toLowerCase().includes(form.customer_name.trim().toLowerCase()))
                        .slice(0, 3)
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCustomerMode('existing');
                              setForm({ ...form, customer_id: c.id });
                            }}
                            className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-[#0752A5] ring-1 ring-[#D5DEFF] hover:bg-[#D5DEFF]/40"
                          >
                            Use {c.full_name}{c.mobile ? ` (${c.mobile})` : ''}
                          </button>
                        ))}
                    </div>
                  )}
                <p className="text-[11px] text-slate-500">
                  Customer name will be saved automatically in Customer Management after this bill is generated.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Customer *</label>
                <select
                  required
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3"
                >
                  <option value="">-- Select Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}{c.mobile ? ` (${c.mobile})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Invoice Date</label>
              <input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Check In</label>
              <input type="date" value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Check Out</label>
              <input type="date" value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
          </div>

          {packages.length > 0 && (
            <div className="rounded-xl border border-[#D5DEFF] bg-[#D5DEFF]/25 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0752A5]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Quick Package Auto-Fill (Weekday / Weekend Auto-Rate)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <select
                  value={quickPkg.package_id}
                  onChange={(e) => setQuickPkg({ ...quickPkg, package_id: e.target.value })}
                  className="col-span-2 min-h-[38px] rounded-lg border border-[#E3E8F0] bg-white px-2.5 text-xs font-medium sm:col-span-2"
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600">Adults</label>
                  <input type="number" min={0} value={quickPkg.adults} onChange={(e) => setQuickPkg({ ...quickPkg, adults: Number(e.target.value) })} className="min-h-[34px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600">Child 5–10</label>
                  <input type="number" min={0} value={quickPkg.children} onChange={(e) => setQuickPkg({ ...quickPkg, children: Number(e.target.value) })} className="min-h-[34px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600">Infant 1–5</label>
                  <input type="number" min={0} value={quickPkg.infants} onChange={(e) => setQuickPkg({ ...quickPkg, infants: Number(e.target.value) })} className="min-h-[34px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-xs" />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAutoFillPackage()}
                  className="col-span-2 self-end min-h-[36px] rounded-lg bg-[#0752A5] px-3 text-xs font-semibold text-white hover:bg-[#236DC4] sm:col-span-1"
                >
                  Auto-Fill
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase text-slate-500">Bill Items</h4>
              <button
                type="button"
                onClick={() =>
                  setLineItems([...lineItems, { description: '', inclusion_text: '', quantity: 1, rate: 0, unit: 'item', discount: 0, tax_rate: 0 }])
                }
                className="text-xs font-bold text-[#0752A5]"
              >
                + Add Empty Row
              </button>
            </div>
            {lineItems.map((item, idx) => {
              const rowTotal = Math.max(0, (Number(item.quantity) || 0) * (Number(item.rate) || 0) - (Number(item.discount) || 0));
              return (
                <div key={idx} className="space-y-2 rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] p-3">
                  <div className="flex items-center gap-2">
                    <input
                      required
                      placeholder="Item Description (e.g. Stay, Bhaji, Chicken 65)"
                      value={item.description}
                      onChange={(e) => {
                        const c = [...lineItems];
                        c[idx].description = e.target.value;
                        setLineItems(c);
                      }}
                      className="min-h-[40px] flex-1 rounded-lg border border-[#E3E8F0] bg-white px-2.5 text-sm"
                    />
                    <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-[#0752A5] ring-1 ring-[#E3E8F0]">
                      {formatINR(rowTotal)}
                    </span>
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="px-1.5 text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <input
                    placeholder="Optional note / inclusions (e.g. Unlimited Food, Per plate)"
                    value={item.inclusion_text || ''}
                    onChange={(e) => {
                      const c = [...lineItems];
                      c[idx].inclusion_text = e.target.value;
                      setLineItems(c);
                    }}
                    className="min-h-[36px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2.5 text-xs"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Qty</label>
                      <input type="number" min={0} step="any" value={item.quantity} onChange={(e) => { const c = [...lineItems]; c[idx].quantity = Number(e.target.value); setLineItems(c); }} className="min-h-[36px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Rate (₹)</label>
                      <input type="number" min={0} step="any" value={item.rate} onChange={(e) => { const c = [...lineItems]; c[idx].rate = Number(e.target.value); setLineItems(c); }} className="min-h-[36px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Discount (₹)</label>
                      <input type="number" min={0} step="any" value={item.discount} onChange={(e) => { const c = [...lineItems]; c[idx].discount = Number(e.target.value); setLineItems(c); }} className="min-h-[36px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-sm" />
                    </div>
                  </div>
                </div>
              );
            })}

            <MealAddonPicker
              addons={mealAddons}
              onAddItem={handleAddMealOrAddon}
              onSaveAddon={async (addon) => {
                const base = mealAddons.length > 0 ? mealAddons : [];
                const next = [...base, addon];
                await api.put('/settings', { meal_addons: next });
                setMealAddons(next);
                showToast(`Saved "${addon.name}" to quick menu`, 'success');
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold">Paid Now (₹)</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, initial_payment_amount: calcGrandTotal })}
                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  Full Paid ({formatINR(calcGrandTotal)})
                </button>
              </div>
              <input type="number" min={0} step="any" value={form.initial_payment_amount} onChange={(e) => setForm({ ...form, initial_payment_amount: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-3 font-semibold" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Method</label>
              <select value={form.initial_payment_method} onChange={(e) => setForm({ ...form, initial_payment_method: e.target.value })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-3">
                <option value="Google Pay">Google Pay</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="inv-gst" checked={form.apply_gst} onChange={(e) => setForm({ ...form, apply_gst: e.target.checked })} />
              <label htmlFor="inv-gst" className="text-xs font-semibold">
                Apply GST {gstRateTotal > 0 ? `(${gstRateTotal}%)` : '(if enabled)'}
              </label>
            </div>
          </div>

          {/* Live Auto-Calculated Bill Summary */}
          <div className="rounded-xl bg-[#D5DEFF]/45 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>Subtotal: <b>{formatINR(calcSubtotal)}</b></span>
              {calcDiscount > 0 && <span>Discount: <b className="text-rose-700">-{formatINR(calcDiscount)}</b></span>}
              {calcTax > 0 && <span>GST: <b>{formatINR(calcTax)}</b></span>}
              <span>Paid Now: <b className="text-emerald-700">{formatINR(form.initial_payment_amount)}</b></span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-[#D5DEFF] pt-1.5">
              <span className="font-bold text-[#0752A5]">Grand Total: {formatINR(calcGrandTotal)}</span>
              <span className={`font-bold ${calcBalanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                Balance Due: {formatINR(calcBalanceDue)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white">
              {saving ? 'Generating...' : 'Finalize & Generate Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={Boolean(payTarget)} onClose={() => setPayTarget(null)} title={`Record Payment — ${payTarget?.invoice_number || ''}`} maxWidthClass="max-w-md">
        <form onSubmit={handleRecordPayment} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Amount (₹) *</label>
            <input type="number" min={1} step="any" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 font-bold" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Type</label>
              <select value={payForm.payment_type} onChange={(e) => setPayForm({ ...payForm, payment_type: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
                <option value="Full">Full</option>
                <option value="Partial">Partial</option>
                <option value="Advance">Advance</option>
                <option value="Refund">Refund</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Method</label>
              <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
                <option value="Google Pay">Google Pay</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Transaction ID / Reference</label>
            <input value={payForm.transaction_id} onChange={(e) => setPayForm({ ...payForm, transaction_id: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPayTarget(null)} className="min-h-[42px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-semibold text-white">Save Payment</button>
          </div>
        </form>
      </Modal>

      {/* Owner Audited Invoice Adjustment */}
      <Modal open={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} title={`Adjust Invoice — ${adjustTarget?.invoice_number || ''}`} maxWidthClass="max-w-md">
        <form onSubmit={handleAdjustInvoice} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Adjustment Type</label>
            <select value={adjForm.adjustment_type} onChange={(e) => setAdjForm({ ...adjForm, adjustment_type: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Credit Note">Credit Note</option>
              <option value="Correction">Correction</option>
              <option value="Cancellation">Cancellation</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Amount (₹)</label>
            <input type="number" min={0} value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Audit Reason *</label>
            <textarea required rows={2} value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="w-full rounded-xl border border-[#E3E8F0] p-3" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdjustTarget(null)} className="min-h-[42px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[42px] rounded-xl bg-[#0752A5] px-4 font-semibold text-white">Record Adjustment</button>
          </div>
        </form>
      </Modal>

      {pdfTarget && (
        <PdfPreviewModal
          open={Boolean(pdfTarget)}
          onClose={() => setPdfTarget(null)}
          title={`Invoice ${pdfTarget.invoice_number}`}
          pdfApiUrl={`/invoices/${pdfTarget.id}/pdf?download=false`}
          filename={`${pdfTarget.invoice_number}.pdf`}
          customerPhone={pdfTarget.contact_number}
          whatsappMessage={`Hello ${pdfTarget.customer_name}, please find invoice ${pdfTarget.invoice_number} from Blueberry Farm and Resort${pdfTarget.booking_reference ? ` (Ref: ${pdfTarget.booking_reference})` : ''}. Grand Total: ${formatINR(pdfTarget.grand_total)}, Paid: ${formatINR(pdfTarget.total_amount_paid)}, Balance Due: ${formatINR(pdfTarget.balance_due)}.`}
        />
      )}
    </div>
  );
};

