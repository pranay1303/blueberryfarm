import React, { useState } from 'react';
import { BookmarkPlus, Check, Plus, Utensils } from 'lucide-react';
import type { LineItem, MealAddonPreset } from '../types';
import { formatINR } from '../utils/format';

export type { MealAddonPreset };

export const DEFAULT_MEAL_ADDONS: MealAddonPreset[] = [
  { name: 'Bhaji (Veg Pakora)', rate: 150, unit: 'plate' },
  { name: 'Chicken 65', rate: 320, unit: 'plate' },
  { name: 'Paneer Chilli', rate: 260, unit: 'plate' },
  { name: 'Fish Fry / Surmai', rate: 380, unit: 'plate' },
  { name: 'Chicken Tandoori', rate: 350, unit: 'plate' },
  { name: 'Veg Thali', rate: 250, unit: 'plate' },
  { name: 'Non-Veg Thali', rate: 350, unit: 'plate' },
  { name: 'Tea / Coffee', rate: 40, unit: 'cup' },
  { name: 'Water Bottle', rate: 20, unit: 'bottle' },
  { name: 'Extra Bed / Mattress', rate: 400, unit: 'night' },
  { name: 'Bonfire Setup', rate: 800, unit: 'event' },
  { name: 'DJ / Sound System', rate: 2500, unit: 'event' },
];

interface MealAddonPickerProps {
  addons?: MealAddonPreset[];
  onAddItem: (item: LineItem) => void;
  onSaveAddon?: (addon: MealAddonPreset) => Promise<void>;
  title?: string;
}

export const MealAddonPicker: React.FC<MealAddonPickerProps> = ({
  addons,
  onAddItem,
  onSaveAddon,
  title = 'Quick Meals & Add-ons (1-Tap Add)',
}) => {
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customRate, setCustomRate] = useState('');
  const [customUnit, setCustomUnit] = useState('plate');
  const [saveToMenu, setSaveToMenu] = useState(true);
  const [savingPreset, setSavingPreset] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  const list = addons && addons.length > 0 ? addons : DEFAULT_MEAL_ADDONS;

  const handleAddCustom = async () => {
    const trimmed = customName.trim();
    const rate = Number(customRate);
    if (!trimmed || !Number.isFinite(rate) || rate < 0) return;
    const qty = Math.max(1, Number(customQty) || 1);
    const unit = customUnit.trim() || 'plate';

    onAddItem({
      description: trimmed,
      quantity: qty,
      rate,
      unit,
      discount: 0,
      tax_rate: 0,
    });

    if (onSaveAddon && saveToMenu) {
      const alreadyExists = list.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (!alreadyExists) {
        setSavingPreset(true);
        try {
          await onSaveAddon({ name: trimmed, rate, unit });
          setSavedNotice(`Saved "${trimmed}" to quick menu`);
          setTimeout(() => setSavedNotice(''), 2500);
        } finally {
          setSavingPreset(false);
        }
      }
    }

    setCustomName('');
    setCustomQty(1);
    setCustomRate('');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0752A5]">
          <Utensils className="h-3.5 w-3.5" />
          {title}
        </span>
        {savedNotice ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <Check className="h-3 w-3" /> {savedNotice}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Tap to add to bill</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {list.map((addon) => (
          <button
            key={`${addon.name}-${addon.rate}`}
            type="button"
            onClick={() =>
              onAddItem({
                description: addon.name,
                quantity: 1,
                rate: addon.rate,
                unit: addon.unit || 'plate',
                discount: 0,
                tax_rate: 0,
              })
            }
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-[#D5DEFF]/50 hover:border-[#0752A5] transition-colors"
          >
            <Plus className="h-3 w-3 text-[#0752A5]" />
            <span>{addon.name}</span>
            <span className="text-slate-500">· {formatINR(addon.rate)}</span>
          </button>
        ))}
      </div>

      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-12 gap-1.5 items-center">
          <input
            type="text"
            className="input text-xs py-1.5 col-span-2 sm:col-span-5"
            placeholder="Custom dish / add-on (e.g. Fish Curry)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddCustom();
              }
            }}
          />
          <input
            type="number"
            min={1}
            className="input text-xs py-1.5 col-span-1 sm:col-span-2"
            placeholder="Qty"
            value={customQty}
            onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
          />
          <input
            type="number"
            min={0}
            className="input text-xs py-1.5 col-span-1 sm:col-span-3"
            placeholder="Rate ₹"
            value={customRate}
            onChange={(e) => setCustomRate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddCustom();
              }
            }}
          />
          <button
            type="button"
            disabled={!customName.trim() || customRate === '' || savingPreset}
            onClick={() => void handleAddCustom()}
            className="btn-secondary text-xs py-1.5 px-2 col-span-2 sm:col-span-2 justify-center cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {onSaveAddon && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-[#0752A5] focus:ring-[#0752A5]"
                checked={saveToMenu}
                onChange={(e) => setSaveToMenu(e.target.checked)}
              />
              <BookmarkPlus className="h-3.5 w-3.5 text-[#0752A5]" />
              <span>Save custom item to quick menu for future bills</span>
            </label>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Unit:</span>
              <input
                type="text"
                className="input text-[11px] py-0.5 px-2 w-20"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="plate"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
