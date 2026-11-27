import React, { useEffect, useState } from 'react';
import {
  Clock,
  Edit2,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { Badge, Button, LoadingSpinner } from '../../components/UiPrimitives';
import { formatCurrency } from '../../utils/format';

export interface AddonItem {
  id: string;
  addon_name: string;
  addon_code: string;
  category: string;
  price_type: string;
  base_price: number;
  unit: string;
  description?: string | null;
  is_prebookable: boolean;
  requires_advance_notice_hours: number;
  requires_confirmation: boolean;
  is_active: boolean;
  created_at?: string;
}

const CATEGORIES = [
  'All',
  'Celebration',
  'Food & Barbeque',
  'Bedding & Comfort',
  'Activities & Games',
  'Other',
];

export const AddonsPage: React.FC = () => {
  const { showToast } = useToast();
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<AddonItem | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    addon_name: '',
    addon_code: '',
    category: 'Celebration',
    price_type: 'FIXED',
    base_price: 500,
    unit: 'Per Setup',
    description: '',
    is_prebookable: true,
    requires_advance_notice_hours: 4,
    requires_confirmation: false,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchAddons = async () => {
    try {
      setLoading(true);
      const res = await api.get('/addons', { params: { active_only: false } });
      const rawList = res.data?.items || (Array.isArray(res.data) ? res.data : []);
      const mapped: AddonItem[] = rawList.map((a: any) => ({
        id: a.id,
        addon_name: a.name || a.addon_name || '',
        addon_code: a.addon_code,
        category: a.category || 'Celebration',
        price_type: a.pricing_type || a.price_type || 'Fixed',
        base_price: Number(a.price ?? a.base_price ?? 0),
        unit: a.pricing_type || 'Per Setup',
        description: a.description,
        is_prebookable: a.is_public ?? a.is_prebookable ?? true,
        requires_advance_notice_hours: 4,
        requires_confirmation: a.requires_admin_approval ?? a.requires_confirmation ?? false,
        is_active: a.is_active ?? true,
        created_at: a.created_at,
      }));
      setAddons(mapped);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to load add-on services', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddons();
  }, []);

  const openCreateModal = () => {
    setEditingAddon(null);
    setFormData({
      addon_name: '',
      addon_code: `ADD-${Math.floor(100 + Math.random() * 900)}`,
      category: 'Celebration',
      price_type: 'FIXED',
      base_price: 500,
      unit: 'Per Setup',
      description: '',
      is_prebookable: true,
      requires_advance_notice_hours: 4,
      requires_confirmation: false,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (addon: AddonItem) => {
    setEditingAddon(addon);
    setFormData({
      addon_name: addon.addon_name,
      addon_code: addon.addon_code,
      category: addon.category,
      price_type: addon.price_type,
      base_price: Number(addon.base_price),
      unit: addon.unit,
      description: addon.description || '',
      is_prebookable: addon.is_prebookable,
      requires_advance_notice_hours: addon.requires_advance_notice_hours,
      requires_confirmation: addon.requires_confirmation,
      is_active: addon.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.addon_name.trim()) {
      showToast('Add-on service name is required', 'warning');
      return;
    }
    setSaving(true);
    const apiPayload = {
      addon_code: formData.addon_code.trim(),
      name: formData.addon_name.trim(),
      category: formData.category,
      pricing_type: formData.price_type,
      price: Number(formData.base_price),
      description: formData.description.trim(),
      requires_admin_approval: formData.requires_confirmation,
      is_public: formData.is_prebookable,
      is_active: formData.is_active,
    };
    try {
      if (editingAddon) {
        await api.put(`/addons/${editingAddon.id}`, apiPayload);
        showToast(`Updated "${formData.addon_name}" successfully`, 'success');
      } else {
        await api.post('/addons', apiPayload);
        showToast(`Created add-on "${formData.addon_name}" successfully`, 'success');
      }
      setIsModalOpen(false);
      fetchAddons();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to save add-on service', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (addon: AddonItem) => {
    try {
      await api.put(`/addons/${addon.id}`, {
        name: addon.addon_name,
        category: addon.category,
        pricing_type: addon.price_type,
        price: addon.base_price,
        description: addon.description,
        is_public: addon.is_prebookable,
        is_active: !addon.is_active,
      });
      showToast(`Status updated for "${addon.addon_name}"`, 'success');
      fetchAddons();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to update status', 'error');
    }
  };

  const filtered = addons.filter((item) => {
    const matchesSearch =
      item.addon_name.toLowerCase().includes(search.toLowerCase()) ||
      item.addon_code.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#004AAC]" />
            <span>Add-On Services & Experiences</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage custom guest experiences, celebrations, bonfire setups, extra bedding, and special event add-ons.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={fetchAddons} disabled={loading} icon={RefreshCw}>
            Refresh
          </Button>
          <Button variant="primary" onClick={openCreateModal} icon={Plus}>
            New Add-on
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Services</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{addons.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Active & Bookable</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {addons.filter((a) => a.is_active).length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Celebration Addons</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {addons.filter((a) => a.category === 'Celebration').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">BBQ & Food Services</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {addons.filter((a) => a.category === 'Food & Barbeque').length}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search add-on name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
          />
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#004AAC] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Addons Grid */}
      {loading ? (
        <div className="py-12">
          <LoadingSpinner label="Loading resort add-on catalog..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
          <PackagePlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Add-On Services Found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {search || categoryFilter !== 'All'
              ? 'No services match your search and filter criteria.'
              : 'Add custom experiences like Bonfires, Birthday decorations, and BBQ kits.'}
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={openCreateModal} icon={Plus}>
              Create First Add-on
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((addon) => (
            <div
              key={addon.id}
              className={`bg-white rounded-xl border transition-all shadow-xs hover:shadow-md flex flex-col justify-between ${
                addon.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50/50'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      {addon.addon_code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
                      {addon.addon_name}
                    </h3>
                  </div>
                  <Badge variant={addon.is_active ? 'success' : 'neutral'}>
                    {addon.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#004AAC]">
                    <Tag className="w-3 h-3" />
                    {addon.category}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    {addon.price_type}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                  {addon.description || 'No description provided for this service.'}
                </p>

                <div className="flex items-baseline justify-between pt-3 border-t border-slate-100">
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">Rate</span>
                    <span className="text-lg font-bold text-slate-900">
                      {formatCurrency(addon.base_price)}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">/ {addon.unit}</span>
                  </div>
                  {addon.requires_advance_notice_hours > 0 && (
                    <div className="text-right">
                      <span className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" />
                        {addon.requires_advance_notice_hours}h notice
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action footer */}
              <div className="px-5 py-3 bg-slate-50/80 rounded-b-xl border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => toggleStatus(addon)}
                  className="font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
                >
                  {addon.is_active ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-emerald-600" />
                      <span>Active</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-slate-400" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditModal(addon)}
                  icon={Edit2}
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAddon ? `Edit "${editingAddon.addon_name}"` : 'Create New Add-On Service'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Service Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Bonfire with Music Setup"
                value={formData.addon_name}
                onChange={(e) => setFormData({ ...formData, addon_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Add-on Code *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. ADD-BONFIRE"
                value={formData.addon_code}
                onChange={(e) => setFormData({ ...formData, addon_code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              >
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Price Type</label>
              <select
                value={formData.price_type}
                onChange={(e) => setFormData({ ...formData, price_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              >
                <option value="FIXED">FIXED (Per Setup)</option>
                <option value="PER_PERSON">PER_PERSON</option>
                <option value="PER_HOUR">PER_HOUR</option>
                <option value="PER_UNIT">PER_UNIT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Base Price (₹) *</label>
              <input
                type="number"
                min="0"
                step="50"
                required
                value={formData.base_price}
                onChange={(e) => setFormData({ ...formData, base_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Display</label>
              <input
                type="text"
                placeholder="e.g. Per Event, Per Person, Per Kg"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Advance Notice Required (Hours)
              </label>
              <input
                type="number"
                min="0"
                value={formData.requires_advance_notice_hours}
                onChange={(e) =>
                  setFormData({ ...formData, requires_advance_notice_hours: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Details about setup, what's included, timing, and conditions..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#004AAC]/20 focus:border-[#004AAC]"
            />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formData.is_prebookable}
                onChange={(e) => setFormData({ ...formData, is_prebookable: e.target.checked })}
                className="rounded border-slate-300 text-[#004AAC] focus:ring-[#004AAC]"
              />
              <span>Available for online pre-booking</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-slate-300 text-[#004AAC] focus:ring-[#004AAC]"
              />
              <span>Active in catalog</span>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              {editingAddon ? 'Save Changes' : 'Create Add-on'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AddonsPage;
