import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  CheckCircle,
  Flame,
  Music,
  Sparkles,
  TreePine,
  Users,
  Utensils,
  Waves,
  Wind,
} from 'lucide-react';
import { api } from '../../services/api';
import { LoadingSpinner } from '../../components/UiPrimitives';

export const FacilitiesPage: React.FC = () => {
  const [cmsData, setCmsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/cms/content/facilities')
      .then((res) => {
        if (res.data?.content) setCmsData(res.data.content);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const defaultFacilities = [
    {
      icon: Waves,
      title: 'Hygienic Swimming Pool',
      desc: 'Crystal-clear, continuously filtered swimming pool with a dedicated shallow safe splash area for young children and toddlers.',
    },
    {
      icon: Music,
      title: 'Rain Dance & Music System',
      desc: 'High-pressure overhead rain mist showers combined with an outdoor party sound system for lively family gatherings.',
    },
    {
      icon: Wind,
      title: 'Air-Conditioned Cottages',
      desc: 'Spacious independent cottages and family suites equipped with split ACs, comfortable double beds, hot water geysers, and attached western bathrooms.',
    },
    {
      icon: Utensils,
      title: 'Open Dining Pavilion',
      desc: 'Covered, breezy agro-dining hall serving unlimited freshly cooked village-style Maharashtrian vegetarian and non-vegetarian delicacies.',
    },
    {
      icon: Car,
      title: 'Secure Gated Vehicle Parking',
      desc: 'Free, well-lit onsite parking inside resort gates with 24/7 security register monitoring for guest safety.',
    },
    {
      icon: TreePine,
      title: 'Agro Farm & Fruit Orchards',
      desc: 'Sprawling natural green orchards with coconut, mango, and spice plantations ideal for peaceful morning walking and bird watching.',
    },
    {
      icon: Users,
      title: 'Lawn & Cricket Grounds',
      desc: 'Open manicured grassy lawn perfect for outdoor cricket, badminton, volleyball, kids games, and evening strolls.',
    },
    {
      icon: Flame,
      title: 'Evening Bonfire & BBQ Zone',
      desc: 'Dedicated campfire circle for cozy evening chats under starlit skies with optional barbeque grilling setups.',
    },
  ];

  const items = cmsData?.items && cmsData.items.length > 0 ? cmsData.items : defaultFacilities;

  return (
    <div className="space-y-16 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-[#004AAC] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Resort Amenities & Comfort</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          {cmsData?.title || 'World-Class Agro-Resort Facilities'}
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          {cmsData?.description ||
            'Everything you need for an unforgettable countryside weekend getaway with family, friends, or corporate colleagues in Karjat.'}
        </p>
      </div>

      {/* Facilities Grid */}
      {loading ? (
        <LoadingSpinner label="Loading resort facilities & amenities..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((fac: any, idx: number) => {
            const Icon = defaultFacilities[idx % defaultFacilities.length].icon;
            return (
              <div
                key={idx}
                className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#004AAC] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-[#004AAC] group-hover:text-white transition-all">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{fac.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{fac.desc}</p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Included in Stay Package</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Special Highlights Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-[#004AAC] rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="text-xs font-bold text-amber-300 uppercase tracking-widest block">
            Pure Agro Experience
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold">
            Looking for a Clean, Safe, & Peaceful Farm Retreat?
          </h2>
          <p className="text-sm sm:text-base text-blue-100 leading-relaxed">
            All facilities are meticulously sanitized before every guest arrival. Experience the perfect harmony of modern AC comfort and untouched rustic greenery.
          </p>
          <div className="pt-2 flex flex-wrap gap-4">
            <Link
              to="/book-now"
              className="px-6 py-3 rounded-full bg-white text-[#004AAC] font-bold text-sm hover:bg-amber-300 hover:text-slate-900 transition-all shadow-md"
            >
              Check Availability & Book
            </Link>
            <a
              href="tel:8669408484"
              className="px-6 py-3 rounded-full bg-blue-800/80 border border-blue-400 text-white font-bold text-sm hover:bg-blue-800 transition-all"
            >
              Call +91 86694 08484
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacilitiesPage;
