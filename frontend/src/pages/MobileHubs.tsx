import React from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  Package,
  Receipt,
  Settings,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const CreateHubPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const actions = [
    {
      to: '/admin/bookings?new=1',
      title: 'New Booking',
      desc: 'Reserve stay dates, rooms & package',
      icon: CalendarPlus,
      show: hasPermission('bookings:write'),
    },
    {
      to: '/admin/quotations?new=1',
      title: 'New Quotation',
      desc: 'Build Blueberry-branded quote & share PDF',
      icon: FileText,
      show: hasPermission('quotations:write'),
    },
    {
      to: '/admin/invoices?new=1',
      title: 'New Invoice',
      desc: 'Generate GST/Non-GST invoice & PDF',
      icon: Receipt,
      show: hasPermission('invoices:write'),
    },
    {
      to: '/admin/customers?new=1',
      title: 'Add Customer',
      desc: 'Save guest contact & company details',
      icon: UserPlus,
      show: hasPermission('customers:write'),
    },
    {
      to: '/admin/payments?new=1',
      title: 'Record Payment',
      desc: 'Log advance, partial, full payment or refund',
      icon: CreditCard,
      show: hasPermission('payments:write'),
    },
    {
      to: '/admin/expenses?new=1',
      title: 'Add Expense',
      desc: 'Track groceries, utilities, salaries & bills',
      icon: Wallet,
      show: hasPermission('expenses:write'),
    },
  ].filter((a) => a.show);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#172033]">Quick Create</h1>
        <p className="text-sm text-slate-500">Tap an action to create a new record</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-center gap-3.5 rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-sm active:scale-[0.99]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#D5DEFF]/70 text-[#0752A5]">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#172033]">{a.title}</p>
                <p className="text-xs text-slate-500">{a.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export const DocumentsHubPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const docs = [
    {
      to: '/admin/quotations',
      title: 'Quotations',
      desc: 'Create, duplicate, download PDF, share on WhatsApp & convert',
      icon: FileText,
      show: hasPermission('quotations:read'),
    },
    {
      to: '/admin/invoices',
      title: 'Invoices & Bills',
      desc: 'Paid/Unpaid invoices, Blueberry PDFs & adjustments',
      icon: Receipt,
      show: hasPermission('invoices:read'),
    },
    {
      to: '/admin/payments',
      title: 'Payments & Receipts',
      desc: 'Payment history, UPI/GPay entries & PDF receipts',
      icon: CreditCard,
      show: hasPermission('payments:read'),
    },
  ].filter((d) => d.show);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#172033]">Documents & Billing</h1>
        <p className="text-sm text-slate-500">Quotations, Invoices, and Payment Receipts</p>
      </div>
      <div className="space-y-3">
        {docs.map((d) => {
          const Icon = d.icon;
          return (
            <Link
              key={d.to}
              to={d.to}
              className="flex items-center gap-3.5 rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-sm"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0752A5] text-white">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#172033]">{d.title}</p>
                <p className="text-xs text-slate-500">{d.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export const MoreHubPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const links = [
    { to: '/admin/customers', label: 'Customers & History', icon: Users, show: hasPermission('customers:read') },
    { to: '/admin/packages', label: 'Packages & Menu Master', icon: Package, show: hasPermission('packages:read') },
    { to: '/admin/expenses', label: 'Expenses & Petty Cash', icon: Wallet, show: hasPermission('expenses:read') },
    { to: '/admin/reports', label: 'Reports & Analytics', icon: FileSpreadsheet, show: hasPermission('reports:view') },
    { to: '/admin/backups', label: 'Storage & Backups', icon: HardDriveDownload, show: user?.role === 'OWNER_ADMIN' },
    { to: '/admin/settings', label: 'Resort & GST Settings', icon: Settings, show: user?.role === 'OWNER_ADMIN' },
  ].filter((l) => l.show);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#172033]">More Modules</h1>
        <p className="text-sm text-slate-500">
          Signed in as <span className="font-semibold text-[#0752A5]">{user?.full_name}</span> ({user?.role.replace('_', ' ')})
        </p>
      </div>
      <div className="divide-y divide-[#E3E8F0] overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.to} to={l.to} className="flex min-h-[54px] items-center gap-3 px-4 py-3 hover:bg-[#F5F7FB]">
              <Icon className="h-5 w-5 text-[#0752A5]" />
              <span className="flex-1 text-sm font-semibold text-[#172033]">{l.label}</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

