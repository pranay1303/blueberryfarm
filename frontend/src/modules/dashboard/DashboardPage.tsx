import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarCheck,
  Car,
  CreditCard,
  FileText,
  IndianRupee,
  LogIn,
  MessageSquare,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../services/api';
import { extractErrorMessage, formatDateDisplay, formatINR } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import type { Booking } from '../../types';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'previous_month', label: 'Previous Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

const PIE_COLORS = ['#0752A5', '#236DC4', '#10B981', '#F59E0B', '#EF4444', '#6366F1'];

interface DashboardResponse {
  kpis: Record<string, number>;
  charts: {
    monthly_series: Array<{
      label: string;
      collected_revenue: number;
      invoiced_revenue: number;
      expenses: number;
      profit: number;
      bookings: number;
    }>;
    payment_status_distribution: Array<{ name: string; value: number }>;
    package_popularity: Array<{ name: string; bookings: number; revenue: number }>;
    expense_breakdown: Array<{ category: string; amount: number }>;
  };
  upcoming_checkins: Booking[];
  upcoming_checkouts: Booking[];
  recent_activity: Array<{
    type: string;
    title: string;
    subtitle: string;
    amount: number;
    timestamp: string;
  }>;
  insights: string[];
}

export const DashboardPage: React.FC = () => {
  const [preset, setPreset] = useState('this_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (preset === 'custom' && (!dateFrom || !dateTo)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/dashboard', {
        params: {
          preset,
          ...(preset === 'custom' ? { date_from: dateFrom, date_to: dateTo } : {}),
        },
      });
      setData(res.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [preset, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = data?.kpis ?? {};

  const kpiCards = [
    { label: 'Total Bookings', value: String(kpis.total_bookings ?? 0), sub: `Today: ${kpis.todays_bookings ?? 0}`, icon: CalendarCheck, tone: 'blue' },
    { label: 'Confirmed Bookings', value: String(kpis.confirmed_bookings ?? 0), sub: `Quotations: ${kpis.total_quotations ?? 0}`, icon: FileText, tone: 'blue' },
    { label: 'Upcoming Check-ins', value: String(kpis.upcoming_checkins_count ?? 0), sub: `Check-outs: ${kpis.upcoming_checkouts_count ?? 0}`, icon: LogIn, tone: 'emerald' },
    { label: 'Total Invoices', value: String(kpis.total_invoices ?? 0), sub: `Invoiced: ${formatINR(kpis.total_invoiced_revenue)}`, icon: IndianRupee, tone: 'blue' },
    { label: 'Collected Revenue', value: formatINR(kpis.total_collected_revenue), sub: `This month: ${formatINR(kpis.monthly_revenue)}`, icon: CreditCard, tone: 'emerald' },
    { label: 'Pending Payments', value: formatINR(kpis.pending_balances), sub: 'Outstanding receivables', icon: Wallet, tone: 'amber' },
    { label: 'Total Booking Enquiries', value: String(kpis.total_enquiries ?? 0), sub: `Pending review: ${kpis.pending_enquiries ?? 0}`, icon: MessageSquare, tone: 'indigo' },
    { label: 'Guest Vehicles', value: String(kpis.total_vehicles ?? 0), sub: 'Registered at resort gate', icon: Car, tone: 'purple' },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Date Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033] sm:text-2xl">Resort Dashboard</h1>
          <p className="text-xs text-slate-500 sm:text-sm">Live operational & financial metrics from Blueberry JSON records</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm font-medium outline-none focus:border-[#0752A5]"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-2.5 text-sm"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[#E3E8F0] bg-white px-2.5 text-sm"
              />
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      )}

      {/* Minimal Quick Actions */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Link
          to="/invoices?new=1"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0752A5] px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#236DC4]"
        >
          + Quick Bill / Invoice
        </Link>
        <Link
          to="/bookings?new=1"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 text-xs font-bold text-[#0752A5] hover:bg-[#F5F7FB]"
        >
          + New Booking
        </Link>
        <Link
          to="/quotations?new=1"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 text-xs font-bold text-[#0752A5] hover:bg-[#F5F7FB]"
        >
          + New Quotation
        </Link>
        <Link
          to="/enquiries"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 text-xs font-bold text-[#0752A5] hover:bg-[#F5F7FB]"
        >
          View Enquiries
        </Link>
      </div>

      {loading && !data ? (
        <LoadingSpinner label="Calculating dashboard metrics..." />
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpiCards.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="rounded-2xl border border-[#E3E8F0] bg-white p-3.5 shadow-xs sm:p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">{c.label}</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D5DEFF]/60 text-[#0752A5]">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-2 truncate text-lg font-bold text-[#172033] sm:text-2xl">{c.value}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{c.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Factual Insights */}
          {data && data.insights.length > 0 && (
            <div className="rounded-2xl border border-[#236DC4]/25 bg-[#D5DEFF]/35 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#0752A5]">Operational Summary</h2>
              <ul className="mt-2 space-y-1 text-sm text-[#172033]">
                {data.insights.map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Revenue Trend Line Chart */}
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-[#172033]">Revenue Trend (Collected vs Invoiced)</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.charts.monthly_series || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="collected_revenue" name="Collected" stroke="#0752A5" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="invoiced_revenue" name="Invoiced" stroke="#236DC4" strokeDasharray="4 4" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly Booking Bar Chart */}
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-[#172033]">Monthly Bookings</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.charts.monthly_series || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="bookings" name="Bookings" fill="#0752A5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Payment Status & Package Popularity */}
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-[#172033]">Payment Status Distribution</h3>
              {data?.charts.payment_status_distribution.length ? (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.charts.payment_status_distribution}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={80}
                        label
                      >
                        {data.charts.payment_status_distribution.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-slate-400">No bookings in this period yet.</p>
              )}
            </div>

            {/* Package Popularity & Expense Breakdown */}
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-[#172033]">Package Popularity & Expense Breakdown</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Top Packages</p>
                  {data?.charts.package_popularity.length ? (
                    <ul className="space-y-2">
                      {data.charts.package_popularity.slice(0, 5).map((p) => (
                        <li key={p.name} className="flex items-center justify-between rounded-xl bg-[#F5F7FB] px-3 py-2 text-xs">
                          <span className="truncate font-semibold">{p.name}</span>
                          <span className="ml-2 shrink-0 text-[#0752A5] font-bold">{p.bookings}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">No package bookings yet.</p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Top Expenses</p>
                  {data?.charts.expense_breakdown.length ? (
                    <ul className="space-y-2">
                      {data.charts.expense_breakdown.slice(0, 5).map((e) => (
                        <li key={e.category} className="flex items-center justify-between rounded-xl bg-[#F5F7FB] px-3 py-2 text-xs">
                          <span className="truncate font-semibold">{e.category}</span>
                          <span className="ml-2 shrink-0 font-bold text-rose-700">{formatINR(e.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">No expenses recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Check-ins / Check-outs & Recent Activity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#172033]">Upcoming Check-ins & Check-outs (7 Days)</h3>
                <Link to="/bookings" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0752A5]">
                  View All <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {data && (data.upcoming_checkins.length > 0 || data.upcoming_checkouts.length > 0) ? (
                <div className="space-y-2">
                  {data.upcoming_checkins.map((b) => (
                    <div key={`in-${b.id}`} className="flex items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold">{b.customer_name}</p>
                        <p className="text-xs text-slate-500">
                          Check-in: {formatDateDisplay(b.check_in_date)} • {b.booking_reference}
                        </p>
                      </div>
                      <StatusBadge status={b.booking_status} />
                    </div>
                  ))}
                  {data.upcoming_checkouts.map((b) => (
                    <div key={`out-${b.id}`} className="flex items-center justify-between rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold">{b.customer_name}</p>
                        <p className="text-xs text-slate-500">
                          Check-out: {formatDateDisplay(b.check_out_date)} • Balance: {formatINR(b.remaining_balance)}
                        </p>
                      </div>
                      <StatusBadge status={b.payment_status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Users className="h-6 w-6" />}
                  title="No upcoming arrivals or departures"
                  description="Bookings scheduled for the next 7 days will appear here automatically."
                />
              )}
            </div>

            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-[#172033]">Recent Customer Activity</h3>
              {data && data.recent_activity.length > 0 ? (
                <div className="space-y-2">
                  {data.recent_activity.map((act, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl border border-[#E3E8F0] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{act.title}</p>
                        <p className="truncate text-xs text-slate-500">{act.subtitle}</p>
                      </div>
                      <span className="ml-2 shrink-0 text-sm font-bold text-[#0752A5]">{formatINR(act.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<CalendarCheck className="h-6 w-6" />}
                  title="No activity yet"
                  description="Create your first customer, booking, or quotation to start tracking resort activity."
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

