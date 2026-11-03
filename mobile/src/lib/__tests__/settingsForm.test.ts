import { DEFAULT_TEMPLATE } from '../template';
import { diffSettings, formFromSettings, validateSettings, type SettingsForm } from '../settingsForm';
import type { ShopSettings } from '../../api/settings';

const saved: ShopSettings = {
  name: 'محل النور',
  address: 'شارع التحرير',
  phone: '01012345678',
  logoPath: null,
  defaultRate: 12,
  defaultYears: 3,
  whatsappTemplate: null,
};

const ok: SettingsForm = formFromSettings(saved);

test('valid form has no errors', () => {
  expect(validateSettings(ok)).toEqual({});
});

test('name is required and capped at 80', () => {
  expect(validateSettings({ ...ok, name: '  ' }).name).toBe('اكتب اسم المحل');
  expect(validateSettings({ ...ok, name: 'ا'.repeat(81) }).name).toBe('اكتب اسم المحل');
  expect(validateSettings({ ...ok, name: 'ا'.repeat(80) }).name).toBeUndefined();
});

test('phone is optional, digits only (Arabic digits ok), max 20', () => {
  expect(validateSettings({ ...ok, phone: '' }).phone).toBeUndefined();
  expect(validateSettings({ ...ok, phone: '٠١٠١٢٣٤٥٦٧٨' }).phone).toBeUndefined();
  expect(validateSettings({ ...ok, phone: '01a' }).phone).toBeTruthy();
  expect(validateSettings({ ...ok, phone: '1'.repeat(21) }).phone).toBeTruthy();
});

test('rate is empty or 0 to 200', () => {
  const msg = 'النسبة من 0 لـ 200';
  expect(validateSettings({ ...ok, rate: '' }).rate).toBeUndefined();
  expect(validateSettings({ ...ok, rate: '0' }).rate).toBeUndefined();
  expect(validateSettings({ ...ok, rate: '200' }).rate).toBeUndefined();
  expect(validateSettings({ ...ok, rate: '200.5' }).rate).toBe(msg);
  expect(validateSettings({ ...ok, rate: 'abc' }).rate).toBe(msg);
});

test('template max 500', () => {
  expect(validateSettings({ ...ok, template: 'ا'.repeat(501) }).template).toBe('الرسالة طويلة (500 حرف بالكتير)');
  expect(validateSettings({ ...ok, template: 'ا'.repeat(500) }).template).toBeUndefined();
});

test('an unchanged form has no diff, even with the default template shown', () => {
  expect(ok.template).toBe(DEFAULT_TEMPLATE);
  expect(diffSettings(ok, saved)).toBeNull();
});

test('template equal to default or blank is saved as null', () => {
  const custom = { ...saved, whatsappTemplate: 'مرحبا {العميل}' };
  expect(diffSettings({ ...formFromSettings(custom), template: DEFAULT_TEMPLATE }, custom)?.whatsappTemplate).toBeNull();
  expect(diffSettings({ ...formFromSettings(custom), template: '   ' }, custom)?.whatsappTemplate).toBeNull();
});

test('diff returns the full normalized input', () => {
  const d = diffSettings({ ...ok, name: ' محل جديد ', address: '', rate: '٩.5', years: null, template: 'اهلا {العميل}' }, saved);
  expect(d).toEqual({
    name: 'محل جديد',
    address: null,
    phone: '01012345678',
    defaultRate: 9.5,
    defaultYears: null,
    whatsappTemplate: 'اهلا {العميل}',
  });
});

test('formFromSettings maps nulls to empty fields', () => {
  const f = formFromSettings({ ...saved, address: null, phone: null, defaultRate: null, defaultYears: null });
  expect(f).toMatchObject({ address: '', phone: '', rate: '', years: null });
});
