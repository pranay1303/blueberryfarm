import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-12 text-[#0752A5]">
    <Loader2 className="h-8 w-8 animate-spin" />
    <p className="mt-2.5 text-sm font-medium text-slate-600">{label}</p>
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E3E8F0] bg-white px-6 py-10 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#D5DEFF]/60 text-[#0752A5]">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-[#172033]">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  let cls = 'bg-slate-100 text-slate-700 border-slate-200';
  if (['paid', 'confirmed', 'accepted', 'checked out', 'converted', 'active', 'success'].includes(s)) {
    cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (['partially paid', 'checked in', 'sent', 'viewed', 'awaiting confirmation'].includes(s)) {
    cls = 'bg-[#D5DEFF]/70 text-[#0752A5] border-[#236DC4]/30';
  } else if (['unpaid', 'cancelled', 'rejected', 'expired', 'refunded', 'failure', 'error', 'denied'].includes(s)) {
    cls = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (['draft', 'enquiry'].includes(s)) {
    cls = 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
};

export const Badge: React.FC<{
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: React.ReactNode;
  className?: string;
}> = ({ variant = 'neutral', children, className = '' }) => {
  const map = {
    primary: 'bg-blue-50 text-[#004AAC] border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-blue-50 text-[#004AAC] border-blue-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'success' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    icon?: React.ComponentType<{ className?: string }>;
    loading?: boolean;
  }
> = ({ variant = 'primary', size = 'md', icon: Icon, loading = false, className = '', children, disabled, ...props }) => {
  const vmap = {
    primary: 'bg-[#004AAC] text-white hover:bg-[#2578E7]',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  };
  const smap = {
    sm: 'px-3 py-1.5 text-xs rounded-xl font-bold gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl font-bold gap-2',
    lg: 'px-6 py-3 text-base rounded-2xl font-bold gap-2.5',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${vmap[variant]} ${smap[size]} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0" />
      ) : null}
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#004AAC] focus:outline-hidden ${className}`}
  />
);


