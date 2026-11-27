import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Loader2,
  PhoneCall,
  Search,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { Badge } from './UiPrimitives';

export const BookingTracker: React.FC<{ initialQuery?: string }> = ({ initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const runTrack = async (rawQuery: string) => {
    const cleanQ = rawQuery.trim();
    if (!cleanQ) {
      setErrorMsg('Please enter your Enquiry Number, Booking Reference, or 10-digit Mobile Number.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/public/track-booking?query=${encodeURIComponent(cleanQ)}`);
      setResult(res.data);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Unable to track booking. Please verify the reference and try again.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    await runTrack(query);
  };

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery.trim());
      void runTrack(initialQuery.trim());
    }
  }, [initialQuery]);

  const getStatusBadgeVariant = (st: string) => {
    switch ((st || '').toUpperCase()) {
      case 'CONFIRMED':
      case 'APPROVED':
      case 'CHECKED_IN':
        return 'success';
      case 'PENDING_REVIEW':
      case 'PENDING':
        return 'warning';
      case 'REJECTED':
      case 'CANCELLED':
        return 'danger';
      default:
        return 'primary';
    }
  };

  const getPaymentBadgeVariant = (ps: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    const s = (ps || '').toUpperCase();
    if (s === 'PAID') return 'success';
    if (s === 'PARTIALLY PAID') return 'warning';
    if (s === 'UNPAID') return 'danger';
    if (s === 'CANCELLED' || s === 'REJECTED') return 'neutral';
    return 'warning';
  };

  const getStepStatus = (stepIndex: number, currentStatus: string, paymentStatus: string = '') => {
    const s = (currentStatus || '').toUpperCase();
    const p = (paymentStatus || '').toUpperCase();
    if (s === 'REJECTED' || s === 'CANCELLED') {
      return stepIndex === 0 ? 'completed' : stepIndex === 1 ? 'rejected' : 'upcoming';
    }
    if (s === 'PENDING_REVIEW' || s === 'PENDING') {
      return stepIndex === 0 ? 'completed' : stepIndex === 1 ? 'current' : 'upcoming';
    }
    if (s === 'APPROVED' || s === 'CONFIRMED') {
      if (p === 'PAID') {
        return 'completed';
      }
      return stepIndex <= 2 ? 'completed' : 'upcoming';
    }
    if (s === 'CHECKED_IN' || s === 'COMPLETED') {
      return 'completed';
    }
    return stepIndex === 0 ? 'completed' : 'upcoming';
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Tracking Form */}
      <form onSubmit={handleTrack} className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-md">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Track Your Stay Enquiry or Confirmed Booking
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              placeholder="Enter Enquiry Code (ENQ-...), Booking Ref, or Mobile..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-[#004AAC] focus:border-[#004AAC] outline-hidden uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl bg-[#004AAC] hover:bg-[#2578E7] active:scale-95 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <span>Track Status</span>
            )}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Example: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">ENQ-2026-1001</code> or enter your 10-digit mobile number.
        </p>
      </form>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Not Found */}
      {searched && !loading && result && !result.found && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
          <HelpCircle className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Booking Record Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">{result.message}</p>
          <div className="pt-2">
            <a
              href="tel:8669408484"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#004AAC] hover:underline"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Need help? Call Resort at +91 86694 08484</span>
            </a>
          </div>
        </div>
      )}

      {/* Result Card */}
      {result && result.found && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden animate-in fade-in-50 duration-300">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-blue-900 via-[#004AAC] to-blue-950 p-6 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-blue-200">
                  {result.type === 'BOOKING' ? 'Confirmed Booking' : 'Submitted Enquiry'}
                </span>
                <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded text-white font-bold">
                  {result.reference}
                </span>
                {result.booking_reference && result.booking_reference !== result.reference && (
                  <span className="text-xs font-mono bg-emerald-500/30 border border-emerald-300/40 px-2 py-0.5 rounded text-emerald-200 font-bold">
                    Booking: {result.booking_reference}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black mt-1">{result.guest_name}</h3>
              <p className="text-xs text-blue-200 mt-0.5">Phone: {result.contact_number}</p>
            </div>

            <div className="text-left sm:text-right">
              <Badge variant={getStatusBadgeVariant(result.booking_status)} className="text-xs px-3 py-1 font-bold">
                {result.booking_status.replace(/_/g, ' ')}
              </Badge>
              {result.package_name && (
                <p className="text-xs text-amber-300 font-semibold mt-1.5">{result.package_name}</p>
              )}
            </div>
          </div>

          {/* Progress Timeline */}
          <div className="p-6 border-b border-slate-100 bg-slate-50/60">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-4">
              Booking Stay Milestones
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-2 text-center text-xs">
              {[
                { title: 'Enquiry Received', desc: 'Received online' },
                { title: 'Dates Review', desc: 'Manager checking' },
                { title: 'Booking Confirmed', desc: 'Advance & Room' },
                { title: 'Check-In Ready', desc: 'Welcome to Farm' },
              ].map((step, idx) => {
                const stepState = getStepStatus(idx, result.booking_status, result.payment_status);
                return (
                  <div key={idx} className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 transition-colors ${
                        stepState === 'completed'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : stepState === 'current'
                          ? 'bg-amber-500 text-white animate-pulse'
                          : stepState === 'rejected'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {stepState === 'completed' ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : stepState === 'rejected' ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span
                      className={`font-bold leading-tight block ${
                        stepState === 'completed'
                          ? 'text-emerald-800'
                          : stepState === 'current'
                          ? 'text-amber-800'
                          : stepState === 'rejected'
                          ? 'text-rose-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {step.title}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">{step.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-800 uppercase tracking-wider block text-[11px]">
                Stay Schedule
              </span>
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-slate-500">Check-in:</span>
                <span className="font-bold">{formatDate(result.check_in_date)} ({result.check_in_time})</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-slate-500">Check-out:</span>
                <span className="font-bold">{formatDate(result.check_out_date)} ({result.check_out_time})</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-slate-500">Total Guests:</span>
                <span className="font-bold">{result.total_guests} Guests ({result.adults} Adults, {result.children} Kids)</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-800 uppercase tracking-wider block text-[11px]">
                Payment Status
              </span>
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-slate-500">Payment Status:</span>
                <Badge variant={getPaymentBadgeVariant(result.payment_status)} className="font-bold">
                  {result.payment_status}
                </Badge>
              </div>
              {result.total_amount > 0 ? (
                <>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-500">Total Stay Tariff:</span>
                    <span className="font-bold">{formatCurrency(result.total_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-500">Advance Paid:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(result.advance_paid)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 pt-1 border-t border-slate-200">
                    <span className="text-slate-700 font-bold">Balance at Check-in:</span>
                    <span className={`font-black ${result.remaining_balance <= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                      {result.remaining_balance <= 0 ? '₹0 (Fully Paid)' : formatCurrency(result.remaining_balance)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-500 italic pt-1">
                  {result.booking_status === 'APPROVED' || result.booking_status === 'Confirmed'
                    ? 'Payment due upon check-in or booking confirmation.'
                    : 'Tariff and payment details confirmed after enquiry review.'}
                </div>
              )}
            </div>
          </div>

          {/* Action / Help Footer */}
          <div className="p-4 bg-blue-50/70 border-t border-blue-100 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-slate-600 text-center sm:text-left">
              Questions regarding this stay? Contact resort management anytime.
            </span>
            <a
              href={`tel:${result.resort_phone || '8669408484'}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#004AAC] text-white font-bold hover:bg-[#2578E7] transition-all"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call +91 86694 08484</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingTracker;
