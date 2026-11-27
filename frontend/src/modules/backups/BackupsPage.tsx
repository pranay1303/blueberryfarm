import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, HardDriveDownload, RotateCcw, Shield, Trash2 } from 'lucide-react';
import { api, fetchBlob } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatDateTimeIST } from '../../utils/format';
import { triggerBlobDownload } from '../../utils/share';
import { LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { ConfirmDialog } from '../../components/Modal';

interface BackupItem {
  filename: string;
  size_bytes: number;
  modified_ts: number;
}

interface AuditEntry {
  event_id: string;
  timestamp: string;
  user_id: string;
  username: string;
  action: string;
  module: string;
  record_id: string;
  result: string;
  metadata: Record<string, unknown>;
}

interface StorageSectionSummary {
  count: number;
  bytes?: number;
  label: string;
}

interface StorageSummaryResponse {
  sections: Record<string, StorageSectionSummary>;
  total_business_records: number;
}

export const BackupsPage: React.FC = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'backups' | 'logs' | 'storage'>('backups');

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [lastAuto, setLastAuto] = useState<string | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [clearAllTarget, setClearAllTarget] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clearingBackups, setClearingBackups] = useState(false);

  const [logType, setLogType] = useState<'activity' | 'security' | 'application' | 'error'>('activity');
  const [logModule, setLogModule] = useState('');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [storageSummary, setStorageSummary] = useState<StorageSummaryResponse | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [clearTarget, setClearTarget] = useState<{ section: string; label: string } | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const res = await api.get('/backups');
      setBackups(res.data.backups || []);
      setLastAuto(res.data.last_automated_backup || null);
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setLoadingBackups(false);
    }
  }, [showToast]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await api.get('/audit-logs', {
        params: { log_type: logType, ...(logModule ? { module: logModule } : {}) },
      });
      setLogs(res.data.entries || []);
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [logType, logModule, showToast]);

  const loadStorageSummary = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const res = await api.get('/storage/summary');
      setStorageSummary(res.data);
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setLoadingStorage(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (tab === 'backups') void loadBackups();
    if (tab === 'logs') void loadLogs();
    if (tab === 'storage') void loadStorageSummary();
  }, [tab, loadBackups, loadLogs, loadStorageSummary]);

  const createNow = async () => {
    setCreating(true);
    try {
      const res = await api.post('/backups/create', { reason: 'manual_ui' });
      showToast(`Backup created: ${res.data.filename}`, 'success');
      await loadBackups();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = async (filename: string) => {
    try {
      const blob = await fetchBlob(`/backups/download/${filename}`);
      triggerBlobDownload(blob, filename);
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    }
  };

  const verifyBackup = async (filename: string) => {
    try {
      const res = await api.get(`/backups/verify/${filename}`);
      if (res.data.valid) {
        showToast(`Integrity OK • SHA-256: ${res.data.manifest?.sha256?.substring(0, 16)}...`, 'success');
      } else {
        showToast('Checksum mismatch detected!', 'error');
      }
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      const res = await api.post(`/backups/restore/${restoreTarget}`);
      showToast(`Restored successfully! Safety copy: ${res.data.safety_backup}`, 'success');
      setRestoreTarget(null);
      await loadBackups();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    }
  };

  const confirmClearAllBackups = async () => {
    setClearingBackups(true);
    try {
      const res = await api.delete('/backups');
      showToast(res.data.message || 'All backups cleared successfully.', 'success');
      setClearAllTarget(false);
      await loadBackups();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setClearingBackups(false);
    }
  };

  const confirmDeleteBackup = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/backups/${deleteTarget}`);
      showToast(`Backup deleted: ${deleteTarget}`, 'success');
      setDeleteTarget(null);
      await loadBackups();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    }
  };

  const confirmClearStorage = async () => {
    if (!clearTarget) return;
    setClearing(true);
    try {
      const res = await api.post('/storage/clear', { section: clearTarget.section });
      showToast(
        `Cleared ${res.data.cleared_count} items from ${clearTarget.label}. Pre-clear backup saved: ${res.data.safety_backup}`,
        'success'
      );
      setClearTarget(null);
      await loadStorageSummary();
    } catch (err) {
      showToast(extractErrorMessage(err), 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Storage & Backups</h1>
          <p className="text-xs text-slate-500">
            Automated JSON + log ZIP backups with SHA-256 verification • Last auto-backup: {formatDateTimeIST(lastAuto)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('backups')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-semibold ${
              tab === 'backups' ? 'bg-[#0752A5] text-white' : 'border border-[#E3E8F0] bg-white text-slate-700'
            }`}
          >
            Backups
          </button>
          <button
            type="button"
            onClick={() => setTab('storage')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-semibold ${
              tab === 'storage' ? 'bg-[#0752A5] text-white' : 'border border-[#E3E8F0] bg-white text-slate-700'
            }`}
          >
            Clear Storage
          </button>
          <button
            type="button"
            onClick={() => setTab('logs')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-semibold ${
              tab === 'logs' ? 'bg-[#0752A5] text-white' : 'border border-[#E3E8F0] bg-white text-slate-700'
            }`}
          >
            Audit Logs
          </button>
        </div>
      </div>

      {tab === 'backups' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-500">
              {backups.length} Backup{backups.length === 1 ? '' : 's'} stored on server
            </p>
            <div className="flex flex-wrap gap-2">
              {backups.length > 0 && (
                <button
                  type="button"
                  onClick={() => setClearAllTarget(true)}
                  disabled={creating || clearingBackups}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                  {clearingBackups ? 'Clearing...' : 'Clear All Backups'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void createNow()}
                disabled={creating}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0752A5] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#236DC4] transition-colors cursor-pointer disabled:opacity-50"
              >
                <HardDriveDownload className="h-4 w-4" /> {creating ? 'Creating...' : 'Create Backup Now'}
              </button>
            </div>
          </div>

          {loadingBackups ? (
            <LoadingSpinner />
          ) : backups.length === 0 ? (
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-8 text-center text-sm text-slate-500">
              No backups generated yet. Click "Create Backup Now" to capture all database records.
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="flex flex-col gap-2 rounded-2xl border border-[#E3E8F0] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-[#172033]">{b.filename}</p>
                    <p className="text-xs text-slate-500">
                      {(b.size_bytes / 1024).toFixed(1)} KB • {new Date(b.modified_ts * 1000).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void downloadBackup(b.filename)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[#E3E8F0] px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                    <button
                      type="button"
                      onClick={() => void verifyBackup(b.filename)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[#E3E8F0] px-3 text-xs font-semibold text-[#0752A5] hover:bg-blue-50 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreTarget(b.filename)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(b.filename)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'storage' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Selective Storage Cleanup
            </div>
            <p>
              Clearing a section permanently empties its live records and resets its ID counter back to zero.
              <strong className="ml-1 font-semibold">
                An automatic full safety ZIP backup is always taken immediately before clearing
              </strong>
              , so you can restore anytime from the Backups tab.
            </p>
          </div>

          {loadingStorage ? (
            <LoadingSpinner />
          ) : !storageSummary ? (
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-8 text-center text-sm text-slate-500">
              Unable to load storage summary.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(storageSummary.sections).map(([key, sec]) => (
                  <div
                    key={key}
                    className="flex flex-col justify-between rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{key}</span>
                        <span className="rounded-full bg-[#D5DEFF]/40 px-2.5 py-0.5 text-xs font-bold text-[#0752A5]">
                          {sec.count} {key === 'pdfs' ? 'PDFs' : key === 'logs' ? 'files' : 'records'}
                        </span>
                      </div>
                      <p className="mt-2 text-base font-bold text-[#172033]">{sec.label}</p>
                      {typeof sec.bytes === 'number' && (
                        <p className="text-xs text-slate-400 mt-0.5">{(sec.bytes / 1024).toFixed(1)} KB on disk</p>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Target: {key}.json</span>
                      <button
                        type="button"
                        onClick={() => setClearTarget({ section: key, label: sec.label })}
                        disabled={sec.count === 0 || clearing}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Clear Section
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-rose-950">Clear All Business Data</p>
                  <p className="text-xs text-rose-700">
                    Clears invoices, quotations, bookings, customers, payments, expenses, and generated PDFs in one safe transaction.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClearTarget({ section: 'all_business', label: 'All Business Data (Invoices, Bookings, Customers, etc.)' })}
                  disabled={storageSummary.total_business_records === 0 || clearing}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors"
                >
                  <Trash2 className="h-4 w-4" /> Clear All Business Data
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['activity', 'security', 'application', 'error'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLogType(t)}
                className={`min-h-[34px] rounded-xl px-3 text-xs font-semibold capitalize ${
                  logType === t ? 'bg-[#0752A5] text-white' : 'border border-[#E3E8F0] bg-white text-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
            <input
              type="text"
              placeholder="Filter by module..."
              value={logModule}
              onChange={(e) => setLogModule(e.target.value)}
              className="min-h-[34px] rounded-xl border border-[#E3E8F0] px-3 text-xs"
            />
          </div>

          {loadingLogs ? (
            <LoadingSpinner />
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-8 text-center text-sm text-slate-500">
              No audit entries matching filter.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.event_id} className="rounded-2xl border border-[#E3E8F0] bg-white p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-[#0752A5]" />
                      <span className="font-bold text-[#172033]">{l.action}</span>
                      <span className="rounded bg-[#F5F7FB] px-2 py-0.5 font-semibold text-slate-600">{l.module}</span>
                      <StatusBadge status={l.result} />
                    </div>
                    <span className="text-slate-400">{formatDateTimeIST(l.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    User: <span className="font-semibold">{l.username}</span>
                    {l.record_id ? ` • Record: ${l.record_id}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restore Backup"
        message={`Restore data from ${restoreTarget}? A safety backup of your current live data will be created automatically before restoring.`}
        confirmLabel="Verify & Restore"
        onConfirm={() => void confirmRestore()}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(clearTarget)}
        title={`Clear ${clearTarget?.label || 'Storage Section'}?`}
        message={`Are you sure you want to clear ${clearTarget?.label}? Live records in this section will be emptied and ID counters will be reset. An automatic safety ZIP backup of all live data will be created before clearing.`}
        confirmLabel={clearing ? 'Clearing...' : 'Create Backup & Clear'}
        danger
        loading={clearing}
        onConfirm={() => void confirmClearStorage()}
        onCancel={() => setClearTarget(null)}
      />

      <ConfirmDialog
        open={clearAllTarget}
        title="Clear All Backups"
        message={`Are you sure you want to permanently delete all ${backups.length} database backups from the server? This will clean up all backup storage.`}
        confirmLabel={clearingBackups ? 'Clearing...' : 'Yes, Delete All Backups'}
        danger
        loading={clearingBackups}
        onConfirm={() => void confirmClearAllBackups()}
        onCancel={() => setClearAllTarget(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Backup File"
        message={`Are you sure you want to delete "${deleteTarget}"? This backup file will be permanently deleted from the server.`}
        confirmLabel="Delete Backup"
        danger
        onConfirm={() => void confirmDeleteBackup()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
