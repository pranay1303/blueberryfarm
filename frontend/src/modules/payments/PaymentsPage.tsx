import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Plus, Search, Share2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateDisplay, formatINR, todayISO } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import type { Booking, Customer, Invoice, PaymentRecord } from '../../types';

export const PaymentsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [saving, setSaving] = useState(false);
  const [pdfTarget, setPdfTarget] = useState<PaymentRecord | null>(null);

  const [form, setForm] = useState({
    customer_id: '',
    booking_id: '',
    invoice_id: '',
    payment_date: todayISO(),
    amount: 0,
    payment_type: 'Advance',
    payment_method: 'Google Pay',
    transaction_id: '',
    payment_reference: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, iRes, bRes] = await Promise.all([
        api.get('/payments', {
          params: {
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(methodFilter !== 'All' ? { payment_method: methodFilter } : {}),
          },
        }),
        api.get('/customers'),
        api.get('/invoices').catch(() => ({ data: { items: [] } })),
        api.get('/bookings').catch(() => ({ data: { items: [] } })),
      ]);
      setPayments(pRes.data.items || []);
      setCustomers(cRes.data.items || []);
      setInvoices(iRes.data.items || []);
      setBookings(bRes.data.items || []);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load payments.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, methodFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) {
      showToast('Select a customer first.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/payments', {
        ...form,
        booking_id: form.booking_id || null,
        invoice_id: form.invoice_id || null,
        transaction_id: form.transaction_id || null,
        payment_reference: form.payment_reference || null,
        notes: form.notes || null,
      });
      showToast('Payment recorded & balances updated.', 'success');
      setFormOpen(false);
      if (searchParams.get('new')) setSearchParams({});
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to record payment.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Payments & Receipts</h1>
          <p className="text-xs text-slate-500">Advance, partial, full settlements, refunds & branded PDF receipts</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('payments:write') && (
            <button
              type="button"
              onClick={() => {
                setForm({
                  customer_id: customers[0]?.id || '',
                  booking_id: '',
                  invoice_id: '',
                  payment_date: todayISO(),
                  amount: 0,
                  payment_type: 'Advance',
                  payment_method: 'Google Pay',
                  transaction_id: '',
                  payment_reference: '',
                  notes: '',
                });
                setFormOpen(true);
              }}
              className="flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" /> Record Payment
            </button>
          )}
          <ClearDataButton section="payments" label="Payments" onCleared={load} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payment ID, receipt no, customer, txn ID..."
            className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] bg-white pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm"
        >
          <option value="All">All Methods</option>
          <option value="Cash">Cash</option>
          <option value="UPI">UPI</option>
          <option value="Google Pay">Google Pay</option>
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Card">Card</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading payments..." />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="No payments recorded yet"
          description="Record advance, partial, or full payments to generate receipts automatically."
        />
      ) : (
        <div className="space-y-2.5">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E3E8F0] bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0752A5]">{p.receipt_number || p.payment_id}</span>
                  <StatusBadge status={p.payment_type} />
                </div>
                <p className="mt-0.5 font-bold text-[#172033]">{p.customer_name}</p>
                <p className="text-xs text-slate-500">
                  {formatDateDisplay(p.payment_date)} • {p.payment_method}
                  {p.transaction_id ? ` • Txn: ${p.transaction_id}` : ''}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className={`text-lg font-bold ${p.payment_type === 'Refund' ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {p.payment_type === 'Refund' ? '-' : ''}{formatINR(p.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => setPdfTarget(p)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#D5DEFF] px-3 text-xs font-bold text-[#0752A5]"
                >
                  <Share2 className="h-3.5 w-3.5" /> Receipt PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Record Payment / Refund">
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold">Customer *</label>
            <select required value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, booking_id: '', invoice_id: '' })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name} ({c.mobile})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Link Invoice (optional)</label>
            <select value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="">None</option>
              {invoices.filter((i) => !form.customer_id || i.customer_id === form.customer_id).map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} (Due: {formatINR(i.balance_due)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Link Booking (optional)</label>
            <select value={form.booking_id} onChange={(e) => setForm({ ...form, booking_id: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="">None</option>
              {bookings.filter((b) => !form.customer_id || b.customer_id === form.customer_id).map((b) => (
                <option key={b.id} value={b.id}>{b.booking_reference} (Due: {formatINR(b.remaining_balance)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Amount (₹) *</label>
            <input type="number" min={1} step="any" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 font-bold" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Date</label>
            <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Type</label>
            <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Advance">Advance</option>
              <option value="Partial">Partial</option>
              <option value="Full">Full</option>
              <option value="Payment">Payment</option>
              <option value="Refund">Refund</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Method</label>
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Google Pay">Google Pay</option>
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Transaction ID</label>
            <input value={form.transaction_id} onChange={(e) => setForm({ ...form, transaction_id: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Reference</label>
            <input value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold">Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={() => setFormOpen(false)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white">
              {saving ? 'Recording...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {pdfTarget && (
        <PdfPreviewModal
          open={Boolean(pdfTarget)}
          onClose={() => setPdfTarget(null)}
          title={`Receipt ${pdfTarget.receipt_number || pdfTarget.payment_id}`}
          pdfApiUrl={`/payments/${pdfTarget.id}/receipt`}
          filename={`${pdfTarget.receipt_number || pdfTarget.payment_id}.pdf`}
          customerPhone={pdfTarget.customer_mobile}
          whatsappMessage={`Hello ${pdfTarget.customer_name || ''}, thank you for your ${pdfTarget.payment_type.toLowerCase()} of ${formatINR(pdfTarget.amount)} via ${pdfTarget.payment_method} at Blueberry Farm and Resort (Receipt: ${pdfTarget.receipt_number || pdfTarget.payment_id}).`}
        />
      )}
    </div>
  );
};

