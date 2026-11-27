import React, { useCallback, useEffect, useState } from 'react';
import { Database, Save, Trash2, Upload } from 'lucide-react';
import { api } from '../../services/api';
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

        {/* Payment Details */}
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#0752A5]">Payment Information (Printed on Invoices & Quotations)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">GPay / PhonePe Number</label>
              <input value={settings.payment_info.gpay_number} onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, gpay_number: e.target.value } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Account Name</label>
              <input value={settings.payment_info.account_name} onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, account_name: e.target.value } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Account Number</label>
              <input value={settings.payment_info.account_number} onChange={(e) => setSettings({ ...settings, payment_info: { ...settings.payment_info, account_number: e.target.value } })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
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
                src="/api/settings/signature"
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

