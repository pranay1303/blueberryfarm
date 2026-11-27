import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  RotateCcw,
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/format';

interface CalendarDayDetails {
  date: string;
  day: number;
  is_past: boolean;
  status: 'PAST' | 'AVAILABLE' | 'TENTATIVE' | 'BOOKED';
  bookings: Array<{
    id: string;
    booking_reference: string;
    customer_name: string;
    customer_mobile: string;
    check_in_date: string;
    check_out_date: string;
    package_name: string;
    adults: number;
    children: number;
    infants: number;
    total_guests: number;
    booking_status: string;
    payment_status: string;
    total_amount: number;
    balance_due: number;
    special_requests: string;
  }>;
  enquiries: Array<{
    id: string;
    enquiry_reference: string;
    customer_name: string;
    customer_mobile: string;
    check_in_date: string;
    check_out_date: string;
    package_name: string;
    total_guests: number;
    occasion: string;
    notes: string;
    status: string;
  }>;
  quotations: Array<{
    id: string;
    quotation_number: string;
    customer_name: string;
    customer_mobile: string;
    check_in_date: string;
    check_out_date: string;
    package_name: string;
    total_guests: number;
    grand_total: number;
    status: string;
  }>;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1); // 1-12
  const [loading, setLoading] = useState(true);
  const [daysData, setDaysData] = useState<Record<string, CalendarDayDetails>>({});
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return now.toISOString().split('T')[0];
  });

  const fetchMonthCalendar = async (year: number, month: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/bookings/calendar/month?year=${year}&month=${month}`);
      const days = res.data.days || {};
      setDaysData(days);

      // If selectedDate is not in this month or not set, default to today or 1st of month
      const todayStr = new Date().toISOString().split('T')[0];
      const targetMonthStr = `${year}-${String(month).padStart(2, '0')}`;
      if (!selectedDate || !selectedDate.startsWith(targetMonthStr)) {
        if (todayStr.startsWith(targetMonthStr)) {
          setSelectedDate(todayStr);
        } else {
          setSelectedDate(`${targetMonthStr}-01`);
        }
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to load stay calendar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMonthCalendar(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
    setSelectedDate(today.toISOString().split('T')[0]);
  };

  // Build grid matrix
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sun
  const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const leadingEmptyCells = Array.from({ length: firstDayOfWeek });
  const monthDays = Array.from({ length: totalDaysInMonth }, (_, i) => i + 1);

  const selectedDayInfo = selectedDate ? daysData[selectedDate] : null;

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const calculateNextDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#172033] flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0752A5] text-white shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <span>Resort Stay Calendar</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time visual reservation availability, booked dates, tentative enquiries, and direct stay coordination.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-xs text-xs font-semibold text-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#EF4444]" />
            <span>Booked</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#F59E0B]" />
            <span>May be Booked</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#00C853]" />
            <span>Available</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-slate-300" />
            <span>Past Dates</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Calendar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Monthly Calendar View */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          {/* Month Header Navigation */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-[#0752A5] active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl sm:text-2xl font-black text-[#1B4332] tracking-tight flex items-center gap-2">
                <span>{MONTH_NAMES[currentMonth - 1]} {currentYear}</span>
                {loading && <Loader2 className="w-4 h-4 text-[#0752A5] animate-spin" />}
              </h2>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next Month"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-[#0752A5] active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleJumpToToday}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Today</span>
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-2 sm:gap-3 mb-2 text-center">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-xs sm:text-sm font-bold text-slate-600 uppercase tracking-wider py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-2 sm:gap-3">
            {/* Leading empty spaces */}
            {leadingEmptyCells.map((_, idx) => (
              <div key={`empty-${idx}`} className="h-12 sm:h-16 rounded-xl sm:rounded-2xl bg-transparent" />
            ))}

            {/* Month Day Tiles */}
            {monthDays.map((dayNum) => {
              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayInfo = daysData[dateStr];
              const isPast = dayInfo ? dayInfo.is_past : false;
              const status = dayInfo ? dayInfo.status : isPast ? 'PAST' : 'AVAILABLE';
              const isSelected = selectedDate === dateStr;

              // Color mapping
              let bgClasses = 'bg-[#00C853] text-white hover:bg-[#00b34a]'; // Available
              if (isPast) {
                bgClasses = 'bg-[#E9ECEF] text-slate-400 cursor-not-allowed opacity-90';
              } else if (status === 'BOOKED') {
                bgClasses = 'bg-[#EF4444] text-white hover:bg-[#dc2626]'; // Red
              } else if (status === 'TENTATIVE') {
                bgClasses = 'bg-[#F59E0B] text-white hover:bg-[#d97706]'; // Amber
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isPast}
                  onClick={() => !isPast && setSelectedDate(dateStr)}
                  className={`relative flex flex-col items-center justify-center h-12 sm:h-16 rounded-xl sm:rounded-2xl text-base sm:text-lg font-bold transition-all ${bgClasses} ${
                    isSelected ? 'ring-4 ring-[#0752A5] ring-offset-2 scale-105 z-10 shadow-lg' : 'shadow-xs'
                  } ${!isPast ? 'cursor-pointer active:scale-95' : ''}`}
                >
                  <span>{dayNum}</span>
                  {/* Subtle dot indicator on mobile */}
                  {!isPast && status === 'BOOKED' && (
                    <span className="hidden sm:block text-[9px] font-extrabold uppercase tracking-widest opacity-90 mt-0.5">
                      Booked
                    </span>
                  )}
                  {!isPast && status === 'TENTATIVE' && (
                    <span className="hidden sm:block text-[9px] font-extrabold uppercase tracking-widest opacity-90 mt-0.5">
                      May Be
                    </span>
                  )}
                  {!isPast && status === 'AVAILABLE' && (
                    <span className="hidden sm:block text-[9px] font-extrabold uppercase tracking-widest opacity-90 mt-0.5">
                      Open
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Booking Information Details Sidebar */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-5">
          <div>
            <h2 className="text-xl font-black text-[#172033] tracking-tight">Booking Information</h2>
            <p className="text-xs text-slate-500 mt-0.5">Click any date to view details.</p>
          </div>

          {/* Status Display Card */}
          {selectedDayInfo?.status === 'AVAILABLE' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-emerald-800 text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>This date is available.</span>
            </div>
          )}

          {selectedDayInfo?.status === 'BOOKED' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>This date has confirmed booking(s).</span>
            </div>
          )}

          {selectedDayInfo?.status === 'TENTATIVE' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-800 text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Tentative stay requested (Enquiry / Quotation).</span>
            </div>
          )}

          {selectedDayInfo?.status === 'PAST' && (
            <div className="rounded-xl border border-slate-200 bg-slate-100 p-3.5 text-slate-600 text-sm font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400 shrink-0" />
              <span>Past date — check-in closed.</span>
            </div>
          )}

          {/* Details Section */}
          <div className="space-y-4 pt-1">
            {/* Status Pill */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Status</p>
              {selectedDayInfo?.status === 'AVAILABLE' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-black text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Available
                </span>
              )}
              {selectedDayInfo?.status === 'BOOKED' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3.5 py-1 text-xs font-black text-rose-800">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Booked (Confirmed)
                </span>
              )}
              {selectedDayInfo?.status === 'TENTATIVE' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-1 text-xs font-black text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  May be Booked
                </span>
              )}
              {selectedDayInfo?.status === 'PAST' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3.5 py-1 text-xs font-black text-slate-700">
                  Past Date
                </span>
              )}
            </div>

            {/* Check-In Date */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0752A5]">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Check In</p>
                <p className="text-sm font-bold text-slate-900">{formatDateDisplay(selectedDate)}</p>
              </div>
            </div>

            {/* Check-Out Date */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0752A5]">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Check Out</p>
                <p className="text-sm font-bold text-slate-900">
                  {formatDateDisplay(
                    selectedDayInfo?.bookings?.[0]?.check_out_date ||
                      selectedDayInfo?.enquiries?.[0]?.check_out_date ||
                      calculateNextDate(selectedDate)
                  )}
                </p>
              </div>
            </div>

            {/* Bookings Details Breakdown (if booked) */}
            {selectedDayInfo?.bookings && selectedDayInfo.bookings.length > 0 && (
              <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3.5 space-y-3">
                <p className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Confirmed Stay Details ({selectedDayInfo.bookings.length})</span>
                </p>
                {selectedDayInfo.bookings.map((b) => (
                  <div key={b.id} className="rounded-lg bg-white p-3 border border-rose-100 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#0752A5]">{b.booking_reference}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {b.payment_status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-800 font-semibold">{b.customer_name}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>Mob: {b.customer_mobile || 'N/A'}</span>
                      <span>•</span>
                      <span>{b.total_guests} Guests ({b.adults}A, {b.children}C)</span>
                    </div>
                    <div className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded-md font-medium">
                      📦 {b.package_name}
                    </div>
                    {b.special_requests && (
                      <p className="text-[11px] text-slate-500 italic">Notes: "{b.special_requests}"</p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/bookings')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0752A5] hover:underline pt-1 cursor-pointer"
                    >
                      <span>View in Bookings Manager</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Enquiries / Quotations Breakdown (if tentative) */}
            {selectedDayInfo?.status === 'TENTATIVE' && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3.5 space-y-3">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Pending Requests ({selectedDayInfo.enquiries.length + selectedDayInfo.quotations.length})</span>
                </p>
                {selectedDayInfo.enquiries.map((enq) => (
                  <div key={enq.id} className="rounded-lg bg-white p-3 border border-amber-100 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-amber-800">{enq.enquiry_reference}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        {enq.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">{enq.customer_name} ({enq.customer_mobile})</p>
                    <p className="text-[11px] text-slate-500">{enq.total_guests} Guests • {enq.occasion || 'Leisure'}</p>
                    <button
                      type="button"
                      onClick={() => navigate('/enquiries')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0752A5] hover:underline pt-1 cursor-pointer"
                    >
                      <span>Review in Booking Enquiries</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {selectedDayInfo.quotations.map((q) => (
                  <div key={q.id} className="rounded-lg bg-white p-3 border border-amber-100 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#0752A5]">{q.quotation_number}</span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                        Quote: {q.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">{q.customer_name} ({q.customer_mobile})</p>
                    <p className="text-[11px] text-slate-500">Total: {formatCurrency(q.grand_total)}</p>
                    <button
                      type="button"
                      onClick={() => navigate('/quotations')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0752A5] hover:underline pt-1 cursor-pointer"
                    >
                      <span>View in Quotations</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Remark */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Remark</p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  {selectedDayInfo?.status === 'AVAILABLE'
                    ? 'No Remarks. Ready for direct reservations.'
                    : selectedDayInfo?.status === 'BOOKED'
                    ? 'Confirmed stay reserved in resort cottages.'
                    : selectedDayInfo?.status === 'TENTATIVE'
                    ? 'Enquiry under staff review or quote issued.'
                    : 'Past date.'}
                </p>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Quick Action Button for Available dates */}
          {selectedDayInfo?.status === 'AVAILABLE' && (
            <button
              type="button"
              onClick={() => navigate('/bookings')}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#00C853] hover:bg-[#00b34a] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Booking for {formatDateDisplay(selectedDate)}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
