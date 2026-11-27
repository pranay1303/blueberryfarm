import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Copy, Edit2, FileText, Plus, Receipt, Search, Share2, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateDisplay, formatINR, todayISO } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import { MealAddonPicker, type MealAddonPreset } from '../../components/MealAddonPicker';
import type { Customer, LineItem, PackageItem, Quotation } from '../../types';

export const QuotationsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [mealAddons, setMealAddons] = useState<MealAddonPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [customerMode, setCustomerMode] = useState<'direct' | 'existing'>('direct');

  const [pdfTarget, setPdfTarget] = useState<Quotation | null>(null);

  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    customer_mobile: '',
    customer_address: '',
    customer_gstin: '',
    package_id: '',
    package_name: '',
    check_in_date: todayISO(),
    check_out_date: todayISO(),
    adults: 4,
    children: 0,
    infants: 0,
    rooms: 1,
    special_requirements: '',
    additional_charges: 0,
    advance_required: 0,
    apply_gst: false,
    status: 'Draft',
    terms_and_conditions: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '24-Hour Stay Package', inclusion_text: '', quantity: 4, rate: 1800, unit: 'person', discount: 0, tax_rate: 0 },
  ]);
  const [previewTotals, setPreviewTotals] = useState<{
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, cRes, pRes, sRes] = await Promise.all([
        api.get('/quotations', {
          params: {
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(statusFilter !== 'All' ? { status_filter: statusFilter } : {}),
          },
        }),
        api.get('/customers'),
        api.get('/packages', { params: { active_only: true } }),
        api.get('/settings').catch(() => ({ data: { settings: {} } })),
      ]);
      setQuotations(qRes.data.items || []);
      setCustomers(cRes.data.items || []);
      setPackages(pRes.data.items || []);
      if (Array.isArray(sRes.data?.settings?.meal_addons)) {
        setMealAddons(sRes.data.settings.meal_addons);
      }
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load quotations.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recalculate totals via authoritative backend whenever line items change
  useEffect(() => {
    if (!formOpen || lineItems.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/quotations/calculate', {
          customer_id: customerMode === 'existing' ? form.customer_id : undefined,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          line_items: lineItems,
          additional_charges: form.additional_charges,
          apply_gst: form.apply_gst,
        });
        setPreviewTotals(res.data.totals);
      } catch {
        const sub = lineItems.reduce((acc, it) => acc + (it.quantity * it.rate), 0);
        setPreviewTotals({
          subtotal: sub,
          discount_total: 0,
          tax_total: 0,
          grand_total: sub + Number(form.additional_charges || 0),
        });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [formOpen, customerMode, form.customer_id, form.check_in_date, form.check_out_date, form.additional_charges, form.apply_gst, lineItems]);

  const openCreate = () => {
    setEditing(null);
    setCustomerMode(customers.length > 0 ? 'existing' : 'direct');
    const firstPkg = packages[0];
    setForm({
      customer_id: customers[0]?.id || '',
      customer_name: '',
      customer_mobile: '',
      customer_address: '',
      customer_gstin: '',
      package_id: firstPkg?.id || '',
      package_name: firstPkg?.name || '',
      check_in_date: todayISO(),
      check_out_date: todayISO(),
      adults: 4,
      children: 0,
      infants: 0,
      rooms: 1,
      special_requirements: '',
      additional_charges: 0,
      advance_required: 0,
      apply_gst: false,
      status: 'Draft',
      terms_and_conditions: '',
    });
    setLineItems([
      {
        description: firstPkg?.name || 'Stay Package',
        inclusion_text: firstPkg?.included_meals ? `Stay includes ${firstPkg.included_meals}.` : '',
        quantity: 4,
        rate: firstPkg?.weekday_rate ?? 1800,
        unit: 'person',
        discount: 0,
        tax_rate: 0,
      },
    ]);
    setFormOpen(true);
  };

  const openEdit = (q: Quotation) => {
    setEditing(q);
    setCustomerMode('existing');
    setForm({
      customer_id: q.customer_id,
      customer_name: q.customer_name || '',
      customer_mobile: q.customer_mobile || '',
      customer_address: q.customer_address || '',
      customer_gstin: '',
      package_id: q.package_id || '',
      package_name: q.package_name || '',
      check_in_date: q.check_in_date,
      check_out_date: q.check_out_date,
      adults: q.adults,
      children: q.children,
      infants: q.infants,
      rooms: q.rooms,
      special_requirements: q.special_requirements || '',
      additional_charges: q.additional_charges || 0,
      advance_required: q.advance_required || 0,
      apply_gst: q.tax_total > 0,
      status: q.status,
      terms_and_conditions: q.terms_and_conditions || '',
    });
    setLineItems(q.line_items.map((i) => ({ ...i })));
    setFormOpen(true);
  };

  const autoFillFromPackage = async () => {
    if (!form.package_id) {
      showToast('Please select a package first.', 'error');
      return;
    }
    try {
      const res = await api.post('/packages/quote', {
        package_id: form.package_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        infants: form.infants,
      });
      const pkg = res.data.package || packages.find((p) => p.id === form.package_id);
      const q = res.data.quote || {};
      const adultRate = q.effective_adult_rate ?? pkg?.weekday_rate ?? 1800;
      const childRate = q.effective_child_rate ?? pkg?.child_price ?? 1200;
      const infantRate = q.effective_infant_rate ?? 0;
      const items: LineItem[] = [];
      if (form.adults > 0) {
        items.push({
          description: `${pkg?.name || 'Stay Package'} (Adults)`,
          inclusion_text: pkg?.included_meals ? `Stay includes ${pkg.included_meals}.` : '',
          quantity: form.adults,
          rate: adultRate,
          unit: 'person',
          discount: 0,
          tax_rate: 0,
        });
      }
      if (form.children > 0) {
        items.push({
          description: 'Children (Age 5–10)',
          inclusion_text: '',
          quantity: form.children,
          rate: childRate,
          unit: 'child',
          discount: 0,
          tax_rate: 0,
        });
      }
      if (form.infants > 0) {
        items.push({
          description: 'Infants (Age 1–5) — Complimentary',
          inclusion_text: '',
          quantity: form.infants,
          rate: infantRate,
          unit: 'infant',
          discount: 0,
          tax_rate: 0,
        });
      }
      if (items.length) {
        setLineItems(items);
        showToast('Line items auto-filled from package rates.', 'success');
      }
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to auto-fill from package.'), 'error');
    }
  };

  const saveQuotation = async (e: React.FormEvent) => {
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
      if (editing) {
        await api.put(`/quotations/${editing.id}`, {
          ...form,
          customer_id: customerMode === 'existing' ? form.customer_id : undefined,
          customer_name: customerMode === 'direct' ? form.customer_name.trim() : undefined,
          customer_mobile: customerMode === 'direct' ? (form.customer_mobile.trim() || undefined) : undefined,
          customer_address: customerMode === 'direct' ? (form.customer_address.trim() || undefined) : undefined,
          package_id: form.package_id || null,
          line_items: lineItems,
        });
        showToast('Quotation updated successfully.', 'success');
      } else {
        await api.post('/quotations', {
          ...form,
          customer_id: customerMode === 'existing' ? form.customer_id : null,
          customer_name: customerMode === 'direct' ? form.customer_name.trim() : null,
          customer_mobile: customerMode === 'direct' ? (form.customer_mobile.trim() || null) : null,
          customer_address: customerMode === 'direct' ? (form.customer_address.trim() || null) : null,
          customer_gstin: customerMode === 'direct' ? (form.customer_gstin.trim() || null) : null,
          package_id: form.package_id || null,
          line_items: lineItems,
        });
        showToast('Quotation created successfully.', 'success');
      }
      setFormOpen(false);
      if (searchParams.get('new')) setSearchParams({});
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save quotation.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (q: Quotation) => {
    if (busyId) return;
    setBusyId(q.id);
    try {
      await api.post(`/quotations/${q.id}/duplicate`);
      showToast('Quotation duplicated.', 'success');
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to duplicate quotation.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConvertToBooking = async (q: Quotation) => {
    if (busyId) return;
    setBusyId(q.id);
    try {
      const res = await api.post(`/quotations/${q.id}/convert-to-booking`);
      showToast(res.data.message || `Converted to Booking ${res.data.booking.booking_reference}`, 'success');
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to convert to booking.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Quotations</h1>
          <p className="text-xs text-slate-500">Blueberry-branded quotes with PDF export, WhatsApp share & 1-click conversion</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('quotations:write') && (
            <button
              type="button"
              onClick={openCreate}
              className="flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" />
              New Quotation
            </button>
          )}
          <ClearDataButton section="quotations" label="Quotations" onCleared={load} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotation no, customer, mobile..."
            className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] bg-white pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
        >
          <option value="All">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="Converted">Converted</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading quotations..." />
      ) : quotations.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No quotations found"
          description="Create your first professional Blueberry Farm & Resort quotation."
        />
      ) : (
        <div className="space-y-3">
          {quotations.map((q) => (
            <div key={q.id} className="rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#0752A5]">{q.quotation_number}</span>
                    <StatusBadge status={q.status} />
                  </div>
                  <p className="mt-0.5 text-base font-bold text-[#172033]">{q.customer_name}</p>
                  <p className="text-xs text-slate-500">
                    Stay: {formatDateDisplay(q.check_in_date)} to {formatDateDisplay(q.check_out_date)} • Valid until {formatDateDisplay(q.valid_until)}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-lg font-bold text-[#172033]">{formatINR(q.grand_total)}</p>
                  <p className="text-xs text-slate-500">{q.adults} Adults, {q.children} Child</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E3E8F0] pt-3">
                <button
                  type="button"
                  onClick={() => setPdfTarget(q)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0752A5] px-3 text-xs font-semibold text-white"
                >
                  <Share2 className="h-3.5 w-3.5" /> PDF / WhatsApp
                </button>
                {hasPermission('quotations:write') && (
                  <>
                    {q.status !== 'Converted' && (
                      <button
                        type="button"
                        onClick={() => openEdit(q)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#E3E8F0] px-3 text-xs font-semibold"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => void handleDuplicate(q)}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#E3E8F0] px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </button>
                  </>
                )}
                {hasPermission('bookings:write') && q.status !== 'Rejected' && (
                  (q.status === 'Converted' || Boolean(q.converted_booking_id || q.booking_id)) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const term = q.booking_reference || q.customer_name || q.quotation_number;
                        navigate(`/admin/bookings?search=${encodeURIComponent(term)}`);
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-sm"
                      title={q.booking_reference ? `Linked Booking: ${q.booking_reference} (Click to view)` : 'Quotation converted to booking (Click to view)'}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Converted to Booking
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => void handleConvertToBooking(q)}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <CalendarCheck className="h-3.5 w-3.5" /> {busyId === q.id ? 'Converting...' : 'Convert to Booking'}
                    </button>
                  )
                )}
                {hasPermission('invoices:write') && q.status !== 'Rejected' && !q.converted_invoice_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/invoices?fromQuotation=${q.id}`)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-[#D5DEFF] px-3 text-xs font-semibold text-[#0752A5]"
                  >
                    <Receipt className="h-3.5 w-3.5" /> Create Invoice
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quotation Builder Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.quotation_number}` : 'New Quotation'}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={saveQuotation} className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-[#E3E8F0] bg-slate-50/50 p-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Customer Details *</label>
              {!editing && (
                <div className="flex gap-1 rounded-lg border border-[#E3E8F0] bg-white p-0.5 text-xs">
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
              <div className="space-y-2">
                <input
                  required
                  placeholder="Customer Full Name * (e.g. Rajesh Patil)"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Mobile Number (10 digits)"
                    value={form.customer_mobile}
                    onChange={(e) => setForm({ ...form, customer_mobile: e.target.value })}
                    className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
                  />
                  <input
                    placeholder="City / Address (Optional)"
                    value={form.customer_address}
                    onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                    className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
                  />
                </div>
              </div>
            ) : (
              <select
                required
                disabled={Boolean(editing)}
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
              >
                <option value="">-- Select Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.mobile})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Accepted">Accepted</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Check-in *</label>
              <input type="date" required value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Check-out *</label>
              <input type="date" required value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div className="grid grid-cols-4 gap-2 sm:col-span-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Adults</label>
                <input type="number" min={0} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-2.5" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Child 5–10</label>
                <input type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-2.5" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Infant 1–5</label>
                <input type="number" min={0} value={form.infants} onChange={(e) => setForm({ ...form, infants: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-2.5" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Rooms</label>
                <input type="number" min={0} value={form.rooms} onChange={(e) => setForm({ ...form, rooms: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-2.5" />
              </div>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Package Preset</label>
                <select
                  value={form.package_id}
                  onChange={(e) => {
                    const p = packages.find((x) => x.id === e.target.value);
                    setForm({ ...form, package_id: e.target.value, package_name: p?.name || '' });
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
                >
                  <option value="">Custom</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {form.package_id && (
                <button
                  type="button"
                  onClick={() => void autoFillFromPackage()}
                  className="min-h-[42px] rounded-xl bg-[#D5DEFF] px-3.5 text-xs font-bold text-[#0752A5]"
                >
                  Auto-Fill Line Items
                </button>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase text-slate-500">Line Items</h4>
              <button
                type="button"
                onClick={() =>
                  setLineItems([
                    ...lineItems,
                    { description: '', inclusion_text: '', quantity: 1, rate: 0, unit: 'item', discount: 0, tax_rate: 0 },
                  ])
                }
                className="text-xs font-bold text-[#0752A5]"
              >
                + Add Line Item
              </button>
            </div>
            {lineItems.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    required
                    placeholder="Description (e.g. One Day Staycation)"
                    value={item.description}
                    onChange={(e) => {
                      const copy = [...lineItems];
                      copy[idx].description = e.target.value;
                      setLineItems(copy);
                    }}
                    className="min-h-[40px] flex-1 rounded-lg border border-[#E3E8F0] bg-white px-2.5 text-sm"
                  />
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                      className="rounded-lg px-2 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input
                  placeholder="Inclusion note (e.g. Stay includes Breakfast, Lunch, HiTea, Dinner)"
                  value={item.inclusion_text || ''}
                  onChange={(e) => {
                    const copy = [...lineItems];
                    copy[idx].inclusion_text = e.target.value;
                    setLineItems(copy);
                  }}
                  className="min-h-[38px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2.5 text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Qty</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].quantity = Number(e.target.value);
                        setLineItems(copy);
                      }}
                      className="min-h-[38px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Rate (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.rate}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].rate = Number(e.target.value);
                        setLineItems(copy);
                      }}
                      className="min-h-[38px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500">Discount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.discount}
                      onChange={(e) => {
                        const copy = [...lineItems];
                        copy[idx].discount = Number(e.target.value);
                        setLineItems(copy);
                      }}
                      className="min-h-[38px] w-full rounded-lg border border-[#E3E8F0] bg-white px-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}

            <MealAddonPicker
              addons={mealAddons}
              onAddItem={(newItem) =>
                setLineItems((prev) => {
                  const idx = prev.findIndex(
                    (x) => x.description.trim().toLowerCase() === newItem.description.trim().toLowerCase() && Number(x.rate) === Number(newItem.rate)
                  );
                  if (idx >= 0) {
                    return prev.map((x, i) => (i === idx ? { ...x, quantity: Number(x.quantity) + Number(newItem.quantity) } : x));
                  }
                  return [...prev, { ...newItem, discount: 0, tax_rate: 0 }];
                })
              }
              onSaveAddon={async (addon) => {
                const next = [...mealAddons, addon];
                await api.put('/settings', { meal_addons: next });
                setMealAddons(next);
                showToast(`Saved "${addon.name}" to quick menu`, 'success');
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Additional Charges (₹)</label>
              <input type="number" min={0} value={form.additional_charges} onChange={(e) => setForm({ ...form, additional_charges: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Advance Required (₹)</label>
              <input type="number" min={0} value={form.advance_required} onChange={(e) => setForm({ ...form, advance_required: Number(e.target.value) })} className="min-h-[40px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="qt-gst" checked={form.apply_gst} onChange={(e) => setForm({ ...form, apply_gst: e.target.checked })} />
              <label htmlFor="qt-gst" className="text-xs font-semibold">Apply configured GST (if enabled)</label>
            </div>
          </div>

          {previewTotals && (
            <div className="rounded-xl bg-[#D5DEFF]/45 p-3 text-right text-sm">
              <span className="text-slate-600">Subtotal: {formatINR(previewTotals.subtotal)}</span>
              {previewTotals.discount_total > 0 && <span className="ml-3 text-slate-600">Discount: -{formatINR(previewTotals.discount_total)}</span>}
              {previewTotals.tax_total > 0 && <span className="ml-3 text-slate-600">Tax: {formatINR(previewTotals.tax_total)}</span>}
              <span className="ml-4 text-base font-bold text-[#0752A5]">Grand Total: {formatINR(previewTotals.grand_total)}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white">
              {saving ? 'Saving...' : 'Save Quotation'}
            </button>
          </div>
        </form>
      </Modal>

      {pdfTarget && (
        <PdfPreviewModal
          open={Boolean(pdfTarget)}
          onClose={() => setPdfTarget(null)}
          title={`Quotation ${pdfTarget.quotation_number}`}
          pdfApiUrl={`/quotations/${pdfTarget.id}/pdf?download=false`}
          filename={`${pdfTarget.quotation_number}.pdf`}
          customerPhone={pdfTarget.customer_mobile}
          whatsappMessage={`Hello ${pdfTarget.customer_name}, please find your quotation ${pdfTarget.quotation_number} from Blueberry Farm and Resort for ${formatDateDisplay(pdfTarget.check_in_date)} to ${formatDateDisplay(pdfTarget.check_out_date)}. Total: ${formatINR(pdfTarget.grand_total)}.`}
        />
      )}
    </div>
  );
};

