// Client-side mirrors of the server rules; sale messages are verbatim from
// supabase/migrations/0013 create_sale so UI and server speak the same words.

const PHONE_RE = /^01[0125][0-9]{8}$/;
const NATIONAL_ID_RE = /^[23][0-9]{13}$/;

type Errors<K extends string> = Partial<Record<K, string>>;

export function validateCustomer(c: {
  name: string;
  phone: string;
  nationalId?: string;
}): Errors<'name' | 'phone' | 'nationalId'> {
  const e: Errors<'name' | 'phone' | 'nationalId'> = {};
  if (!c.name.trim()) e.name = 'اسم العميل مطلوب';
  if (!PHONE_RE.test(c.phone)) e.phone = 'رقم الموبايل غير صحيح';
  if (c.nationalId && !NATIONAL_ID_RE.test(c.nationalId)) e.nationalId = 'الرقم القومي غير صحيح';
  return e;
}

export function validateSale(s: {
  productDesc: string;
  totalPrice: number;
  saleType: 'installment' | 'cash';
  down: number;
  ratePercent: number;
  years: number;
}): Errors<'productDesc' | 'totalPrice' | 'down' | 'ratePercent' | 'years'> {
  const e: Errors<'productDesc' | 'totalPrice' | 'down' | 'ratePercent' | 'years'> = {};
  if (!s.productDesc.trim()) e.productDesc = 'اسم المنتج مطلوب';
  if (!Number.isFinite(s.totalPrice) || s.totalPrice <= 0) e.totalPrice = 'السعر لازم يكون أكبر من صفر';
  if (s.saleType === 'installment') {
    if (!Number.isFinite(s.down) || s.down < 0 || s.down >= s.totalPrice) e.down = 'المقدم لازم يكون أقل من السعر';
    if (!Number.isFinite(s.ratePercent) || s.ratePercent < 0 || s.ratePercent > 200)
      e.ratePercent = 'نسبة الفائدة لازم تكون بين 0 و 200';
    if (!Number.isInteger(s.years) || s.years < 1 || s.years > 5) e.years = 'عدد السنين لازم يكون من 1 إلى 5';
  }
  return e;
}
