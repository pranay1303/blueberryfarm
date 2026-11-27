import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, FileText, Receipt, Search, Users } from 'lucide-react';
import { api } from '../services/api';
import type { Booking, Customer, Invoice, Quotation } from '../types';
import { Modal } from './Modal';
import { StatusBadge } from './UiPrimitives';

export const GlobalSearchModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    customers: Customer[];
    bookings: Booking[];
    quotations: Quotation[];
    invoices: Invoice[];
  }>({ customers: [], bookings: [], quotations: [], invoices: [] });

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const q = query.trim();
    if (!q) {
      setResults({ customers: [], bookings: [], quotations: [], invoices: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/search', { params: { q } });
        setResults(res.data);
      } catch {
        // ignore transient search errors
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const hasAny =
    results.customers.length +
      results.bookings.length +
      results.quotations.length +
      results.invoices.length >
    0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Global Search"
      subtitle="Search by customer name, phone, booking ref, quotation no, or invoice no"
      maxWidthClass="max-w-xl"
    >
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type name, mobile, BFR-0001, QTN-0001, INV-0001..."
          className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] pl-11 pr-4 text-base outline-none focus:border-[#0752A5] focus:bg-white"
        />
      </div>

      <div className="mt-4 space-y-4">
        {loading && <p className="text-center text-sm text-slate-500">Searching...</p>}
        {!loading && query.trim() && !hasAny && (
          <p className="py-6 text-center text-sm text-slate-500">No matching records found.</p>
        )}

        {results.customers.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Users className="h-3.5 w-3.5" /> Customers
            </h4>
            <div className="space-y-1.5">
              {results.customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => go(`/customers?search=${encodeURIComponent(c.full_name)}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-left hover:bg-[#F5F7FB]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#172033]">{c.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {c.customer_id} • {c.mobile}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {results.bookings.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <CalendarCheck className="h-3.5 w-3.5" /> Bookings
            </h4>
            <div className="space-y-1.5">
              {results.bookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => go(`/bookings?search=${encodeURIComponent(b.booking_reference)}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-left hover:bg-[#F5F7FB]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#172033]">
                      {b.booking_reference} — {b.customer_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Check-in: {b.check_in_date} • {b.package_name}
                    </p>
                  </div>
                  <StatusBadge status={b.booking_status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {results.quotations.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <FileText className="h-3.5 w-3.5" /> Quotations
            </h4>
            <div className="space-y-1.5">
              {results.quotations.map((qt) => (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() => go(`/quotations?search=${encodeURIComponent(qt.quotation_number)}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-left hover:bg-[#F5F7FB]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#172033]">
                      {qt.quotation_number} — {qt.customer_name}
                    </p>
                    <p className="text-xs text-slate-500">Date: {qt.quotation_date}</p>
                  </div>
                  <StatusBadge status={qt.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {results.invoices.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Receipt className="h-3.5 w-3.5" /> Invoices
            </h4>
            <div className="space-y-1.5">
              {results.invoices.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => go(`/invoices?search=${encodeURIComponent(inv.invoice_number)}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2.5 text-left hover:bg-[#F5F7FB]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#172033]">
                      {inv.invoice_number} — {inv.customer_name}
                    </p>
                    <p className="text-xs text-slate-500">Date: {inv.invoice_date}</p>
                  </div>
                  <StatusBadge status={inv.payment_status} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

