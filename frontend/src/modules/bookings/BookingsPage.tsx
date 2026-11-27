import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Calculator, Edit2, Plus, Receipt, Search, XCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateDisplay, formatINR, todayISO } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import type { Booking, Customer, PackageItem } from '../../types';

const BOOKING_STATUSES = [
  'Enquiry',
  'Quotation Sent',
  'Awaiting Confirmation',
  'Confirmed',
  'Checked In',
  'Checked Out',
  'Cancelled',
];

export const BookingsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<'all' | 'upcoming_checkins' | 'upcoming_checkouts'>('all');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('All');
  const [payFilter, setPayFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  const [form, setForm] = useState({
    customer_id: '',
    check_in_date: todayISO(),
    check_out_date: todayISO(),
    check_in_time: '12:00 PM',
    check_out_time: '10:00 AM',
    package_id: '',
    package_name: '24-Hour Stay Package',
    adults: 2,
    children: 0,
    infants: 0,
    rooms: 1,
    dormitory_guests: 0,
    special_requests: '',
    food_requirements: '',
    additional_services: '',
    booking_source: 'Direct',
    booking_status: 'Confirmed',
    total_booking_amount: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, cRes, pRes] = await Promise.all([
        api.get('/bookings', {
          params: {
            ...(view !== 'all' ? { view } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(statusFilter !== 'All' ? { booking_status: statusFilter } : {}),
            ...(payFilter !== 'All' ? { payment_status: payFilter } : {}),
            ...(dateFrom ? { date_from: dateFrom } : {}),
            ...(dateTo ? { date_to: dateTo } : {}),
          },
        }),
        api.get('/customers'),
        api.get('/packages', { params: { active_only: true } }),
      ]);
      setBookings(bRes.data.items || []);
      setCustomers(cRes.data.items || []);
      setPackages(pRes.data.items || []);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load bookings.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [view, search, statusFilter, payFilter, dateFrom, dateTo, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    const firstPkg = packages[0];
    setForm({
      customer_id: customers[0]?.id || '',
      check_in_date: todayISO(),
      check_out_date: todayISO(),
      check_in_time: firstPkg?.check_in_policy || '12:00 PM',
      check_out_time: firstPkg?.check_out_policy || '10:00 AM',
      package_id: firstPkg?.id || '',
      package_name: firstPkg?.name || 'Custom Stay',
      adults: 2,
      children: 0,
      infants: 0,
      rooms: 1,
      dormitory_guests: 0,
      special_requests: '',
      food_requirements: '',
      additional_services: '',
      booking_source: 'Direct',
      booking_status: 'Confirmed',
      total_booking_amount: firstPkg ? firstPkg.weekday_rate * 2 : 0,
    });
    setFormOpen(true);
  };

  const openEdit = (b: Booking) => {
    setEditing(b);
    setForm({
      customer_id: b.customer_id,
      check_in_date: b.check_in_date,
      check_out_date: b.check_out_date,
      check_in_time: b.check_in_time,
      check_out_time: b.check_out_time,
      package_id: b.package_id || '',
      package_name: b.package_name,
      adults: b.adults,
      children: b.children,
      infants: b.infants,
      rooms: b.rooms,
      dormitory_guests: b.dormitory_guests,
      special_requests: b.special_requests || '',
      food_requirements: b.food_requirements || '',
      additional_services: b.additional_services || '',
      booking_source: b.booking_source,
      booking_status: b.booking_status,
      total_booking_amount: b.total_booking_amount,
    });
    setFormOpen(true);
  };

  const autoCalculateRate = async () => {
    if (!form.package_id) return;
    try {
      const res = await api.post('/packages/quote', {
        package_id: form.package_id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        infants: form.infants,
      });
      setForm((prev) => ({
        ...prev,
        total_booking_amount: res.data.quote.total_package_amount,
        package_name: res.data.package.name,
      }));
      showToast('Package rate calculated from Pricing Master.', 'info');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Could not calculate package rate.'), 'error');
    }
  };

  const saveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !form.customer_id) {
      showToast('Please select or create a customer first.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/bookings/${editing.id}`, {
          ...form,
          package_id: form.package_id || null,
        });
        showToast('Booking updated.', 'success');
      } else {
        await api.post('/bookings', {
          ...form,
          package_id: form.package_id || null,
        });
        showToast('Booking created successfully.', 'success');
      }
      setFormOpen(false);
      if (searchParams.get('new')) setSearchParams({});
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save booking.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.post(`/bookings/${cancelTarget.id}/cancel`);
      showToast(`Booking ${cancelTarget.booking_reference} cancelled.`, 'info');
      setCancelTarget(null);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to cancel booking.'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Bookings</h1>
          <p className="text-xs text-slate-500">Manage enquiries, confirmations, check-ins & check-outs</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('bookings:write') && (
            <button
              type="button"
              onClick={openCreate}
              className="flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" />
              New Booking
            </button>
          )}
          <ClearDataButton section="bookings" label="Bookings" onCleared={load} />
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'All Bookings' },
          { key: 'upcoming_checkins', label: 'Upcoming Check-ins' },
          { key: 'upcoming_checkouts', label: 'Upcoming Check-outs' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key as typeof view)}
            className={`min-h-[40px] shrink-0 rounded-xl px-3.5 text-xs font-semibold ${
              view === t.key ? 'bg-[#0752A5] text-white' : 'border border-[#E3E8F0] bg-white text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, guest, phone..."
            className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] bg-white pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
        >
          <option value="All">All Statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={payFilter}
          onChange={(e) => setPayFilter(e.target.value)}
          className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
        >
          <option value="All">All Payments</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Refunded">Refunded</option>
        </select>
        <div className="grid grid-cols-2 gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-2 text-xs" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-2 text-xs" />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading bookings..." />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-6 w-6" />}
          title="No bookings match"
          description="Create a new booking or convert an accepted quotation."
        />
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#0752A5]">{b.booking_reference}</p>
                    <p className="text-base font-bold text-[#172033]">{b.customer_name}</p>
                    <p className="text-xs text-slate-500">{b.package_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={b.booking_status} />
                    <StatusBadge status={b.payment_status} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F5F7FB] p-2.5 text-xs">
                  <div>
                    <span className="text-slate-500">Check-in:</span>{' '}
                    <span className="font-semibold">{formatDateDisplay(b.check_in_date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Check-out:</span>{' '}
                    <span className="font-semibold">{formatDateDisplay(b.check_out_date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Guests:</span>{' '}
                    <span className="font-semibold">{b.adults}A {b.children}C {b.infants}I</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Balance:</span>{' '}
                    <span className="font-bold text-rose-700">{formatINR(b.remaining_balance)}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {hasPermission('bookings:write') && (
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      className="flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-xl border border-[#E3E8F0] text-xs font-semibold"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                  {hasPermission('invoices:write') && !b.invoice_id && b.booking_status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/invoices?fromBooking=${b.id}`)}
                      className="flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-xl bg-[#0752A5] text-xs font-semibold text-white"
                    >
                      <Receipt className="h-3.5 w-3.5" /> Invoice
                    </button>
                  )}
                  {hasPermission('invoices:read') && b.invoice_id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/invoices?search=${encodeURIComponent(b.invoice_number || b.booking_reference)}`)}
                      className="flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      title={b.invoice_number ? `Invoice: ${b.invoice_number}` : 'View Invoice'}
                    >
                      <Receipt className="h-3.5 w-3.5" /> View Inv
                    </button>
                  )}
                  {hasPermission('bookings:write') && b.booking_status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(b)}
                      className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl bg-rose-50 px-3 text-xs font-semibold text-rose-700"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-[#E3E8F0] bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E3E8F0] bg-[#F5F7FB] text-xs font-bold uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3">Ref / Guest</th>
                  <th className="px-4 py-3">Stay Dates</th>
                  <th className="px-4 py-3">Package & Guests</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total / Balance</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E8F0]">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#0752A5]">{b.booking_reference}</p>
                      <p className="font-semibold text-[#172033]">{b.customer_name}</p>
                      <p className="text-xs text-slate-500">{b.contact_number}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-semibold">{formatDateDisplay(b.check_in_date)}</p>
                      <p className="text-slate-500">to {formatDateDisplay(b.check_out_date)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-semibold">{b.package_name}</p>
                      <p className="text-slate-500">
                        {b.adults} Adults, {b.children} Child, {b.infants} Inf • {b.rooms} Rooms
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={b.booking_status} />
                        <StatusBadge status={b.payment_status} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      <p className="font-bold text-[#172033]">{formatINR(b.total_booking_amount)}</p>
                      <p className="font-semibold text-rose-700">Due: {formatINR(b.remaining_balance)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        {hasPermission('bookings:write') && (
                          <button
                            type="button"
                            onClick={() => openEdit(b)}
                            className="rounded-lg border border-[#E3E8F0] px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        )}
                        {hasPermission('invoices:write') && !b.invoice_id && b.booking_status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices?fromBooking=${b.id}`)}
                            className="rounded-lg bg-[#0752A5] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#236DC4]"
                          >
                            Invoice
                          </button>
                        )}
                        {hasPermission('invoices:read') && b.invoice_id && (
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices?search=${encodeURIComponent(b.invoice_number || b.booking_reference)}`)}
                            className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            title={b.invoice_number ? `Invoice: ${b.invoice_number}` : 'View Invoice'}
                          >
                            View Inv
                          </button>
                        )}
                        {hasPermission('bookings:write') && b.booking_status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(b)}
                            className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create / Edit Booking Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Booking ${editing.booking_reference}` : 'Create New Booking'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={saveBooking} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editing && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">Customer *</label>
              <select
                required
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3"
              >
                <option value="">-- Select Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.mobile})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Check-in Date *</label>
            <input type="date" required value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Check-out Date *</label>
            <input type="date" required value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Package</label>
            <select
              value={form.package_id}
              onChange={(e) => {
                const pkg = packages.find((p) => p.id === e.target.value);
                setForm({
                  ...form,
                  package_id: e.target.value,
                  package_name: pkg?.name || 'Custom Stay',
                  check_in_time: pkg?.check_in_policy || form.check_in_time,
                  check_out_time: pkg?.check_out_policy || form.check_out_time,
                });
              }}
              className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3"
            >
              <option value="">Custom Stay</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Booking Status</label>
            <select
              value={form.booking_status}
              onChange={(e) => setForm({ ...form, booking_status: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3"
            >
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Adults</label>
              <input type="number" min={0} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Child (5–10y)</label>
              <input type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Infant (1–5y)</label>
              <input type="number" min={0} value={form.infants} onChange={(e) => setForm({ ...form, infants: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Rooms</label>
            <input type="number" min={0} value={form.rooms} onChange={(e) => setForm({ ...form, rooms: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Booking Source</label>
            <select value={form.booking_source} onChange={(e) => setForm({ ...form, booking_source: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Direct">Direct</option>
              <option value="Phone">Phone</option>
              <option value="Website">Website</option>
              <option value="Referral">Referral</option>
              <option value="Agent">Agent</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Total Booking Amount (₹) *</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                required
                value={form.total_booking_amount}
                onChange={(e) => setForm({ ...form, total_booking_amount: Number(e.target.value) })}
                className="min-h-[44px] flex-1 rounded-xl border border-[#E3E8F0] px-3 font-bold"
              />
              {form.package_id && (
                <button
                  type="button"
                  onClick={() => void autoCalculateRate()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#D5DEFF] px-3 text-xs font-bold text-[#0752A5]"
                >
                  <Calculator className="h-4 w-4" /> Auto-Quote
                </button>
              )}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Food Requirements & Special Requests</label>
            <textarea
              rows={2}
              value={form.special_requests}
              onChange={(e) => setForm({ ...form, special_requests: e.target.value })}
              className="w-full rounded-xl border border-[#E3E8F0] p-3"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={() => setFormOpen(false)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Booking'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Booking"
        message={`Are you sure you want to cancel booking ${cancelTarget?.booking_reference} for ${cancelTarget?.customer_name}?`}
        confirmLabel="Cancel Booking"
        danger
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
};

