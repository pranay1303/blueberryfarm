import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Calendar,
  Compass,
  Home,
  Lock,
  Menu,
  Phone,
  PhoneCall,
  Search,
  X,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export const PublicLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const closeMenu = () => setMobileMenuOpen(false);

  // Close mobile menu whenever route changes
  useEffect(() => {
    closeMenu();
  }, [location.pathname]);

  // Prevent background scrolling when mobile menu is full-screen
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#FAF9F5] text-slate-800 font-sans selection:bg-[#004AAC] selection:text-white">
      {/* Main Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs w-full">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">
          {/* Logo & Brand Name */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 group focus:outline-hidden min-w-0 flex-1 sm:flex-initial">
            <BrandLogo size="sm" className="sm:hidden shrink-0" />
            <BrandLogo size="md" className="hidden sm:block shrink-0 transition-transform group-hover:scale-105" />
            <div className="min-w-0 truncate">
              <span className="block text-base sm:text-xl font-bold tracking-tight text-[#004AAC] group-hover:text-[#2578E7] transition-colors leading-tight truncate">
                Blueberry Farm &amp; Resort
              </span>
              <span className="block text-[10px] sm:text-[11px] font-medium text-slate-500 tracking-wide uppercase truncate">
                Mandawane, Karjat
              </span>
            </div>
          </Link>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-3 shrink-0">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'text-[#004AAC] bg-blue-50/80'
                    : 'text-slate-600 hover:text-[#004AAC] hover:bg-slate-50'
                }`
              }
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </NavLink>

            <NavLink
              to="/track"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'text-[#004AAC] bg-blue-50/80'
                    : 'text-slate-600 hover:text-[#004AAC] hover:bg-slate-50'
                }`
              }
            >
              <Search className="w-4 h-4" />
              <span>Track Booking</span>
            </NavLink>

            <a
              href="tel:8669408484"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-[#004AAC] hover:bg-slate-50 transition-colors"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
              <span>+91 86694 08484</span>
            </a>

            <Link
              to="/book-now"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-bold text-sm bg-gradient-to-r from-[#004AAC] to-[#2578E7] text-white shadow-md hover:shadow-lg hover:brightness-110 active:scale-95 transition-all ml-1"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Stay</span>
            </Link>

            <Link
              to="/admin/login"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors ml-1"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin</span>
            </Link>
          </nav>

          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden shrink-0 inline-flex items-center justify-center p-2 rounded-xl text-slate-700 hover:text-[#004AAC] hover:bg-slate-100 focus:outline-hidden cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Full-Screen Mobile Navigation Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in duration-200">
          {/* Top Bar inside Fullscreen Menu */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100">
            <Link to="/" onClick={closeMenu} className="flex items-center gap-2.5 min-w-0">
              <BrandLogo size="sm" className="shrink-0" />
              <div className="min-w-0 truncate">
                <span className="block text-base font-bold text-[#004AAC] leading-tight truncate">
                  Blueberry Farm &amp; Resort
                </span>
                <span className="block text-[10px] font-medium text-slate-500 uppercase truncate">
                  Mandawane, Karjat
                </span>
              </div>
            </Link>

            <button
              type="button"
              onClick={closeMenu}
              className="p-2 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 focus:outline-hidden cursor-pointer shrink-0 ml-2"
              aria-label="Close navigation menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Menu Items (Full Screen Vertical Flow) */}
          <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col justify-between">
            <div className="space-y-2.5">
              <Link
                to="/"
                onClick={closeMenu}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                  location.pathname === '/'
                    ? 'bg-blue-50 text-[#004AAC]'
                    : 'text-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-[#004AAC] flex items-center justify-center shrink-0">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <span className="block">Home Overview</span>
                  <span className="block text-[11px] font-normal text-slate-500">Resort &amp; stay overview</span>
                </div>
              </Link>

              <Link
                to="/book-now"
                onClick={closeMenu}
                className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold bg-gradient-to-r from-[#004AAC] to-[#2578E7] text-white shadow-md transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <span className="block">Book Stay Online</span>
                  <span className="block text-[11px] font-normal text-blue-100">Direct enquiry • No password needed</span>
                </div>
              </Link>

              <Link
                to="/track"
                onClick={closeMenu}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                  location.pathname === '/track'
                    ? 'bg-blue-50 text-[#004AAC]'
                    : 'text-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-800 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <span className="block">Track Booking Status</span>
                  <span className="block text-[11px] font-normal text-slate-500">Check enquiry &amp; milestone update</span>
                </div>
              </Link>

              <a
                href="tel:8669408484"
                onClick={closeMenu}
                className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold text-slate-800 hover:bg-slate-50 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <span className="block">Call Resort Office</span>
                  <span className="block text-[11px] font-normal text-slate-500">+91 86694 08484 • WhatsApp</span>
                </div>
              </a>

              <a
                href="https://maps.google.com/?q=Blueberry+Farm+and+Resort+Mandawane+Karjat"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold text-slate-800 hover:bg-slate-50 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <span className="block">Get Directions</span>
                  <span className="block text-[11px] font-normal text-slate-500">Mandawane, Karjat, Maharashtra</span>
                </div>
              </a>
            </div>

            {/* Bottom Section in Mobile Menu */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <Link
                to="/admin/login"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin / Owner Portal Login</span>
              </Link>

              <p className="text-center text-[10px] text-slate-400">
                Blueberry Farm &amp; Resort © {new Date().getFullYear()} • Karjat
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Public Content */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        <Outlet />
      </main>

      {/* Minimal Public Footer */}
      <footer className="bg-slate-900 text-slate-300 pt-8 pb-6 border-t border-slate-800 w-full overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800 text-center sm:text-left">
            <div className="flex items-center gap-2.5">
              <BrandLogo size="sm" />
              <div>
                <span className="text-base font-bold text-white tracking-tight block">Blueberry Farm &amp; Resort</span>
                <span className="text-[11px] text-slate-400 block">Mandawane, Karjat, Maharashtra</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-3 gap-y-1.5 text-xs font-semibold">
              <Link to="/" className="text-slate-300 hover:text-white transition-colors">Home</Link>
              <span>•</span>
              <Link to="/book-now" className="text-amber-400 hover:text-amber-300 transition-colors">Book Stay</Link>
              <span>•</span>
              <Link to="/track" className="text-blue-400 hover:text-blue-300 transition-colors">Track Booking</Link>
              <span>•</span>
              <Link to="/admin/login" className="text-slate-400 hover:text-white transition-colors">Admin Login</Link>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 text-center sm:text-left">
            <p>© {new Date().getFullYear()} Blueberry Farm and Resort.</p>
            <p>WhatsApp / Call: <a href="tel:8669408484" className="text-slate-300 font-bold hover:underline">+91 86694 08484</a></p>
          </div>
        </div>
      </footer>

      {/* Quick Action Button on Mobile */}
      <div className="md:hidden fixed bottom-4 right-4 z-30 flex items-center gap-2">
        <a
          href="tel:8669408484"
          className="p-3.5 rounded-full bg-emerald-600 text-white shadow-xl hover:bg-emerald-700 active:scale-95 transition-transform"
          aria-label="Call Resort"
        >
          <Phone className="w-5 h-5" />
        </a>
        {location.pathname !== '/book-now' && (
          <Link
            to="/book-now"
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#004AAC] text-white font-bold text-xs shadow-xl hover:bg-[#2578E7] active:scale-95 transition-transform"
          >
            <Calendar className="w-4 h-4" />
            <span>Book Stay</span>
          </Link>
        )}
      </div>
    </div>
  );
};

export default PublicLayout;
