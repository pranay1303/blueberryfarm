import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CalendarCheck,
  Car,
  ExternalLink,
  FileText,
  HardDriveDownload,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  PlusCircle,
  Receipt,
  Search,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/BrandLogo';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import { NotificationBell } from '../components/NotificationBell';

export const AppLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/admin/login');
  };

  const sidebarItems = [
    { to: '/admin', label: 'Dashboard', icon: Home, show: hasPermission('dashboard:view'), end: true },
    { to: '/admin/enquiries', label: 'Booking Enquiries', icon: CalendarCheck, show: hasPermission('enquiries:read') || hasPermission('bookings:read') },
    { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck, show: hasPermission('bookings:read') },
    { to: '/admin/calendar', label: 'Stay Calendar', icon: Calendar, show: hasPermission('bookings:read') },
    { to: '/admin/invoices', label: 'Invoices & Bills', icon: Receipt, show: hasPermission('invoices:read') },
    { to: '/admin/vehicles', label: 'Vehicle Registry', icon: Car, show: hasPermission('vehicles:read') || hasPermission('bookings:read') },
    { to: '/admin/backups', label: 'Storage & Backups', icon: HardDriveDownload, show: user?.role === 'OWNER_ADMIN' },
    { to: '/admin/settings', label: 'Settings', icon: Settings, show: user?.role === 'OWNER_ADMIN' },
  ].filter((item) => item.show);

  const mobileTabs = [
    { to: '/admin', label: 'Home', icon: Home, activeMatch: (p: string) => p === '/admin' },
    { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck, activeMatch: (p: string) => p.startsWith('/admin/bookings') },
    { to: '/admin/create', label: 'Create', icon: PlusCircle, activeMatch: (p: string) => p.startsWith('/admin/create') },
    {
      to: '/admin/documents',
      label: 'Documents',
      icon: FileText,
      activeMatch: (p: string) =>
        p.startsWith('/admin/documents') ||
        p.startsWith('/admin/quotations') ||
        p.startsWith('/admin/invoices'),
    },
    {
      to: '/admin/more',
      label: 'More',
      icon: Menu,
      activeMatch: (p: string) =>
        p.startsWith('/admin/more') ||
        p.startsWith('/admin/enquiries') ||
        p.startsWith('/admin/calendar') ||
        p.startsWith('/admin/vehicles') ||
        p.startsWith('/admin/backups') ||
        p.startsWith('/admin/settings'),
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#F5F7FB] text-[#172033]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-[#E3E8F0] md:bg-white shrink-0">
        <div className="flex items-center gap-3 border-b border-[#E3E8F0] bg-[#0752A5] px-4 py-4 text-white">
          <BrandLogo size="md" className="bg-white p-0.5 rounded-full" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">Blueberry Farm</p>
            <p className="truncate text-xs text-[#D5DEFF]">Admin Portal • Karjat</p>
          </div>
        </div>

        {/* View Public Website Link */}
        <div className="p-3 border-b border-slate-100">
          <Link
            to="/"
            target="_blank"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50/80 hover:bg-blue-100 text-[#004AAC] text-xs font-bold transition-colors"
          >
            <span>View Public Website</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex min-h-[38px] w-full items-center gap-2.5 rounded-xl border border-[#E3E8F0] bg-[#F5F7FB] px-3 text-xs text-slate-500 hover:border-[#236DC4] hover:text-[#172033]"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Quick Search...</span>
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 text-xs">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-[38px] items-center gap-2.5 rounded-xl px-3 py-2 font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#0752A5] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-[#F5F7FB] hover:text-[#0752A5]'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-[#E3E8F0] p-3">
          <div className="mb-2 flex items-center justify-between rounded-xl bg-[#F5F7FB] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#172033]">{user?.full_name}</p>
              <p className="truncate text-[10px] font-bold text-[#0752A5] uppercase">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
            <LayoutGrid className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex min-h-[36px] w-full items-center justify-center gap-2 rounded-xl border border-[#E3E8F0] text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#0752A5]/20 bg-[#0752A5] px-4 py-2.5 text-white md:hidden">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="sm" className="bg-white p-0.5 rounded-full" />
            <div>
              <h1 className="text-sm font-bold leading-tight">Blueberry Admin</h1>
              <p className="text-[11px] text-[#D5DEFF]">{user?.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell lightTheme={false} />
            <Link
              to="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white"
              title="Public Site"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Global Search"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white active:bg-white/20"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign Out"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white active:bg-white/20"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Desktop Top Header Bar with Notifications */}
        <header className="hidden md:flex h-14 items-center justify-between border-b border-[#E3E8F0] bg-white px-6 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Blueberry Resort Management System</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell lightTheme={true} />
            <div className="h-4 w-[1px] bg-slate-200" />
            <div className="text-right">
              <p className="text-xs font-bold text-slate-800 leading-tight">{user?.full_name}</p>
              <p className="text-[10px] text-slate-400 font-medium">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </header>

        {/* Dynamic Page Outlet */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-[#E3E8F0] bg-white px-2 shadow-lg md:hidden"
        >
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.activeMatch(location.pathname);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold transition-colors ${
                  active ? 'text-[#0752A5]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-[#0752A5]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};
