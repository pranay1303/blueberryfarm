import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  Car,
  Clock,
  Loader2,
  Minus,
  PartyPopper,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { api } from '../../services/api';
import type { PublicEnquiryPayload } from '../../types';

interface VehicleInput {
  vehicle_type: string;
  registration_number: string;
  notes: string;
}

export const PublicBookingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Package options from API or fallback
  const [packageOptions, setPackageOptions] = useState<
    Array<{ id: string; package_code: string; name: string; weekday_rate: number; weekend_rate: number }>
  >([
    {
      id: 'pkg-1',
      package_code: 'PKG-24HR-STAY',
      name: '24-Hour Staycation (AC Room + Pool + 4 Meals)',
      weekday_rate: 1800,
      weekend_rate: 2500,
    },
    {
      id: 'pkg-2',
      package_code: 'PKG-1DAY-OUTING',
      name: 'One-Day Outing / Picnic (Pool + Lunch + Breakfast + Hi-Tea)',
      weekday_rate: 1300,
      weekend_rate: 1300,
    },
  ]);

  // Section A: Customer Details
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [pinCode, setPinCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');

  // Section B: Booking Details
  const defaultCheckIn = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const defaultCheckOut = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

  const [checkInDate, setCheckInDate] = useState(defaultCheckIn);
  const [checkOutDate, setCheckOutDate] = useState(defaultCheckOut);
  const [checkInTime, setCheckInTime] = useState('12:00 PM');
  const [checkOutTime, setCheckOutTime] = useState('10:00 AM');
  const [selectedPackage, setSelectedPackage] = useState('PKG-24HR-STAY');

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [numberOfRooms, setNumberOfRooms] = useState(1);
  const [dormitoryGuests, setDormitoryGuests] = useState(0);

  // Section C: Vehicles
  const [vehicles, setVehicles] = useState<VehicleInput[]>([]);

  // Section D: Additional Preferences
  const [occasion, setOccasion] = useState('Family gathering');
  const [foodPreferences, setFoodPreferences] = useState('Both Veg & Non-Veg');
  const [specialRequirements, setSpecialRequirements] = useState('');

  // Honeypot spam trap
  const [honeypot, setHoneypot] = useState('');

  // Section E: Final Acknowledgement
  const [acknowledged, setAcknowledged] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto calculate Total Guests = Adults + Children + Infants
  const totalGuests = Math.max(0, adults) + Math.max(0, children) + Math.max(0, infants);

  // Load packages and handle package URL query parameter
  useEffect(() => {
    const pkgFromUrl = searchParams.get('package');
    if (pkgFromUrl) {
      setSelectedPackage(pkgFromUrl);
    }

    api
      .get('/public/packages')
      .then((res) => {
        const items = res.data?.items || res.data || [];
        if (items.length > 0) {
          setPackageOptions(items);
        }
      })
      .catch(() => {});
  }, [searchParams]);

  // Adjust checkout date when stay is 24-hr or 1-day
  const handlePackageChange = (code: string) => {
    setSelectedPackage(code);
    if (code.includes('1DAY')) {
      setCheckOutDate(checkInDate);
      setCheckInTime('09:00 AM');
      setCheckOutTime('06:00 PM');
    } else {
      if (checkInDate === checkOutDate) {
        const nextDay = new Date(new Date(checkInDate).getTime() + 86400000).toISOString().split('T')[0];
        setCheckOutDate(nextDay);
      }
      setCheckInTime('12:00 PM');
      setCheckOutTime('10:00 AM');
    }
  };

  const handleVehicleCountChange = (count: number) => {
    const target = Math.max(0, Math.min(15, count));
    if (target > vehicles.length) {
      const added: VehicleInput[] = [];
      for (let i = vehicles.length; i < target; i++) {
        added.push({ vehicle_type: 'Car', registration_number: '', notes: '' });
      }
      setVehicles([...vehicles, ...added]);
    } else if (target < vehicles.length) {
      setVehicles(vehicles.slice(0, target));
    }
  };

  const updateVehicle = (index: number, field: keyof VehicleInput, value: string) => {
    const next = [...vehicles];
    next[index] = { ...next[index], [field]: value };
    setVehicles(next);
  };

  const removeVehicle = (index: number) => {
    setVehicles(vehicles.filter((_, idx) => idx !== index));
  };

  const addVehicle = () => {
    setVehicles([...vehicles, { vehicle_type: 'Car', registration_number: '', notes: '' }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    const cleanPhone = mobile.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('Please provide your residential address or location.');
      return;
    }
    if (adults < 1) {
      setErrorMsg('At least 1 adult guest is required for a booking.');
      return;
    }
    if (new Date(checkOutDate) < new Date(checkInDate)) {
      setErrorMsg('Check-out date cannot be before check-in date.');
      return;
    }
    if (!acknowledged) {
      setErrorMsg('Please confirm the booking enquiry acknowledgement before submitting.');
      return;
    }

    setSubmitting(true);

    const payload: PublicEnquiryPayload = {
      full_name: fullName.trim(),
      mobile: cleanPhone,
      whatsapp: sameAsMobile ? cleanPhone : whatsapp.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim(),
      city: city.trim() || undefined,
      state: state.trim() || 'Maharashtra',
      pin_code: pinCode.trim() || undefined,
      company_name: companyName.trim() || undefined,
      gstin: gstin.trim().toUpperCase() || undefined,
      check_in_date: checkInDate,
      check_in_time: checkInTime,
      check_out_date: checkOutDate,
      check_out_time: checkOutTime,
      package_id: selectedPackage,
      adults: Number(adults),
      children: Number(children),
      infants: Number(infants),
      number_of_rooms: Number(numberOfRooms),
      dormitory_guests: Number(dormitoryGuests),
      vehicle_count: vehicles.length,
      vehicles: vehicles
        .filter((v) => v.registration_number.trim().length > 0)
        .map((v) => ({
          vehicle_type: v.vehicle_type,
          registration_number: v.registration_number.trim().toUpperCase(),
          notes: v.notes.trim() || undefined,
        })),
      occasion,
      food_preferences: foodPreferences,
      special_requirements: specialRequirements.trim() || undefined,
      website_url_hp: honeypot, // Honeypot spam trap
    };

    try {
      const res = await api.post('/public/enquiries', payload);
      const data = res.data;
      navigate('/booking-success', {
        state: {
          enquiryReference: data.enquiry_reference,
          customerName: fullName,
          mobile: cleanPhone,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          totalGuests,
          packageCode: selectedPackage,
          vehicleCount: vehicles.length,
        },
      });
    } catch (err: any) {
      console.error('Enquiry submission error:', err);
      setErrorMsg(
        err.response?.data?.detail ||
          'Failed to submit booking enquiry. Please try again or call resort directly at 8669408484.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="py-10 sm:py-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Page Title */}
      <div className="text-center space-y-3 mb-10">
        <span className="text-xs font-bold uppercase tracking-widest text-[#004AAC]">Direct Online Reservation</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Resort Stay & Booking Enquiry
        </h1>
        <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto">
          No account or login required. Complete this simple form, and our resort team at Karjat will promptly confirm your booking and room allocations.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-8 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="block font-semibold">Please check your details:</strong>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-10">
        {/* Honeypot Spam Trap (Visually Hidden) */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website_url_hp">Leave this empty</label>
          <input
            id="website_url_hp"
            name="website_url_hp"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* =========================================================================
            SECTION A – CUSTOMER INFORMATION
            ========================================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-md space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#004AAC] flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Section A – Guest Contact Details</h2>
              <p className="text-xs text-slate-500">Primary guest for booking verification & updates</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3.5 text-xs font-bold text-slate-400">+91</span>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="98XXXXXXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm font-medium"
                />
              </div>
            </div>

            {/* WhatsApp Number */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  WhatsApp Number
                </label>
                <label className="text-xs text-slate-500 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsMobile}
                    onChange={(e) => setSameAsMobile(e.target.checked)}
                    className="rounded text-[#004AAC]"
                  />
                  <span>Same as mobile</span>
                </label>
              </div>
              {!sameAsMobile ? (
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-xs font-bold text-slate-400">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="98XXXXXXXX"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm font-medium"
                  />
                </div>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 font-medium">
                  {mobile ? `+91 ${mobile}` : 'Same as mobile number above'}
                </div>
              )}
            </div>

            {/* Email Address */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Email Address <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            {/* City */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                City / Town
              </label>
              <input
                type="text"
                placeholder="e.g. Mumbai, Pune, Thane"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            {/* Residential Address */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Full Residential Address <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                placeholder="Apartment, Street, Area"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            {/* State & PIN code */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">PIN Code</label>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. 400001"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            {/* Optional Corporate Details */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Company Name <span className="text-slate-400 font-normal">(For Corporate Invoice)</span>
              </label>
              <input
                type="text"
                placeholder="Optional company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                GSTIN <span className="text-slate-400 font-normal">(Optional GST Number)</span>
              </label>
              <input
                type="text"
                maxLength={15}
                placeholder="27XXXXXXXXXXXXX"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm font-mono"
              />
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION B – BOOKING DETAILS & GUEST COUNTS
            ========================================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-md space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Section B – Stay Dates & Guest Counts</h2>
              <p className="text-xs text-slate-500">Select dates, package, and total group composition</p>
            </div>
          </div>

          {/* Package Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Selected Package <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {packageOptions.map((pkg) => {
                const isSelected = selectedPackage === pkg.package_code;
                return (
                  <div
                    key={pkg.id || pkg.package_code}
                    onClick={() => handlePackageChange(pkg.package_code)}
                    className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#004AAC] bg-blue-50/60 shadow-xs ring-1 ring-[#004AAC]'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">{pkg.name}</span>
                      <input
                        type="radio"
                        name="package_selection"
                        checked={isSelected}
                        onChange={() => handlePackageChange(pkg.package_code)}
                        className="mt-1 text-[#004AAC]"
                      />
                    </div>
                    <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
                      <span>Rate: ₹{pkg.weekday_rate.toLocaleString('en-IN')} (Wkday)</span>
                      <span>₹{pkg.weekend_rate.toLocaleString('en-IN')} (Wkend)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stay Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Check-in Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                min={new Date().toISOString().split('T')[0]}
                value={checkInDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setCheckInDate(val);
                  if (!val) return;
                  const parsedIn = new Date(val);
                  if (Number.isNaN(parsedIn.getTime())) return;
                  if (selectedPackage.includes('1DAY')) {
                    setCheckOutDate(val);
                  } else if (!checkOutDate || parsedIn >= new Date(checkOutDate)) {
                    const next = new Date(parsedIn.getTime() + 86400000)
                      .toISOString()
                      .split('T')[0];
                    setCheckOutDate(next);
                  }
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm font-medium"
              />
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Check-in Time: {checkInTime}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Check-out Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                min={checkInDate}
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm font-medium"
              />
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Check-out Time: {checkOutTime}
              </span>
            </div>
          </div>

          {/* Guest Count Steppers */}
          <div className="pt-2 space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Guest Composition & Headcount
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Adults */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="block text-sm font-bold text-slate-800">Adults</span>
                  <span className="text-xs text-slate-500">Age 10+ yrs</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAdults(Math.max(1, adults - 1))}
                    className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-extrabold text-base text-slate-900">{adults}</span>
                  <button
                    type="button"
                    onClick={() => setAdults(adults + 1)}
                    className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Children */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="block text-sm font-bold text-slate-800">Children</span>
                  <span className="text-xs text-slate-500">Age 5–10 yrs</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setChildren(Math.max(0, children - 1))}
                    className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-extrabold text-base text-slate-900">{children}</span>
                  <button
                    type="button"
                    onClick={() => setChildren(children + 1)}
                    className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Infants */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="block text-sm font-bold text-slate-800">Infants</span>
                  <span className="text-xs text-slate-500">Below 5 yrs (Free)</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setInfants(Math.max(0, infants - 1))}
                    className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-extrabold text-base text-slate-900">{infants}</span>
                  <button
                    type="button"
                    onClick={() => setInfants(infants + 1)}
                    className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Total Guests Auto-Calculation Display */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#004AAC]" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#004AAC] block">
                    Total Guest Count (Formula: Adults + Children + Infants)
                  </span>
                  <span className="text-xs text-slate-600">
                    {adults} Adults + {children} Children + {infants} Infants
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-[#004AAC]">{totalGuests}</span>
                <span className="text-xs text-slate-500 block">Total Guests</span>
              </div>
            </div>
          </div>

          {/* Rooms and Dormitory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Rooms / Cottages Requested
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={numberOfRooms}
                onChange={(e) => setNumberOfRooms(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Dormitory Guests <span className="text-slate-400 font-normal">(Optional Group Hall)</span>
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={dormitoryGuests}
                onChange={(e) => setDormitoryGuests(Math.max(0, Number(e.target.value)))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION C – VEHICLE INFORMATION
            ========================================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-md space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Section C – Vehicle Arrival Details</h2>
              <p className="text-xs text-slate-500">Safe parking reservation & security gate verification</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-purple-950">
                How many vehicles will be arriving at the resort?
              </h3>
              <p className="text-xs text-purple-800">
                Cars, SUVs, Bikes, or Tempo Travellers (You can enter 0 if arriving by train/bus)
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleVehicleCountChange(vehicles.length - 1)}
                className="w-9 h-9 rounded-full bg-white border border-purple-200 flex items-center justify-center font-bold text-purple-900 hover:bg-purple-100 active:scale-95 shadow-xs"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-black text-xl text-purple-900">{vehicles.length}</span>
              <button
                type="button"
                onClick={() => handleVehicleCountChange(vehicles.length + 1)}
                className="w-9 h-9 rounded-full bg-white border border-purple-200 flex items-center justify-center font-bold text-purple-900 hover:bg-purple-100 active:scale-95 shadow-xs"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dynamic Vehicle Entry Cards */}
          {vehicles.length > 0 && (
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Vehicle List & Registration Numbers:
              </span>

              {vehicles.map((veh, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  <div className="sm:col-span-1 text-xs font-black text-slate-400">#{idx + 1}</div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Vehicle Type
                    </label>
                    <select
                      value={veh.vehicle_type}
                      onChange={(e) => updateVehicle(idx, 'vehicle_type', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-medium"
                    >
                      <option value="Car">Car (Sedan/Hatchback)</option>
                      <option value="SUV">SUV</option>
                      <option value="Bike">Two-Wheeler / Bike</option>
                      <option value="Tempo Traveller">Tempo Traveller</option>
                      <option value="Bus">Bus / Mini Bus</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Registration Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MH 12 AB 1234"
                      value={veh.registration_number}
                      onChange={(e) => updateVehicle(idx, 'registration_number', e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white font-mono uppercase"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Model / Color Note
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. White Creta"
                      value={veh.notes}
                      onChange={(e) => updateVehicle(idx, 'notes', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeVehicle(idx)}
                      className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Remove Vehicle"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={addVehicle}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#004AAC] bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Vehicle</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* =========================================================================
            SECTION D – OCCASION & FOOD PREFERENCES
            ========================================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-md space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <PartyPopper className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Section D – Occasion & Food Preferences</h2>
              <p className="text-xs text-slate-500">Tell us about your celebration and dietary requests</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Visit Occasion
              </label>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm bg-white"
              >
                <option value="Family gathering">Family Gathering</option>
                <option value="Birthday">Birthday Celebration</option>
                <option value="Anniversary">Anniversary Celebration</option>
                <option value="Corporate outing">Corporate Team Outing</option>
                <option value="Friends outing">Friends Weekend Trip</option>
                <option value="Other">Other Occasion</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Food Preference
              </label>
              <select
                value={foodPreferences}
                onChange={(e) => setFoodPreferences(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm bg-white"
              >
                <option value="Both Veg & Non-Veg">Both Veg & Non-Veg (Recommended)</option>
                <option value="Pure Veg Only">Pure Veg Only</option>
                <option value="Jain Food">Jain Food (No onion/garlic)</option>
                <option value="Non-Veg Only">Non-Veg Focused</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Special Requirements or Remarks <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Ground floor cottage needed for grandparents, cake arrangement for birthday, non-spicy food for toddlers..."
                value={specialRequirements}
                onChange={(e) => setSpecialRequirements(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#004AAC] text-sm"
              />
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION E – FINAL REVIEW & SUBMISSION
            ========================================================================= */}
        <section className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Section E – Final Summary & Confirmation</h2>
              <p className="text-xs text-slate-400">Review your stay details before submitting enquiry</p>
            </div>
          </div>

          {/* Quick Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-xs">
            <div>
              <span className="text-slate-400 block">Check-in:</span>
              <strong className="text-white text-sm block">{checkInDate}</strong>
              <span className="text-slate-400">{checkInTime}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Check-out:</span>
              <strong className="text-white text-sm block">{checkOutDate}</strong>
              <span className="text-slate-400">{checkOutTime}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Total Headcount:</span>
              <strong className="text-amber-300 text-sm block">{totalGuests} Guests</strong>
              <span className="text-slate-400">{adults}A • {children}C • {infants}I</span>
            </div>
            <div>
              <span className="text-slate-400 block">Arriving Vehicles:</span>
              <strong className="text-white text-sm block">{vehicles.length} Vehicles</strong>
              <span className="text-slate-400">Registered</span>
            </div>
          </div>

          {/* Mandatory Acknowledgement */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-100 text-xs space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 rounded text-amber-500 focus:ring-amber-400 w-4 h-4 shrink-0"
              />
              <span className="leading-relaxed">
                <strong>Mandatory Acknowledgement:</strong> "Submitting this form is a booking enquiry only. Your reservation will be confirmed only after room availability approval and advance payment confirmation by Blueberry Farm and Resort management."
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !acknowledged}
              className={`w-full py-4 px-8 rounded-full font-extrabold text-base flex items-center justify-center gap-2.5 shadow-xl transition-all ${
                submitting || !acknowledged
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-400 to-amber-300 text-slate-900 hover:brightness-105 active:scale-98 cursor-pointer'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
                  <span>Submitting Your Booking Request...</span>
                </>
              ) : (
                <>
                  <Calendar className="w-5 h-5 text-slate-900" />
                  <span>SUBMIT BOOKING REQUEST</span>
                </>
              )}
            </button>
          </div>

          <div className="text-center text-xs text-slate-400">
            Need urgent confirmation? Call Pranit Dabhade directly at{' '}
            <a href="tel:8669408484" className="text-amber-300 font-bold hover:underline">
              +91 86694 08484
            </a>
          </div>
        </section>
      </form>
    </div>
  );
};
