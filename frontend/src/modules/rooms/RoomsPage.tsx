import React, { useEffect, useState } from 'react';
import {
  Bed,
  Home,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { Badge, Button, LoadingSpinner } from '../../components/UiPrimitives';

interface Room {
  id: string;
  room_number: string;
  room_name: string;
  accommodation_type: string;
  room_category: string;
  capacity: number;
  number_of_beds: number;
  is_ac: boolean;
  base_rate: number;
  extra_guest_charge: number;
  cleaning_status: string;
  amenities: string;
  notes?: string;
  is_active: boolean;
}

export const RoomsPage: React.FC = () => {
  const { addToast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');

  // New room modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [roomName, setRoomName] = useState('');
  const [accType, setAccType] = useState('Cottage');
  const [roomCat, setRoomCat] = useState('Deluxe AC');
  const [capacity, setCapacity] = useState(4);
  const [beds, setBeds] = useState(2);
  const [isAc, setIsAc] = useState(true);
  const [baseRate, setBaseRate] = useState(2500);
  const [cleaningStatus, setCleaningStatus] = useState('Clean');
  const [amenities, setAmenities] = useState('AC, Attached Bathroom, Double Bed, Hot Water');
  const [submitting, setSubmitting] = useState(false);

  // Availability check
  const [checkIn, setCheckIn] = useState(new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [checkingAvail, setCheckingAvail] = useState(false);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rooms');
      let items: Room[] = res.data?.items || [];
      if (typeFilter !== 'ALL') {
        items = items.filter((r) => r.accommodation_type.toLowerCase() === typeFilter.toLowerCase());
      }
      setRooms(items);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      addToast('Failed to load rooms inventory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [typeFilter]);

  const handleCheckAvailability = async () => {
    setCheckingAvail(true);
    try {
      const res = await api.get('/rooms/availability', {
        params: { check_in_date: checkIn, check_out_date: checkOut },
      });
      setAvailableCount(res.data.available_count);
    } catch (err) {
      console.error('Availability check failed:', err);
      addToast('Failed to check availability', 'error');
    } finally {
      setCheckingAvail(false);
    }
  };

  const handleUpdateCleaningStatus = async (roomId: string, newStatus: string) => {
    try {
      await api.put(`/rooms/${roomId}`, { cleaning_status: newStatus });
      addToast(`Room status updated to ${newStatus}`, 'success');
      fetchRooms();
    } catch (err) {
      addToast('Failed to update status', 'error');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/rooms', {
        room_number: roomNumber.trim(),
        room_name: roomName.trim(),
        accommodation_type: accType,
        room_category: roomCat,
        capacity: Number(capacity),
        number_of_beds: Number(beds),
        is_ac: isAc,
        base_rate: Number(baseRate),
        cleaning_status: cleaningStatus,
        amenities: amenities.trim(),
      });
      addToast('Room created successfully', 'success');
      setIsAddModalOpen(false);
      setRoomNumber('');
      setRoomName('');
      fetchRooms();
    } catch (err: any) {
      console.error('Create room error:', err);
      addToast(err.response?.data?.detail || 'Failed to create room', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getCleaningBadge = (st: string) => {
    switch (st.toLowerCase()) {
      case 'clean':
        return <Badge variant="success">Clean & Ready</Badge>;
      case 'dirty':
        return <Badge variant="warning">Dirty / Housekeeping Needed</Badge>;
      case 'under maintenance':
        return <Badge variant="danger">Under Maintenance</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Rooms & Accommodation Inventory</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-[#004AAC] font-bold">
              Resort Lodging
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage cottages, AC rooms, family suites, dormitories, capacity, and housekeeping status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchRooms} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>Add Room / Cottage</span>
          </Button>
        </div>
      </div>

      {/* Availability Checker Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-[#004AAC] text-white p-5 rounded-2xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-200 block">
            Instant Availability Checker
          </span>
          <h2 className="text-lg font-bold text-white">Check Real-Time Room Availability</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 text-xs">
            <span>In:</span>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-hidden"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 text-xs">
            <span>Out:</span>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-hidden"
            />
          </div>
          <button
            type="button"
            onClick={handleCheckAvailability}
            disabled={checkingAvail}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-extrabold active:scale-95 transition-all cursor-pointer"
          >
            {checkingAvail ? 'Checking...' : 'Check Availability'}
          </button>
        </div>

        {availableCount !== null && (
          <div className="px-4 py-2 rounded-xl bg-white/20 text-amber-200 text-xs font-bold whitespace-nowrap">
            ✓ {availableCount} Rooms Available for these dates
          </div>
        )}
      </div>

      {/* Type Filter */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
        {(['ALL', 'Cottage', 'Room', 'Suite', 'Dormitory'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              typeFilter === t
                ? 'bg-[#004AAC] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t === 'ALL' ? 'All Accommodation' : `${t}s`}
          </button>
        ))}
      </div>

      {/* Rooms Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner label="Loading accommodation inventory..." />
        </div>
      ) : rooms.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 space-y-3">
          <Home className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">No Rooms Found</h3>
          <p className="text-xs text-slate-500">Add cottages and rooms to start allocating guests.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#004AAC] bg-blue-50 px-2 py-0.5 rounded-md">
                      {r.room_number}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{r.room_name}</h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-700">
                    {r.room_category}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Max {r.capacity} Guests</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Bed className="w-3.5 h-3.5 text-slate-400" />
                    <span>{r.number_of_beds} Beds</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                    <span>{r.is_ac ? 'Air Conditioned' : 'Non-AC'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-900">₹{r.base_rate}</span>
                    <span className="text-[10px] text-slate-400"> / night</span>
                  </div>
                </div>

                {r.amenities && (
                  <p className="text-xs text-slate-500 line-clamp-2">
                    <strong>Amenities:</strong> {r.amenities}
                  </p>
                )}
              </div>

              {/* Cleaning & Housekeeping Status */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Housekeeping</span>
                  {getCleaningBadge(r.cleaning_status)}
                </div>

                {/* Quick Toggle */}
                <select
                  value={r.cleaning_status}
                  onChange={(e) => handleUpdateCleaningStatus(r.id, e.target.value)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-medium focus:ring-1 focus:ring-[#004AAC]"
                >
                  <option value="Clean">Mark Clean</option>
                  <option value="Dirty">Mark Dirty</option>
                  <option value="Under Maintenance">Maintenance Block</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Room Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add Room / Accommodation Unit"
          size="md"
        >
          <form onSubmit={handleCreateRoom} className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Room / Cottage Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cottage 5, Room 201"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Room Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Garden Breeze Cottage"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Type</label>
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="Cottage">Cottage</option>
                  <option value="Room">Standard Room</option>
                  <option value="Suite">Family Suite</option>
                  <option value="Dormitory">Dormitory Hall</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Category</label>
                <select
                  value={roomCat}
                  onChange={(e) => setRoomCat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="Deluxe AC">Deluxe AC</option>
                  <option value="Family AC">Family AC</option>
                  <option value="Standard">Standard Non-AC</option>
                  <option value="Dormitory">Dormitory</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Max Guests</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Bed Count</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={beds}
                  onChange={(e) => setBeds(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Base Rate (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={baseRate}
                  onChange={(e) => setBaseRate(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold text-slate-700 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAc}
                  onChange={(e) => setIsAc(e.target.checked)}
                  className="rounded text-[#004AAC]"
                />
                <span>Air Conditioned (AC)</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">Initial Cleaning Status</label>
              <select
                value={cleaningStatus}
                onChange={(e) => setCleaningStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              >
                <option value="Clean">Clean</option>
                <option value="Dirty">Dirty</option>
                <option value="Under Maintenance">Under Maintenance</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">Amenities</label>
              <input
                type="text"
                value={amenities}
                onChange={(e) => setAmenities(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" size="sm" type="button" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Room'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
