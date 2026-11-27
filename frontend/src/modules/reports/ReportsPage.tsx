import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { api, fetchBlob } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/format';
import { triggerBlobDownload } from '../../utils/share';
import { LoadingSpinner } from '../../components/UiPrimitives';

const REPORT_TYPES = [
  { value: 'daily_collection', label: 'Daily Collection Report' },
  { value: 'monthly_collection', label: 'Monthly Collection Report' },
  { value: 'bookings', label: 'Booking Report' },
  { value: 'quotations', label: 'Quotation Report' },
  { value: 'invoices', label: 'Invoice Report' },
  { value: 'outstanding_balances', label: 'Outstanding Balance Report' },
  { value: 'expenses', label: 'Expense Report' },
  { value: 'profit_and_loss', label: 'Profit & Loss Summary' },
  { value: 'customers', label: 'Customer Report' },
  { value: 'package_performance', label: 'Package Performance Report' },
];

export const ReportsPage: React.FC = () => {
  const { showToast } = useToast();
  const [reportType, setReportType] = useState('daily_collection');
  const [preset, setPreset] = useState('this_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<{
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
    summary: Record<string, string | number>;
  } | null>(null);

  const load = useCallback(async () => {
    if (preset === 'custom' && (!dateFrom || !dateTo)) return;
    setLoading(true);
    try {
      const res = await api.get(`/reports/${reportType}`, {
        params: {
          preset,
          ...(preset === 'custom' ? { date_from: dateFrom, date_to: dateTo } : {}),
        },
      });
      setReport(res.data);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to generate report.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [reportType, preset, dateFrom, dateTo, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async (fmt: 'pdf' | 'xlsx' | 'json') => {
    try {
      const qs = new URLSearchParams({ format: fmt, preset });
      if (preset === 'custom' && dateFrom && dateTo) {
        qs.set('date_from', dateFrom);
        qs.set('date_to', dateTo);
      }
      const blob = await fetchBlob(`/reports/${reportType}/export?${qs.toString()}`);
      triggerBlobDownload(blob, `${reportType}_report.${fmt}`);
      showToast(`Exported ${fmt.toUpperCase()} report.`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Export failed.'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Business Reports & Exports</h1>
          <p className="text-xs text-slate-500">All figures computed live from authoritative JSON records</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleExport('pdf')} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0752A5] px-3 text-xs font-semibold text-white">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button type="button" onClick={() => void handleExport('xlsx')} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel (.xlsx)
          </button>
          <button type="button" onClick={() => void handleExport('json')} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E3E8F0] bg-white px-3 text-xs font-semibold text-slate-700">
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm font-semibold sm:col-span-2">
          {REPORT_TYPES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-sm">
          <option value="today">Today</option>
          <option value="last_7_days">Last 7 Days</option>
          <option value="this_month">This Month</option>
          <option value="previous_month">Previous Month</option>
          <option value="this_year">This Year</option>
          <option value="all">All Time</option>
          <option value="custom">Custom Range</option>
        </select>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-1.5">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-2 text-xs" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] bg-white px-2 text-xs" />
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSpinner label="Generating report..." />
      ) : report && (
        <div className="space-y-3">
          {Object.keys(report.summary || {}).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.summary).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-[#E3E8F0] bg-white px-3.5 py-2 text-xs">
                  <span className="capitalize text-slate-500">{k.replace(/_/g, ' ')}: </span>
                  <span className="font-bold text-[#0752A5]">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#E3E8F0] bg-white">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-[#E3E8F0] bg-[#0752A5] text-white">
                <tr>
                  {report.columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-3.5 py-3 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E8F0]">
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={report.columns.length} className="px-4 py-8 text-center text-slate-400">
                      No records for the selected period.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-[#F5F7FB]">
                      {row.map((val, cIdx) => (
                        <td key={cIdx} className="whitespace-nowrap px-3.5 py-2.5">{String(val)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

