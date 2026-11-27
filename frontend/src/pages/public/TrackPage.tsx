import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { BookingTracker } from '../../components/BookingTracker';

export const TrackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('ref') || searchParams.get('q') || '';

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-10">
      <div className="text-center max-w-xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-[#004AAC] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-[#004AAC]" />
          <span>Real-Time Stay Tracking</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Track Your Booking Status
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Enter your Enquiry Reference, Booking Confirmation Code, or Registered Mobile Number to check real-time approval, dates, and stay details.
        </p>
      </div>

      <BookingTracker initialQuery={initialQuery} />
    </div>
  );
};

export default TrackPage;
