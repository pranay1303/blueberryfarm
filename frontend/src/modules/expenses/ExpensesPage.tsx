import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Paperclip, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { api, fetchBlob } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateDisplay, formatINR, todayISO } from '../../utils/format';
import { triggerBlobDownload } from '../../utils/share';
import { EmptyState, LoadingSpinner } from '../../components/UiPrimitives';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import type { ExpenseRecord } from '../../types';

const EXPENSE_CATEGORIES = [
  'Food and groceries',
  'Staff salaries',
  'Electricity',
  'Water',
  'Maintenance',
  'Cleaning',
  'Marketing',
  'Transportation',
  'Repairs',
  'Supplies',
  'Other expenses',
];

export const ExpensesPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [byCategory, setByCategory] = useState<Array<{ category: string; amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');

  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ExpenseRecord | null>(null);

  const [form, setForm] = useState({
    expense_date: todayISO(),
    category: 'Food and groceries',
    description: '',
    vendor: '',
    amount: 0,
    payment_method: 'Cash',
    notes: '',
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/expenses', {
        params: {
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(catFilter !== 'All' ? { category: catFilter } : {}),
        },
      });
      setExpenses(res.data.items || []);
      setTotalAmount(res.data.total_amount || 0);
      setByCategory(res.data.by_category || []);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load expenses.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, catFilter, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/expenses', form);
      const created = res.data.expense as ExpenseRecord;
      if (receiptFile) {
        const fd = new FormData();
        fd.append('file', receiptFile);
        await api.post(`/expenses/${created.id}/receipt`, fd);
      }
      showToast('Expense recorded.', 'success');
      setFormOpen(false);
      setReceiptFile(null);
      setForm({
        expense_date: todayISO(),
        category: 'Food and groceries',
        description: '',
        vendor: '',
        amount: 0,
        payment_method: 'Cash',
        notes: '',
      });
      if (searchParams.get('new')) setSearchParams({});
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save expense.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await api.delete(`/expenses/${archiveTarget.id}`);
      showToast('Expense archived.', 'info');
      setArchiveTarget(null);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to archive expense.'), 'error');
    }
  };

  const handleDownloadReceipt = async (expense: ExpenseRecord) => {
    try {
      const blob = await fetchBlob(`/expenses/${expense.id}/receipt`);
      const filename =
        expense.receipt_attachment?.split(/[/\\]/).pop() || `${expense.expense_id}-bill`;
      triggerBlobDownload(blob, filename);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download receipt bill.'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Expenses</h1>
          <p className="text-xs text-slate-500">Total filtered expenses: <span className="font-bold text-rose-700">{formatINR(totalAmount)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('expenses:write') && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </button>
          )}
          <ClearDataButton section="expenses" label="Expenses" onCleared={load} />
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {byCategory.map((c) => (
            <div key={c.category} className="shrink-0 rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 text-xs">
              <span className="text-slate-500">{c.category}:</span>{' '}
              <span className="font-bold text-[#172033]">{formatINR(c.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, vendor..." className="min-h-[44px] w-full rounded-xl border border-[#E3E8F0] bg-white pl-10 pr-3 text-sm" />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm">
          <option value="All">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading expenses..." />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No expenses recorded"
          description="Log resort operational expenses to calculate true operating profit."
        />
      ) : (
        <div className="space-y-2.5">
          {expenses.map((e) => (
            <div key={e.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-[#E3E8F0] bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0752A5]">{e.expense_id}</span>
                  <span className="rounded-full bg-[#F5F7FB] px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{e.category}</span>
                </div>
                <p className="mt-0.5 font-bold text-[#172033]">{e.description}</p>
                <p className="text-xs text-slate-500">
                  {formatDateDisplay(e.expense_date)} • {e.payment_method}
                  {e.vendor ? ` • Vendor: ${e.vendor}` : ''}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="text-lg font-bold text-rose-700">{formatINR(e.amount)}</span>
                {(e.has_receipt || e.receipt_attachment) && (
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt(e)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E3E8F0] px-2.5 text-xs font-semibold text-[#0752A5] hover:bg-blue-50"
                  >
                    <Paperclip className="h-3.5 w-3.5" /> Bill
                  </button>
                )}
                {hasPermission('expenses:write') && (
                  <button
                    type="button"
                    onClick={() => setArchiveTarget(e)}
                    className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add Expense">
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold text-slate-500">Quick 1-Tap Presets:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { desc: 'Vegetables & Groceries', cat: 'Food and groceries' },
                { desc: 'Chicken / Meat', cat: 'Food and groceries' },
                { desc: 'Milk & Dairy', cat: 'Food and groceries' },
                { desc: 'Electricity Bill', cat: 'Electricity' },
                { desc: 'Cleaning Supplies', cat: 'Cleaning' },
                { desc: 'Staff Wages', cat: 'Staff salaries' },
                { desc: 'Diesel / Generator', cat: 'Maintenance' },
              ].map((p) => (
                <button
                  key={p.desc}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, description: p.desc, category: p.cat }))}
                  className="rounded-full border border-blue-200 bg-blue-50/60 px-2.5 py-0.5 text-[11px] font-medium text-[#0752A5] hover:bg-blue-100"
                >
                  + {p.desc}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Date *</label>
            <input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Category *</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold">Description *</label>
            <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Amount (₹) *</label>
            <input type="number" min={1} step="any" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 font-bold" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Payment Method</label>
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Google Pay">Google Pay</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Vendor</label>
            <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Receipt Attachment (optional)</label>
            <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] p-1.5 text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={() => setFormOpen(false)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white">
              {saving ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive Expense"
        message={`Archive expense ${archiveTarget?.expense_id} (${archiveTarget?.description})?`}
        confirmLabel="Archive"
        danger
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
};
