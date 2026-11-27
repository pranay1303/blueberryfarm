import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, QrCode, Save, Trash2, Upload } from 'lucide-react';
import { api } from '../../services/api';
import { exportFullJsonBackup, importFullJsonBackup } from '../../services/localDb';
import { generateUpiQrDataUrl } from '../../services/pdfGenerator';
import defaultSigUrl from '../../assets/signature.png';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/format';
import { LoadingSpinner } from '../../components/UiPrimitives';
import { ConfirmDialog } from '../../components/Modal';
import type { ResortSettings } from '../../types';

export const SettingsPage: React.FC = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<ResortSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearDemoOpen, setClearDemoOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings');
      setSettings(res.data.settings);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load settings.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const upi = settings?.payment_info?.upi_id || '';
    const payee = settings?.payment_info?.account_name || settings?.business_name || 'Blueberry Farm and Resort';
    if (!upi.trim()) {
      setQrPreview(null);
      return;
    }
    let active = true;
    generateUpiQrDataUrl(upi, payee).then((url) => {
      if (active) setQrPreview(url);
    });
    return () => {
      active = false;
    };
  }, [settings?.payment_info?.upi_id, settings?.payment_info?.account_name, settings?.business_name]);

  const handleExportJson = () => {
    const { filename, content } = exportFullJsonBackup();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported JSON backup: ${filename}`, 'success');
  };

  const handleImportJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      importFullJsonBackup(text);
      showToast('JSON backup imported successfully! Reloading settings...', 'success');
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Invalid JSON backup file.'), 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await api.put('/settings', settings);
      setSettings(res.data.settings);
      showToast('Resort & GST settings saved.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save settings.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureUpload = async (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post('/settings/signature', fd);
      showToast('Authorized signature image uploaded.', 'success');
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to upload signature.'), 'error');
    }
  };

  const handleRemoveSignature = async () => {
    try {
      await api.delete('/settings/signature');
      showToast('Signature image removed.', 'info');
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to remove signature.'), 'error');
    }
  };

  const handleLoadDemo = async () => {
    try {
      await api.post('/settings/demo-data');
      showToast('DEMO dataset loaded (clearly marked DEMO).', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load demo data.'), 'error');
    }
  };

  const handleClearDemo = async () => {
    try {
      await api.delete('/settings/demo-data');
      showToast('All DEMO records cleared safely.', 'info');
      setClearDemoOpen(false);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to clear demo data.'), 'error');
    }
  };

  if (loading || !settings) return <LoadingSpinner label="Loading settings..." />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#172033]">Resort, Tax & Document Settings</h1>
        <p className="text-xs text-slate-500">All invoice branding, email, payment info & GST configuration is editable here</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Business Details */}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#0752A5]">Business Profile (Printed on PDFs)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Business Name</label>
              <input value={settings.business_name} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Phone</label>
              <input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Website</label>
              <input value={settings.website} onChange={(e) => setSettings({ ...settings, website: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Footer Email (Editable)</label>
              <input value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold">Header Address Line</label>
              <input value={settings.address_line} onChange={(e) => setSettings({ ...settings, address_line: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
          </div>
        </div>

        {/* Payment, Bank & UPI QR Details */}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0752A5]">Bank Account & UPI QR Details (Printed on Quotations & Invoices)</h2>
              <p className="text-xs text-slate-500">All fields below & a live scannable UPI QR Code are printed automatically on every Quotation and Invoice PDF</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2">
              <div>
                <label className="mb-1 block text-xs font-semibold">Bank Name</label>
                <input
                  value={settings.payment_info.bank_name || ''}
                  placeholder="e.g. State Bank of India"
                  onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, bank_name: e.target.value } })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Account Holder Name</label>
                <input
                  value={settings.payment_info.account_name || ''}
                  placeholder="e.g. Blueberry Farm and Resort"
                  onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, account_name: e.target.value } })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Bank Account Number</label>
                <input
                  value={settings.payment_info.account_number || ''}
                  placeholder="Enter Bank Account Number"
                  onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, account_number: e.target.value } })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">IFSC Code</label>
                <input
                  value={settings.payment_info.ifsc_code || ''}
                  placeholder="e.g. SBIN0001234"
                  onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, ifsc_code: e.target.value.toUpperCase() } })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">UPI ID (Generates QR Code)</label>
                <input
                  value={settings.payment_info.upi_id || ''}
                  placeholder="e.g. 8669408484@ybl or blueberry@okaxis"
                  onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, upi_id: e.target.value } })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">GPay / PhonePe Number</label>
                <input
                  value={settings.payment_info.gpay_number || ''}
                  placeholder="e.g. 8669408484"
                  onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, gpay_number: e.target.value } })}
                  className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3"
                />
              </div>
            </div>

            {/* Live UPI QR Preview */}
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-[#F5F7FB] p-4 text-center">
              {qrPreview ? (
                <>
                  <img src={qrPreview} alt="UPI Payment QR Code" className="h-32 w-32 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs" />
                  <p className="mt-2 text-xs font-bold text-[#0752A5]">Live Scannable UPI QR</p>
                  <p className="text-[11px] text-slate-500 break-all">{settings.payment_info.upi_id}</p>
                </>
              ) : (
                <div className="py-4 text-slate-400">
                  <QrCode className="mx-auto h-10 w-10 mb-1.5 opacity-60" />
                  <p className="text-xs font-semibold">Enter UPI ID to generate QR</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GST & Tax Configuration */}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0752A5]">GST & Tax Configuration</h2>
              <p className="text-xs text-slate-500">Disabled by default until confirmed and enabled by the owner</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settings.gst.enabled}
                onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, enabled: e.target.checked } })}
                className="h-4 w-4"
              />
              Enable GST
            </label>
          </div>
          {settings.gst.enabled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold">Resort GSTIN</label>
                <input value={settings.gst.gstin} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, gstin: e.target.value.toUpperCase() } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 uppercase" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">CGST (%)</label>
                <input type="number" step="0.1" min={0} value={settings.gst.cgst_rate} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, cgst_rate: Number(e.target.value) } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">SGST (%)</label>
                <input type="number" step="0.1" min={0} value={settings.gst.sgst_rate} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, sgst_rate: Number(e.target.value) } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">IGST (%)</label>
                <input type="number" step="0.1" min={0} value={settings.gst.igst_rate} onChange={(e) => setSettings({ ...settings, gst: { ...settings.gst, igst_rate: Number(e.target.value) } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#0752A5] px-6 font-semibold text-white hover:bg-[#236DC4]">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Authorized Signature Upload */}
      <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold text-[#0752A5]">Authorized Signature Image</h2>
        <p className="text-xs text-slate-500">Official signature of Pranit Dabhade for authorized billing, invoices, receipts, and quotations.</p>
        
        {settings.documents.has_signature_image && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex h-20 w-44 items-center justify-center rounded-lg border border-slate-300 bg-white p-2 shadow-xs">
              <img
                src={settings.documents.signature_data_url || defaultSigUrl}
                alt="Authorized Signature"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                Signature Active on Invoices & Quotations
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Appears above "Authorized Signature" on all exported PDFs.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] px-4 text-xs font-semibold text-[#0752A5] hover:bg-slate-100 transition-colors">
            <Upload className="h-4 w-4" />
            <span>Upload New Signature</span>
            <input type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => void handleSignatureUpload(e.target.files?.[0])} />
          </label>
          {settings.documents.has_signature_image && (
            <button type="button" onClick={() => void handleRemoveSignature()} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer">
              <Trash2 className="h-4 w-4" /> Remove Signature
            </button>
          )}
        </div>
      </div>

      {/* Local JSON Data Backup & Transfer */}
      <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#0752A5]">
          <Database className="h-4 w-4" />
          <span>Local JSON Storage — Export & Transfer Backup</span>
        </div>
        <p className="text-xs text-slate-500">
          All resort data is stored locally on this device (no MySQL server needed). Download a JSON backup anytime or import it on another mobile phone.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0752A5] px-4 text-xs font-bold text-white hover:bg-[#236DC4]"
          >
            <Download className="h-4 w-4" /> Download JSON Backup
          </button>
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] px-4 text-xs font-bold text-[#0752A5] hover:bg-slate-100">
            <Upload className="h-4 w-4" />
            <span>Import JSON Backup</span>
            <input type="file" accept=".json" className="hidden" onChange={(e) => void handleImportJson(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {/* Optional Demo Data Controls */}
      <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#172033]">
          <Database className="h-4 w-4 text-[#0752A5]" />
          <span>Evaluation / Demo Dataset</span>
        </div>
        <p className="text-xs text-slate-500">Load clearly marked DEMO records for training or testing, and clear them cleanly before live production.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleLoadDemo()} className="min-h-[40px] rounded-xl bg-[#D5DEFF] px-4 text-xs font-bold text-[#0752A5]">
            Load Demo Records
          </button>
          <button type="button" onClick={() => setClearDemoOpen(true)} className="min-h-[40px] rounded-xl bg-rose-50 px-4 text-xs font-bold text-rose-700">
            Clear All Demo Records
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={clearDemoOpen}
        title="Clear Demo Records"
        message="Remove all records marked DEMO? Real business records will NOT be affected."
        confirmLabel="Clear Demo Data"
        danger
        onConfirm={() => void handleClearDemo()}
        onCancel={() => setClearDemoOpen(false)}
      />
    </div>
  );
};

