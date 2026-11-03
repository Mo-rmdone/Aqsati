import type { ShopSettings, ShopSettingsInput } from '../api/settings';
import { normalizeDigits } from '../api/sales';
import { DEFAULT_TEMPLATE } from './template';

export interface SettingsForm {
  name: string;
  address: string;
  phone: string;
  rate: string;
  years: number | null;
  template: string;
}

export function formFromSettings(s: ShopSettings): SettingsForm {
  return {
    name: s.name,
    address: s.address ?? '',
    phone: s.phone ?? '',
    rate: s.defaultRate === null ? '' : String(s.defaultRate),
    years: s.defaultYears,
    template: s.whatsappTemplate && s.whatsappTemplate.trim() ? s.whatsappTemplate : DEFAULT_TEMPLATE,
  };
}

export function validateSettings(f: SettingsForm): Partial<Record<keyof SettingsForm, string>> {
  const errors: Partial<Record<keyof SettingsForm, string>> = {};
  const name = f.name.trim();
  if (!name || name.length > 80) errors.name = 'اكتب اسم المحل';

  const phone = normalizeDigits(f.phone).trim();
  if (phone && (!/^\d+$/.test(phone) || phone.length > 20)) errors.phone = 'اكتب رقم تليفون صحيح';

  const rate = normalizeDigits(f.rate).trim();
  if (rate) {
    const n = Number(rate);
    if (!/^\d+(\.\d+)?$/.test(rate) || n < 0 || n > 200) errors.rate = 'النسبة من 0 لـ 200';
  }

  if (f.template.length > 500) errors.template = 'الرسالة طويلة (500 حرف بالكتير)';
  return errors;
}

/** Normalized payload for the RPC. A blank template or one equal to the default is stored as null. */
export function toInput(f: SettingsForm): ShopSettingsInput {
  const rate = normalizeDigits(f.rate).trim();
  const phone = normalizeDigits(f.phone).trim();
  const template = f.template.trim() === '' || f.template === DEFAULT_TEMPLATE ? null : f.template;
  return {
    name: f.name.trim(),
    address: f.address.trim() || null,
    phone: phone || null,
    defaultRate: rate ? Number(rate) : null,
    defaultYears: f.years,
    whatsappTemplate: template,
  };
}

/** The input to save, or null when nothing differs from what is stored. */
export function diffSettings(f: SettingsForm, saved: ShopSettings): ShopSettingsInput | null {
  const next = toInput(f);
  const prev = toInput(formFromSettings(saved));
  const changed = (Object.keys(next) as (keyof ShopSettingsInput)[]).some((k) => next[k] !== prev[k]);
  return changed ? next : null;
}
