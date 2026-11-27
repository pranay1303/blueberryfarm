import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CheckCircle,
  Copy,
  Home,
  MessageCircle,
  PhoneCall,
  Sparkles,
} from 'lucide-react';

export const BookingSuccessPage: React.FC = () => {
  const location = useLocation();
  const state = location.state as {
    enquiryReference?: string;
    customerName?: string;
    mobile?: string;
    checkIn?: string;
    checkOut?: string;
    totalGuests?: number;
    packageCode?: string;
    vehicleCount?: number;
  } | null;

  const [copied, setCopied] = useState(false);
  const refCode = state?.enquiryReference || 'ENQ-CONFIRMED';

  const copyRef = () => {
    navigator.clipboard.writeText(refCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="py-12 sm:py-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Success Badge */}
      <div className="text-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
          <CheckCircle className="w-10 h-10" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Booking Request Received Successfully!</span>
        </span>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Thank You, {state?.customerName || 'Valued Guest'}!
        </h1>

        <p className="text-slate-600 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Your booking enquiry has been registered in our resort system. Our team at Mandawane, Karjat is reviewing your dates and room allocation.
        </p>
      </div>

      {/* Enquiry Reference Box */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-900 via-[#004AAC] to-blue-950 text-white p-6 sm:p-8 shadow-xl text-center space-y-3">
        <span className="text-xs uppercase tracking-widest text-blue-200 font-semibold block">
          Your Booking Reference Number
        </span>

        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
          <span className="text-2xl sm:text-3xl font-mono font-black tracking-wider text-amber-300">
            {refCode}
          </span>
          <button
            type="button"
            onClick={copyRef}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Copy Reference Number"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        {copied && (
          <span className="text-xs text-emerald-300 block font-medium animate-in fade-in">
            ✓ Copied to clipboard! Please quote this reference when speaking with resort staff.
          </span>
        )}
      </div>

      {/* Summary Box */}
      {state && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Enquiry Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block">Check-in:</span>
              <strong className="text-slate-800 text-sm block">{state.checkIn || '-'}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block">Check-out:</span>
              <strong className="text-slate-800 text-sm block">{state.checkOut || '-'}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block">Guests:</span>
              <strong className="text-[#004AAC] text-sm block">{state.totalGuests || 2} Persons</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <span className="text-slate-500 block">Vehicles:</span>
              <strong className="text-purple-700 text-sm block">{state.vehicleCount || 0} Registered</strong>
            </div>
          </div>
        </div>
      )}

      {/* What Happens Next Card */}
      <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-6 sm:p-8 space-y-4">
        <h2 className="text-base font-bold text-amber-950 flex items-center gap-2">
          <span>What Happens Next?</span>
        </h2>
        <div className="space-y-3 text-xs sm:text-sm text-amber-900 leading-relaxed">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              1
            </span>
            <span>
              <strong>Room Allocation Review:</strong> Our resort manager reviews your requested dates against current cottage availability.
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              2
            </span>
            <span>
              <strong>Confirmation Call / WhatsApp:</strong> We will reach out to <strong>+91 {state?.mobile || 'your mobile'}</strong> to confirm meal preferences, special celebration needs, and tariff details.
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              3
            </span>
            <span>
              <strong>Advance Payment Receipt:</strong> Once the 50% advance is received, an official Blueberry reservation receipt & directions voucher is sent to your WhatsApp.
            </span>
          </div>
        </div>
      </div>

      {/* Urgent Contact Direct Action Buttons */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 space-y-4 text-center">
        <h3 className="text-sm font-bold text-slate-800">Need Immediate or Same-Day Confirmation?</h3>
        <p className="text-xs text-slate-600">You can speak with resort owner Pranit Dabhade directly right now:</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-1">
          <a
            href="tel:8669408484"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Call +91 86694 08484</span>
          </a>
          <a
            href={`https://wa.me/918669408484?text=Hello%20Blueberry%20Resort,%20I%20have%20submitted%20booking%20enquiry%20${refCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 active:scale-95 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Chat on WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-center gap-4 pt-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
        <Link
          to="/packages"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold text-[#004AAC] bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          <span>View All Packages</span>
        </Link>
      </div>
    </div>
  );
};
