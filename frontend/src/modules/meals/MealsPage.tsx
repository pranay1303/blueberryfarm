import React, { useEffect, useState } from 'react';
import {
  Plus,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { Badge, Button, LoadingSpinner } from '../../components/UiPrimitives';

interface Meal {
  id: string;
  meal_code: string;
  name: string;
  category: string;
  dietary_type: string;
  price: number;
  price_unit: string;
  is_package_includable: boolean;
  serving_time?: string;
  description?: string;
  is_active: boolean;
}

interface KitchenGroup {
  booking_reference: string;
  guest_name: string;
  total_guests: number;
  adults: number;
  children: number;
  dietary_preference: string;
  special_instructions: string;
  check_in: string;
  check_out: string;
  package_name: string;
}

interface KitchenReport {
  report_date: string;
  summary: {
    total_active_bookings: number;
    total_headcount_to_feed: number;
    adults: number;
    children: number;
    estimated_veg_guests: number;
    estimated_non_veg_guests: number;
    estimated_jain_guests: number;
  };
  guest_groups: KitchenGroup[];
  special_meal_orders: Array<{
    id: string;
    booking_reference?: string;
    customer_name?: string;
    meal_name: string;
    quantity: number;
    dietary_type: string;
    preparation_status: string;
    special_instructions?: string;
  }>;
}

export const MealsPage: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'KITCHEN' | 'MASTER'>('KITCHEN');

  // Kitchen report state
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [kitchenData, setKitchenData] = useState<KitchenReport | null>(null);
  const [loadingKitchen, setLoadingKitchen] = useState(true);

  // Meal master state
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // New meal modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mealCode, setMealCode] = useState('');
  const [mealName, setMealName] = useState('');
  const [mealCat, setMealCat] = useState('Lunch');
  const [dietType, setDietType] = useState('Vegetarian');
  const [price, setPrice] = useState(0);
  const [priceUnit, setPriceUnit] = useState('Per Plate');
  const [isPackageIncludable, setIsPackageIncludable] = useState(true);
  const [servingTime, setServingTime] = useState('1:30 PM');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchKitchenReport = async () => {
    setLoadingKitchen(true);
    try {
      const res = await api.get('/meals/kitchen-daily-report', {
        params: { target_date: reportDate },
      });
      setKitchenData(res.data);
    } catch (err) {
      console.error('Failed to load kitchen report:', err);
      addToast('Failed to load kitchen daily operations', 'error');
    } finally {
      setLoadingKitchen(false);
    }
  };

  const fetchMealsMaster = async () => {
    setLoadingMeals(true);
    try {
      const res = await api.get('/meals');
      let items: Meal[] = res.data?.items || [];
      if (categoryFilter !== 'ALL') {
        items = items.filter((m) => m.category.toLowerCase() === categoryFilter.toLowerCase());
      }
      setMeals(items);
    } catch (err) {
      console.error('Failed to load meals:', err);
      addToast('Failed to load meal master', 'error');
    } finally {
      setLoadingMeals(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'KITCHEN') {
      fetchKitchenReport();
    } else {
      fetchMealsMaster();
    }
  }, [activeTab, reportDate, categoryFilter]);

  const handleUpdateOrderStatus = async (reqId: string, status: string) => {
    try {
      await api.put(`/meals/requests/${reqId}/status`, { preparation_status: status });
      addToast(`Order status updated to ${status}`, 'success');
      fetchKitchenReport();
    } catch (err) {
      addToast('Failed to update order status', 'error');
    }
  };

  const handleCreateMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/meals', {
        meal_code: mealCode.trim().toUpperCase(),
        name: mealName.trim(),
        category: mealCat,
        dietary_type: dietType,
        price: Number(price),
        price_unit: priceUnit.trim(),
        is_package_includable: isPackageIncludable,
        serving_time: servingTime.trim(),
        description: description.trim() || undefined,
      });
      addToast('Meal item added to master', 'success');
      setIsAddModalOpen(false);
      setMealCode('');
      setMealName('');
      setDescription('');
      fetchMealsMaster();
    } catch (err: any) {
      console.error('Meal creation failed:', err);
      addToast(err.response?.data?.detail || 'Failed to create meal item', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Meals, Dining & Kitchen Operations</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
              Catering Management
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Daily kitchen production schedules, guest dietary preferences, meal master, and custom food orders.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-200/80 max-w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('KITCHEN')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'KITCHEN'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Kitchen Schedule
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('MASTER')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'MASTER'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Meal Master & Rates
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: KITCHEN OPERATIONS
          ========================================================================= */}
      {activeTab === 'KITCHEN' && (
        <div className="space-y-6">
          {/* Date Picker Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-400">Preparation Date:</span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800"
              />
              <Button variant="secondary" size="sm" onClick={fetchKitchenReport} disabled={loadingKitchen}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingKitchen ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>

            <div className="text-xs text-slate-500">
              Auto-aggregates all confirmed bookings staying on {reportDate}
            </div>
          </div>

          {loadingKitchen ? (
            <div className="py-20 flex justify-center">
              <LoadingSpinner label="Loading daily kitchen production report..." />
            </div>
          ) : !kitchenData ? (
            <div className="p-8 text-center text-slate-500">No data available.</div>
          ) : (
            <div className="space-y-6">
              {/* Daily Feeding Headcount Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md">
                  <span className="text-xs font-bold uppercase text-amber-100 block">Total Headcount to Feed</span>
                  <div className="text-3xl font-black mt-1">
                    {kitchenData.summary.total_headcount_to_feed} Guests
                  </div>
                  <span className="text-xs text-amber-100 block mt-1">
                    {kitchenData.summary.adults} Adults • {kitchenData.summary.children} Children
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold uppercase text-emerald-600 block">Vegetarian Headcount</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    ~{kitchenData.summary.estimated_veg_guests} Guests
                  </div>
                  <span className="text-xs text-slate-400 block mt-1">Pure Veg + Jain Requests</span>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold uppercase text-rose-600 block">Non-Veg Headcount</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    ~{kitchenData.summary.estimated_non_veg_guests} Guests
                  </div>
                  <span className="text-xs text-slate-400 block mt-1">Chicken / Special Non-Veg</span>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold uppercase text-indigo-600 block">Active Bookings In-House</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {kitchenData.summary.total_active_bookings} Groups
                  </div>
                  <span className="text-xs text-slate-400 block mt-1">Checked in or arriving</span>
                </div>
              </div>

              {/* Guest Groups in House */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-800">
                    In-House Guest Groups & Food Instructions ({kitchenData.guest_groups.length})
                  </h3>
                </div>

                {kitchenData.guest_groups.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No active stays registered for {reportDate}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3">Booking Ref</th>
                          <th className="px-5 py-3">Guest Name</th>
                          <th className="px-5 py-3">Headcount</th>
                          <th className="px-5 py-3">Dietary Preference</th>
                          <th className="px-5 py-3">Special Kitchen Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {kitchenData.guest_groups.map((g, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="px-5 py-3 font-mono font-bold text-[#004AAC]">
                              {g.booking_reference}
                            </td>
                            <td className="px-5 py-3 font-semibold text-slate-900">{g.guest_name}</td>
                            <td className="px-5 py-3 font-bold text-slate-800">
                              {g.total_guests} ({g.adults}A, {g.children}C)
                            </td>
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold text-[11px]">
                                {g.dietary_preference}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-600 italic">
                              {g.special_instructions || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Special Orders & A La Carte */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <h3 className="font-bold text-sm text-slate-800">
                  Special Food Orders for Today ({kitchenData.special_meal_orders.length})
                </h3>

                {kitchenData.special_meal_orders.length === 0 ? (
                  <p className="text-xs text-slate-500">No custom a la carte food orders placed for this date.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {kitchenData.special_meal_orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900 block text-sm">
                            {ord.quantity}x {ord.meal_name}
                          </span>
                          <span className="text-slate-500">
                            {ord.customer_name || 'Guest'} ({ord.booking_reference})
                          </span>
                          {ord.special_instructions && (
                            <span className="block text-[11px] text-amber-800 mt-1 italic">
                              Note: {ord.special_instructions}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <Badge
                            variant={
                              ord.preparation_status === 'Served'
                                ? 'success'
                                : ord.preparation_status === 'Ready'
                                ? 'info'
                                : ord.preparation_status === 'Preparing'
                                ? 'warning'
                                : 'neutral'
                            }
                          >
                            {ord.preparation_status}
                          </Badge>

                          <select
                            value={ord.preparation_status}
                            onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                            className="text-[11px] px-2 py-1 rounded-md border border-slate-300 bg-white"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Preparing">Preparing</option>
                            <option value="Ready">Ready</option>
                            <option value="Served">Served</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: MEAL MASTER & RATES
          ========================================================================= */}
      {activeTab === 'MASTER' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(['ALL', 'Breakfast', 'Lunch', 'Hi-Tea / Snacks', 'Dinner', 'Extra Meals'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'All Meals' : cat}
                </button>
              ))}
            </div>

            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Add Meal Item</span>
            </Button>
          </div>

          {loadingMeals ? (
            <div className="py-20 flex justify-center">
              <LoadingSpinner label="Loading meal master..." />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {meals.map((m) => (
                <div
                  key={m.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-amber-400 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          {m.meal_code}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-1">{m.name}</h3>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                          m.dietary_type === 'Vegetarian'
                            ? 'bg-emerald-50 text-emerald-700'
                            : m.dietary_type === 'Non-Vegetarian'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-blue-50 text-[#004AAC]'
                        }`}
                      >
                        {m.dietary_type}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2">{m.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Pricing</span>
                      {m.is_package_includable && m.price === 0 ? (
                        <span className="font-bold text-emerald-600">Included in Package</span>
                      ) : (
                        <span className="font-black text-slate-900">
                          ₹{m.price} <span className="text-slate-400 font-normal">/ {m.price_unit}</span>
                        </span>
                      )}
                    </div>
                    {m.serving_time && (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Serving</span>
                        <span className="text-slate-600 font-medium">{m.serving_time}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Meal Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add Meal Item to Master"
          size="md"
        >
          <form onSubmit={handleCreateMeal} className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Meal Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MEAL-CHICKEN-65"
                  value={mealCode}
                  onChange={(e) => setMealCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Meal Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chicken 65 Platter"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Category</label>
                <select
                  value={mealCat}
                  onChange={(e) => setMealCat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Hi-Tea / Snacks">Hi-Tea / Snacks</option>
                  <option value="Dinner">Dinner</option>
                  <option value="Extra Meals">Extra Meals</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Dietary Type</label>
                <select
                  value={dietType}
                  onChange={(e) => setDietType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="Vegetarian">Vegetarian</option>
                  <option value="Non-Vegetarian">Non-Vegetarian</option>
                  <option value="Jain">Jain (No onion/garlic)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Price Unit</label>
                <input
                  type="text"
                  value={priceUnit}
                  onChange={(e) => setPriceUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase">Serving Time</label>
                <input
                  type="text"
                  placeholder="e.g. 1:30 PM"
                  value={servingTime}
                  onChange={(e) => setServingTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="pkgInc"
                  checked={isPackageIncludable}
                  onChange={(e) => setIsPackageIncludable(e.target.checked)}
                  className="rounded border-slate-300 text-[#004AAC]"
                />
                <label htmlFor="pkgInc" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Included in Package
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">Description</label>
              <input
                type="text"
                placeholder="Brief dish description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button variant="secondary" size="sm" type="button" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Meal'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
