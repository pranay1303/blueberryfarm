import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Edit2, Eye, Phone, Plus, Search, Users } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateDisplay, formatINR } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import type { Booking, Customer, Invoice, PaymentRecord, Quotation } from '../../types';

const customerSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  mobile: z.string().min(7, 'Valid mobile number is required'),
  whatsapp_number: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pin_code: z.string().optional(),
  company_name: z.string().optional(),
  gstin: z.string().optional(),
  customer_type: z.string().min(1),
  notes: z.string().optional(),
});

type CustomerForm = z.infer<typeof customerSchema>;

export const CustomersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [custType, setCustType] = useState('All');

  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{
    customer: Customer;
    bookings: Booking[];
    quotations: Quotation[];
    invoices: Invoice[];
    payments: PaymentRecord[];
    summary: {
      total_bookings: number;
      total_quotations: number;
      total_invoices: number;
      total_paid: number;
      outstanding_balance: number;
    };
  } | null>(null);

  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { customer_type: 'Individual', state: 'Maharashtra' },
  });

  useUnsavedChanges(formOpen && form.formState.isDirty);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers', {
        params: {
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(custType !== 'All' ? { customer_type: custType } : {}),
        },
      });
      setItems(res.data.items || []);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load customers.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, custType, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.reset({
      full_name: '',
      mobile: '',
      whatsapp_number: '',
      email: '',
      address: '',
      city: '',
      state: 'Maharashtra',
      pin_code: '',
      company_name: '',
      gstin: '',
      customer_type: 'Individual',
      notes: '',
    });
    setFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    form.reset({
      full_name: c.full_name,
      mobile: c.mobile,
      whatsapp_number: c.whatsapp_number || '',
      email: c.email || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || 'Maharashtra',
      pin_code: c.pin_code || '',
      company_name: c.company_name || '',
      gstin: c.gstin || '',
      customer_type: c.customer_type || 'Individual',
      notes: c.notes || '',
    });
    setFormOpen(true);
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await api.get(`/customers/${id}`);
      setDetail(res.data);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load customer history.'), 'error');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const onSubmit = async (values: CustomerForm) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/customers/${editing.id}`, values);
        showToast('Customer updated successfully.', 'success');
      } else {
        await api.post('/customers', values);
        showToast('Customer created successfully.', 'success');
      }
      setFormOpen(false);
      if (searchParams.get('new')) setSearchParams({});
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save customer.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Customers</h1>
          <p className="text-xs text-slate-500">Guest directory, booking history & outstanding balances</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('customers:write') && (
            <button
              type="button"
              onClick={openCreate}
              className="flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </button>
          )}
          <ClearDataButton section="customers" label="Customers" onCleared={load} />
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, city, company..."
            className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] bg-white pl-10 pr-3.5 text-sm outline-none focus:border-[#0752A5]"
          />
        </div>
        <select
          value={custType}
          onChange={(e) => setCustType(e.target.value)}
          className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm font-medium outline-none focus:border-[#0752A5]"
        >
          <option value="All">All Types</option>
          <option value="Individual">Individual</option>
          <option value="Family">Family</option>
          <option value="Corporate">Corporate</option>
          <option value="Agent">Agent</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading customers..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No customers found"
          description="Add your first customer to start creating quotations, bookings, and invoices."
        />
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {items.map((c) => (
              <div key={c.id} className="rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-[#172033]">{c.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {c.customer_id} • {c.customer_type} {c.city ? `• ${c.city}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#D5DEFF]/70 px-2.5 py-0.5 text-xs font-semibold text-[#0752A5]">
                    {c.bookings_count ?? 0} stays
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="h-3.5 w-3.5 text-[#0752A5]" />
                  <span>{c.mobile || '—'}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#E3E8F0] pt-3 text-xs">
                  <div>
                    <span className="text-slate-500">Paid:</span>{' '}
                    <span className="font-bold text-emerald-700">{formatINR(c.total_paid)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Due:</span>{' '}
                    <span className="font-bold text-rose-700">{formatINR(c.outstanding_balance)}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void openDetail(c.id)}
                    className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F5F7FB] text-xs font-semibold text-[#0752A5]"
                  >
                    <Eye className="h-4 w-4" /> History
                  </button>
                  {hasPermission('customers:write') && (
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E3E8F0] text-xs font-semibold text-slate-700"
                    >
                      <Edit2 className="h-4 w-4" /> Edit
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
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Type / City</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                  <th className="px-4 py-3 text-right">Total Paid</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E8F0]">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F5F7FB]/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#172033]">{c.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {c.customer_id} {c.company_name ? `• ${c.company_name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">{c.mobile || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-700">{c.customer_type}</span>
                      {c.city && <p className="text-xs text-slate-400">{c.city}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{c.bookings_count ?? 0}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatINR(c.total_paid)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-700">{formatINR(c.outstanding_balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openDetail(c.id)}
                          className="rounded-lg bg-[#D5DEFF]/60 px-2.5 py-1.5 text-xs font-semibold text-[#0752A5] hover:bg-[#D5DEFF]"
                        >
                          History
                        </button>
                        {hasPermission('customers:write') && (
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="rounded-lg border border-[#E3E8F0] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
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

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Customer' : 'Add New Customer'}
        subtitle="Fields marked with * are required"
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Full Name *</label>
            <input {...form.register('full_name')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            {form.formState.errors.full_name && (
              <p className="mt-1 text-xs text-rose-600">{form.formState.errors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Mobile Number *</label>
            <input {...form.register('mobile')} type="tel" className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            {form.formState.errors.mobile && (
              <p className="mt-1 text-xs text-rose-600">{form.formState.errors.mobile.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">WhatsApp Number</label>
            <input {...form.register('whatsapp_number')} type="tel" className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Email</label>
            <input {...form.register('email')} type="email" className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Customer Type</label>
            <select {...form.register('customer_type')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Individual">Individual</option>
              <option value="Family">Family</option>
              <option value="Corporate">Corporate</option>
              <option value="Agent">Agent</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Address</label>
            <input {...form.register('address')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">City</label>
            <input {...form.register('city')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">State</label>
            <input {...form.register('state')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">PIN Code</label>
            <input {...form.register('pin_code')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Company Name</label>
            <input {...form.register('company_name')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">GSTIN (if applicable)</label>
            <input {...form.register('gstin')} className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] px-3 uppercase" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Notes</label>
            <textarea {...form.register('notes')} rows={2} className="w-full rounded-xl border border-[#E3E8F0] p-3" />
          </div>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white hover:bg-[#236DC4] disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer History Modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.customer.full_name || 'Customer History'}
        subtitle={detail ? `${detail.customer.customer_id} • ${detail.customer.mobile}` : ''}
        maxWidthClass="max-w-3xl"
      >
        {detailLoading || !detail ? (
          <LoadingSpinner label="Loading customer history..." />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl bg-[#F5F7FB] p-3">
                <p className="text-[11px] font-semibold text-slate-500">Bookings</p>
                <p className="text-lg font-bold">{detail.summary.total_bookings}</p>
              </div>
              <div className="rounded-xl bg-[#F5F7FB] p-3">
                <p className="text-[11px] font-semibold text-slate-500">Quotations</p>
                <p className="text-lg font-bold">{detail.summary.total_quotations}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold text-emerald-700">Total Paid</p>
                <p className="text-lg font-bold text-emerald-800">{formatINR(detail.summary.total_paid)}</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-[11px] font-semibold text-rose-700">Outstanding</p>
                <p className="text-lg font-bold text-rose-800">{formatINR(detail.summary.outstanding_balance)}</p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Bookings</h4>
              {detail.bookings.length === 0 ? (
                <p className="text-xs text-slate-400">No bookings yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.bookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2 text-xs">
                      <div>
                        <p className="font-bold">{b.booking_reference} — {b.package_name}</p>
                        <p className="text-slate-500">{formatDateDisplay(b.check_in_date)} to {formatDateDisplay(b.check_out_date)}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={b.booking_status} />
                        <p className="mt-1 font-bold">{formatINR(b.total_booking_amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Invoices & Payments</h4>
              {detail.invoices.length === 0 && detail.payments.length === 0 ? (
                <p className="text-xs text-slate-400">No invoices or payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.invoices.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2 text-xs">
                      <div>
                        <p className="font-bold">{i.invoice_number}</p>
                        <p className="text-slate-500">Date: {formatDateDisplay(i.invoice_date)}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={i.payment_status} />
                        <p className="mt-1 font-bold">{formatINR(i.grand_total)} (Due: {formatINR(i.balance_due)})</p>
                      </div>
                    </div>
                  ))}
                  {detail.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl bg-[#F5F7FB] px-3 py-2 text-xs">
                      <div>
                        <p className="font-bold">{p.payment_id} ({p.payment_type})</p>
                        <p className="text-slate-500">{formatDateDisplay(p.payment_date)} • {p.payment_method}</p>
                      </div>
                      <span className="font-bold text-emerald-700">{formatINR(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

