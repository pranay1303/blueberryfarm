import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="fixed right-3 top-3 z-[60] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const bg =
          t.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : t.type === 'info'
            ? 'border-[#236DC4]/30 bg-[#D5DEFF] text-[#0752A5]'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900';
        const Icon = t.type === 'error' ? AlertCircle : t.type === 'info' ? Info : CheckCircle2;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg ${bg}`}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="rounded-lg p-1 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

