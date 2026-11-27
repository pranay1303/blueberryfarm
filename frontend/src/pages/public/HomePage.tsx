import React from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  PhoneCall,
  Search,
  Sparkles,
  Waves,
  UtensilsCrossed,
  Home as HomeIcon,
  Car,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] sm:min-h-[calc(100vh-5rem)] w-full max-w-full flex items-center justify-center overflow-hidden">
      {/* Background Image: Authentic Blueberry Farm & Resort Cottages */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-100"
        style={{
          backgroundImage: `url('/resort-bg.jpg')`,
        }}
      >
        {/* Cinematic Gradient Overlays for High Contrast & Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/60" />
        <div className="absolute inset-0 bg-[#004AAC]/20 backdrop-blur-[1px]" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-20 text-center text-white space-y-4 sm:space-y-6">
        {/* Location & Agri-Tourism Badge */}
        <div className="inline-flex max-w-full items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[11px] sm:text-xs font-semibold tracking-wide text-blue-100 shadow-md">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0 animate-pulse" />
          <span className="truncate">Nature Retreat & Farm Stay • Mandawane, Karjat, Maharashtra</span>
        </div>

        {/* Resort Title & Tagline */}
        <div className="space-y-2 sm:space-y-3">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white drop-shadow-md leading-tight">
            Blueberry Farm{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-emerald-300">
              &amp; Resort
            </span>
          </h1>
          <p className="max-w-lg mx-auto text-xs sm:text-base text-slate-200 font-medium leading-relaxed drop-shadow-xs px-2">
            Escape to nature, cozy AC cottages, refreshing swimming pool &amp; rain dance, and authentic unlimited homemade Maharashtrian cuisine.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-2 w-full max-w-xs sm:max-w-none mx-auto">
          <Link
            to="/book-now"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold text-xs sm:text-sm bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 hover:brightness-110 active:scale-95 shadow-xl transition-all"
          >
            <Calendar className="w-4 h-4 text-slate-950 shrink-0" />
            <span className="whitespace-nowrap">Book Stay (No Login Needed)</span>
          </Link>

          <Link
            to="/track"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold text-xs sm:text-sm bg-white/15 hover:bg-white/25 border border-white/30 text-white backdrop-blur-md active:scale-95 shadow-md transition-all"
          >
            <Search className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="whitespace-nowrap">Track Booking Status</span>
          </Link>

          <a
            href="tel:8669408484"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold text-xs sm:text-sm bg-emerald-600/90 hover:bg-emerald-600 text-white backdrop-blur-md active:scale-95 shadow-md transition-all"
          >
            <PhoneCall className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Call: +91 86694 08484</span>
          </a>
        </div>

        {/* Feature Pills */}
        <div className="pt-2 sm:pt-4 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold text-slate-200">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15">
            <HomeIcon className="w-3 h-3 text-blue-400 shrink-0" />
            <span>AC Cottages &amp; Rooms</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15">
            <Waves className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>Pool &amp; Rain Dance</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15">
            <UtensilsCrossed className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Unlimited Meals</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15">
            <Car className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>Safe Parking</span>
          </span>
          <a
            href="https://maps.google.com/?q=Blueberry+Farm+and+Resort+Mandawane+Karjat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/15 text-blue-300 hover:text-white transition-colors"
          >
            <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
            <span>Directions</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
