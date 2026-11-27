import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, Edit2, Package as PackageIcon, Plus, Save, Trash2, Utensils } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage, formatINR, todayISO } from '../../utils/format';
import { EmptyState, LoadingSpinner, StatusBadge } from '../../components/UiPrimitives';
import { Modal } from '../../components/Modal';
import type { MealAddonPreset, PackageItem, ResortSettings } from '../../types';

export const PackagesPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isOwner = user?.role === 'OWNER_ADMIN';

  const [activeTab, setActiveTab] = useState<'packages' | 'addons'>('packages');

  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PackageItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Add-ons & Menu state
  const [mealAddons, setMealAddons] = useState<MealAddonPreset[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [savingAddons, setSavingAddons] = useState(false);

  // Form state
  const [formState, setFormState] = useState({
    name: '',
    description: '',
    category: 'Stay',
    weekday_rate: 1800,
    weekend_rate: 2500,
    adult_price: 1800,
    child_price: 1200,
    infant_price: 0,
    included_meals: 'Breakfast, Lunch, High Tea, Dinner',
    room_inclusion: 'AC Room',
    activities: 'Swimming Pool, Rain Dance, Indoor & Outdoor Games',
    check_in_policy: '12:00 PM',
    check_out_policy: '11:00 AM',
    additional_inclusions: '',
    exclusions: '',
    is_active: true,
  });

  // Live Calculator state
  const [calcPkgId, setCalcPkgId] = useState('');
  const [calcIn, setCalcIn] = useState(todayISO());
  const [calcOut, setCalcOut] = useState(todayISO());
  const [calcAdults, setCalcAdults] = useState(4);
  const [calcChildren, setCalcChildren] = useState(1);
  const [calcInfants, setCalcInfants] = useState(1);
  const [calcResult, setCalcResult] = useState<{
    nights: number;
    weekday_nights: number;
    weekend_nights: number;
    adult_amount: number;
    child_amount: number;
    infant_amount: number;
    total_package_amount: number;
  } | null>(null);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/packages');
      const items = (res.data.items || []) as PackageItem[];
      setPackages(items);
      if (items.length && !calcPkgId) setCalcPkgId(items[0].id);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load packages.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [calcPkgId, showToast]);

  const loadAddons = useCallback(async () => {
    setLoadingAddons(true);
    try {
      const res = await api.get('/settings');
      const s = (res.data.settings || {}) as ResortSettings;
      setMealAddons(s.meal_addons || []);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load add-on menu.'), 'error');
    } finally {
      setLoadingAddons(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadPackages();
    void loadAddons();
  }, [loadPackages, loadAddons]);

  const openCreate = () => {
    setEditing(null);
    setFormState({
      name: '',
      description: '',
      category: 'Stay',
      weekday_rate: 1800,
      weekend_rate: 2500,
      adult_price: 1800,
      child_price: 1200,
      infant_price: 0,
      included_meals: 'Breakfast, Lunch, High Tea, Dinner',
      room_inclusion: 'AC Room',
      activities: 'Swimming Pool, Rain Dance, Indoor & Outdoor Games',
      check_in_policy: '12:00 PM',
      check_out_policy: '11:00 AM',
      additional_inclusions: '',
      exclusions: '',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (p: PackageItem) => {
    setEditing(p);
    setFormState({
      name: p.name,
      description: p.description,
      category: p.category,
      weekday_rate: p.weekday_rate,
      weekend_rate: p.weekend_rate,
      adult_price: p.adult_price,
      child_price: p.child_price,
      infant_price: p.infant_price,
      included_meals: p.included_meals,
      room_inclusion: p.room_inclusion,
      activities: p.activities,
      check_in_policy: p.check_in_policy,
      check_out_policy: p.check_out_policy,
      additional_inclusions: p.additional_inclusions || '',
      exclusions: p.exclusions || '',
      is_active: p.is_active,
    });
    setModalOpen(true);
  };

  const savePkg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/packages/${editing.id}`, formState);
        showToast('Package updated successfully.', 'success');
      } else {
        await api.post('/packages', formState);
        showToast('Package created successfully.', 'success');
      }
      setModalOpen(false);
      await loadPackages();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save package.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const runCalculator = async () => {
    if (!calcPkgId) return;
    try {
      const res = await api.post('/packages/calculate', {
        package_id: calcPkgId,
        check_in_date: calcIn,
        check_out_date: calcOut,
        adults: calcAdults,
        children: calcChildren,
        infants: calcInfants,
      });
      setCalcResult(res.data.quote);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to calculate quote.'), 'error');
    }
  };

  const saveAddonMenu = async () => {
    setSavingAddons(true);
    try {
      await api.put('/settings', { meal_addons: mealAddons });
      showToast('Quick meals & add-ons saved successfully.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save add-ons.'), 'error');
    } finally {
      setSavingAddons(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#172033]">Packages & Menu Master</h1>
          <p className="text-xs text-slate-500">
            Resort packages, stay pricing & 1-tap meals / add-on dishes (Bhaji, Chicken 65, etc.)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[#E3E8F0] bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('packages')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'packages' ? 'bg-[#0752A5] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stay Packages ({packages.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('addons')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'addons' ? 'bg-[#0752A5] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Meals & Add-ons ({mealAddons.length})
            </button>
          </div>

          {activeTab === 'packages' && isOwner && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#0752A5] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#236DC4]"
            >
              <Plus className="h-4 w-4" />
              Create Package
            </button>
          )}

          {activeTab === 'addons' && isOwner && (
            <button
              type="button"
              onClick={() => void saveAddonMenu()}
              disabled={savingAddons}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingAddons ? 'Saving...' : 'Save Menu'}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'packages' ? (
        <>
          {/* Interactive Quote Calculator */}
          {packages.length > 0 && (
            <div className="rounded-2xl border border-[#236DC4]/30 bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0752A5]">
                <Calculator className="h-4 w-4" />
                <span>Dynamic Rate Calculator</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Package</label>
                  <select
                    value={calcPkgId}
                    onChange={(e) => setCalcPkgId(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-2.5 text-sm"
                  >
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Check-in</label>
                  <input
                    type="date"
                    value={calcIn}
                    onChange={(e) => setCalcIn(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Check-out</label>
                  <input
                    type="date"
                    value={calcOut}
                    onChange={(e) => setCalcOut(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-2.5 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Adults</label>
                    <input
                      type="number"
                      min={0}
                      value={calcAdults}
                      onChange={(e) => setCalcAdults(Number(e.target.value))}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">5-10y</label>
                    <input
                      type="number"
                      min={0}
                      value={calcChildren}
                      onChange={(e) => setCalcChildren(Number(e.target.value))}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">1-5y</label>
                    <input
                      type="number"
                      min={0}
                      value={calcInfants}
                      onChange={(e) => setCalcInfants(Number(e.target.value))}
                      className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void runCalculator()}
                    className="min-h-[42px] w-full rounded-xl bg-[#0752A5] px-3 text-sm font-semibold text-white hover:bg-[#236DC4]"
                  >
                    Calculate
                  </button>
                </div>
              </div>
              {calcResult && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#D5DEFF]/40 px-4 py-2.5 text-xs">
                  <span>
                    {calcResult.nights} night/day unit(s) ({calcResult.weekday_nights} weekday, {calcResult.weekend_nights} weekend) • Adults: {formatINR(calcResult.adult_amount)} • Children (5–10): {formatINR(calcResult.child_amount)} • Infants (1–5): {formatINR(calcResult.infant_amount)}
                  </span>
                  <span className="text-base font-bold text-[#0752A5]">
                    Estimated: {formatINR(calcResult.total_package_amount)}
                  </span>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <LoadingSpinner label="Loading packages..." />
          ) : packages.length === 0 ? (
            <EmptyState
              icon={<PackageIcon className="h-6 w-6" />}
              title="No packages configured"
              description="Create your first resort stay or daycation package."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {packages.map((p) => (
                <div key={p.id} className="flex flex-col justify-between rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-xs">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#0752A5]">
                          {p.package_id} • {p.category}
                        </span>
                        <h2 className="text-lg font-bold text-[#172033]">{p.name}</h2>
                      </div>
                      <StatusBadge status={p.is_active ? 'Active' : 'Inactive'} />
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">{p.description}</p>

                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F5F7FB] p-3 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-slate-500">Weekday</span>
                        <p className="font-bold text-[#172033]">{formatINR(p.weekday_rate)}/pp</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Weekend</span>
                        <p className="font-bold text-[#0752A5]">{formatINR(p.weekend_rate)}/pp</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Child (5–10)</span>
                        <p className="font-bold text-[#172033]">{formatINR(p.child_price)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Infant (1–5)</span>
                        <p className="font-bold text-emerald-700">
                          {p.infant_price === 0 ? 'Complimentary' : formatINR(p.infant_price)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <p><span className="font-semibold text-[#172033]">Meals:</span> {p.included_meals || '-'}</p>
                      <p><span className="font-semibold text-[#172033]">Stay / Room:</span> {p.room_inclusion || '-'}</p>
                      <p><span className="font-semibold text-[#172033]">Check-in / out:</span> {p.check_in_policy} to {p.check_out_policy}</p>
                      {p.additional_inclusions && (
                        <p><span className="font-semibold text-[#172033]">Rules:</span> {p.additional_inclusions}</p>
                      )}
                    </div>
                  </div>

                  {isOwner && (
                    <div className="mt-4 flex justify-end border-t border-[#E3E8F0] pt-3">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#E3E8F0] px-3.5 text-xs font-semibold text-[#0752A5] hover:bg-[#F5F7FB]"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit Rates & Inclusions
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Meals & Add-ons Menu Master */
        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#E3E8F0] pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#0752A5]">
                <Utensils className="h-4 w-4" />
                <span>Quick Meals & Custom Add-on Menu</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                These items appear as 1-tap buttons on Invoices & Quotations (e.g. Bhaji, Chicken 65, Fish Fry, Bonfire).
              </p>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => setMealAddons([...mealAddons, { name: '', rate: 0, unit: 'plate' }])}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D5DEFF] px-3.5 py-1.5 text-xs font-bold text-[#0752A5] hover:bg-[#D5DEFF]/70"
              >
                <Plus className="h-4 w-4" /> Add Item
              </button>
            )}
          </div>

          {loadingAddons ? (
            <LoadingSpinner label="Loading add-on menu..." />
          ) : mealAddons.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No custom add-on items configured yet. Click "+ Add Item" above to add dishes.
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                <span className="col-span-5">Dish / Add-on Description</span>
                <span className="col-span-3">Rate (₹)</span>
                <span className="col-span-3">Unit (e.g. plate, cup, night)</span>
                <span className="col-span-1 text-center">Action</span>
              </div>
              {mealAddons.map((addon, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-xl bg-slate-50/70 p-2 sm:p-0 sm:bg-transparent">
                  <input
                    placeholder="Dish / Item Name (e.g. Bhaji)"
                    value={addon.name}
                    disabled={!isOwner}
                    onChange={(e) => {
                      const next = [...mealAddons];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setMealAddons(next);
                    }}
                    className="col-span-12 sm:col-span-5 min-h-[38px] rounded-xl border border-[#E3E8F0] bg-white px-3 text-xs font-medium"
                  />
                  <div className="col-span-6 sm:col-span-3">
                    <input
                      type="number"
                      min={0}
                      placeholder="Rate ₹"
                      value={addon.rate}
                      disabled={!isOwner}
                      onChange={(e) => {
                        const next = [...mealAddons];
                        next[idx] = { ...next[idx], rate: Number(e.target.value) };
                        setMealAddons(next);
                      }}
                      className="min-h-[38px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-xs font-bold text-[#172033]"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-3">
                    <input
                      placeholder="Unit"
                      value={addon.unit}
                      disabled={!isOwner}
                      onChange={(e) => {
                        const next = [...mealAddons];
                        next[idx] = { ...next[idx], unit: e.target.value };
                        setMealAddons(next);
                      }}
                      className="min-h-[38px] w-full rounded-xl border border-[#E3E8F0] bg-white px-3 text-xs text-slate-600"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-center">
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setMealAddons(mealAddons.filter((_, i) => i !== idx))}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50"
                        title="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isOwner && (
            <div className="pt-3 border-t border-[#E3E8F0] flex justify-end">
              <button
                type="button"
                onClick={() => void saveAddonMenu()}
                disabled={savingAddons}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingAddons ? 'Saving Menu...' : 'Save Quick Menu Changes'}
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Package: ${editing.name}` : 'Create Package'}
      >
        <form onSubmit={savePkg} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Package Name *</label>
            <input required value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Description *</label>
            <textarea required rows={2} value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} className="w-full rounded-xl border border-[#E3E8F0] p-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Category</label>
            <select value={formState.category} onChange={(e) => setFormState({ ...formState, category: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3">
              <option value="Stay">Stay</option>
              <option value="Daycation">Daycation</option>
              <option value="Event">Event</option>
              <option value="Camping">Camping</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Weekday Rate / Person (₹) *</label>
            <input type="number" min={0} required value={formState.weekday_rate} onChange={(e) => setFormState({ ...formState, weekday_rate: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 font-bold" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Weekend Rate / Person (₹) *</label>
            <input type="number" min={0} required value={formState.weekend_rate} onChange={(e) => setFormState({ ...formState, weekend_rate: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3 font-bold text-[#0752A5]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Child 5–10 Rate (₹)</label>
            <input type="number" min={0} value={formState.child_price} onChange={(e) => setFormState({ ...formState, child_price: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Infant 1–5 Rate (₹)</label>
            <input type="number" min={0} value={formState.infant_price} onChange={(e) => setFormState({ ...formState, infant_price: Number(e.target.value) })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Included Meals</label>
            <input value={formState.included_meals} onChange={(e) => setFormState({ ...formState, included_meals: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Check-in Policy</label>
            <input value={formState.check_in_policy} onChange={(e) => setFormState({ ...formState, check_in_policy: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Check-out Policy</label>
            <input value={formState.check_out_policy} onChange={(e) => setFormState({ ...formState, check_out_policy: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Additional Inclusions / Notes</label>
            <input value={formState.additional_inclusions} onChange={(e) => setFormState({ ...formState, additional_inclusions: e.target.value })} className="min-h-[42px] w-full rounded-xl border border-[#E3E8F0] px-3" />
          </div>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button type="button" onClick={() => setModalOpen(false)} className="min-h-[44px] rounded-xl border border-[#E3E8F0] px-4 font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-[#0752A5] px-5 font-semibold text-white">
              {saving ? 'Saving...' : 'Save Package'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
