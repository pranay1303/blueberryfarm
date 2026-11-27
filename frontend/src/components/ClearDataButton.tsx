import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../utils/format';
import { ConfirmDialog } from './Modal';

interface ClearDataButtonProps {
  section: string; // 'bookings' | 'enquiries' | 'vehicles' | 'invoices' | 'quotations' | 'customers' | 'expenses'
  label: string; // e.g. "Bookings", "Enquiries", "Vehicles", "Invoices & Bills", "Quotations", "Customers", "Expenses"
  onCleared?: () => void | Promise<void>;
  className?: string;
}

export const ClearDataButton: React.FC<ClearDataButtonProps> = ({
  section,
  label,
  onCleared,
  className = '',
}) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  if (user?.role !== 'OWNER_ADMIN') {
    return null;
  }

  const handleClear = async () => {
    setLoading(true);
    try {
      const res = await api.post('/storage/clear', { section });
      showToast(
        `Cleared ${res.data?.cleared_count ?? 'all'} ${label.toLowerCase()} record(s). Automatic pre-clear safety backup created.`,
        'success'
      );
      setOpen(false);
      if (onCleared) {
        await onCleared();
      }
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Clear all ${label.toLowerCase()} data`}
        className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors shadow-xs shrink-0 cursor-pointer ${className}`}
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
        <span>Clear Data</span>
      </button>

      <ConfirmDialog
        open={open}
        title={`Clear All ${label} Data?`}
        message={`Are you sure you want to delete all ${label.toLowerCase()} records? An automatic pre-clear safety backup of the database will be created first.`}
        confirmLabel={loading ? 'Clearing...' : 'Yes, Clear Data'}
        danger={true}
        loading={loading}
        onConfirm={handleClear}
        onCancel={() => setOpen(false)}
      />
    </>
  );
};
