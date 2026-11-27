import React, { useEffect, useState } from 'react';
import {
  Car,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import { Badge, Button, LoadingSpinner } from '../../components/UiPrimitives';
import type { Vehicle } from '../../types';

export const VehiclesPage: React.FC = () => {
  const { addToast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('ALL');

  // Manual vehicle registration modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [regNumber, setRegNumber] = useState('');
  const [vehType, setVehType] = useState('Car');
  const [guestName, setGuestName] = useState('');
  const [guestMobile, setGuestMobile] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/vehicles', { params });
      let items: Vehicle[] = res.data?.items || [];
      if (vehicleTypeFilter !== 'ALL') {
        items = items.filter((v) => v.vehicle_type?.toLowerCase() === vehicleTypeFilter.toLowerCase());
      }
      setVehicles(items);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
      addToast('Failed to load vehicles registry', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [vehicleTypeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVehicles();
  };

  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNumber.trim()) {
      addToast('Please enter registration number', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/vehicles', {
        registration_number: regNumber.trim().toUpperCase(),
        vehicle_type: vehType,
        customer_name: guestName.trim() || undefined,
        customer_mobile: guestMobile.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      addToast('Vehicle registered at resort gate successfully', 'success');
      setIsAddModalOpen(false);
      setRegNumber('');
      setGuestName('');
      setGuestMobile('');
      setNotes('');
      fetchVehicles();
    } catch (err: any) {
      console.error('Failed to register vehicle:', err);
      addToast(err.response?.data?.detail || 'Failed to register vehicle', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Resort Vehicle Registry</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-bold">
              Gate Management
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Track guest vehicles, parking passes, registrations, and security arrivals at Blueberry Farm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchVehicles} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>Register Vehicle</span>
          </Button>
          <ClearDataButton section="vehicles" label="Vehicles" onCleared={fetchVehicles} />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Type Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'Car', 'SUV', 'Bike', 'Tempo Traveller', 'Bus'] as const).map((vt) => (
            <button
              key={vt}
              onClick={() => setVehicleTypeFilter(vt)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${vehicleTypeFilter === vt
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              {vt === 'ALL' ? 'All Vehicle Types' : vt}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search registration e.g. MH 12, MH 14..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#004AAC] focus:outline-hidden font-mono uppercase"
            />
          </div>
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
      </div>

      {/* Vehicles Table */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner label="Loading vehicle records..." />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 space-y-3">
          <Car className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">No Vehicles Registered</h3>
          <p className="text-xs text-slate-500">
            Vehicles declared by guests in booking enquiries or registered at the entrance gate will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Cards View */}
          <div className="space-y-3 md:hidden">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-black text-sm text-slate-900 tracking-wide block">
                      {v.registration_number}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1 rounded-md bg-purple-50 text-purple-700 font-semibold text-xs">
                      <Car className="w-3.5 h-3.5" />
                      <span>{v.vehicle_type}</span>
                    </span>
                  </div>
                  <Badge variant="success">Parked</Badge>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Guest / Owner:</span>
                    <span className="font-bold text-slate-800">{v.customer_name || 'Walk-in Guest'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mobile:</span>
                    <span className="font-semibold text-slate-700">{v.customer_mobile ? `+91 ${v.customer_mobile}` : '—'}</span>
                  </div>
                  {v.notes && (
                    <div className="pt-1 border-t border-slate-200/60 flex justify-between">
                      <span className="text-slate-500">Model / Notes:</span>
                      <span className="italic text-slate-600">{v.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Registration Number</th>
                    <th className="px-5 py-3.5">Vehicle Type</th>
                    <th className="px-5 py-3.5">Guest / Owner</th>
                    <th className="px-5 py-3.5">Contact</th>
                    <th className="px-5 py-3.5">Notes / Model</th>
                    <th className="px-5 py-3.5">Gate Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-mono font-black text-sm text-slate-900">
                        {v.registration_number}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 font-semibold text-xs">
                          <Car className="w-3.5 h-3.5" />
                          <span>{v.vehicle_type}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        {v.customer_name || 'Walk-in Guest'}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {v.customer_mobile ? `+91 ${v.customer_mobile}` : '—'}
                      </td>
                      <td className="px-5 py-4 text-slate-500 italic">
                        {v.notes || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="success">Parked / Registered</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Manual Registration Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Gate Vehicle Registration"
          size="md"
        >
          <form onSubmit={handleManualRegister} className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Registration Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. MH 12 AB 1234"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:ring-2 focus:ring-[#004AAC] focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">Vehicle Type</label>
              <select
                value={vehType}
                onChange={(e) => setVehType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="Car">Car</option>
                <option value="SUV">SUV</option>
                <option value="Bike">Bike / Two-Wheeler</option>
                <option value="Tempo Traveller">Tempo Traveller</option>
                <option value="Bus">Bus</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Guest Name</label>
                <input
                  type="text"
                  placeholder="Guest name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Mobile Number</label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  value={guestMobile}
                  onChange={(e) => setGuestMobile(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">Model / Notes</label>
              <input
                type="text"
                placeholder="e.g. White Fortuner, Driver with guest"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" size="sm" type="button" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={submitting}>
                {submitting ? 'Registering...' : 'Register Vehicle'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
