/**
 * Free, on-device understanding of short Egyptian-Arabic voice commands.
 * Fixed phrase patterns -> the same `Intent` the AI path used, so resolveIntent,
 * the choice lists, prefilled forms and spoken answers stay unchanged.
 *
 * Nothing is guessed: a part that is not said is omitted, and anything we do not
 * recognise is `{ type: 'unknown' }`. The final sanitizer mirrors `validateIntent`
 * in supabase/functions/voice-intent/logic.ts (a test pins the two together).
 */
import type { Intent, Method } from '../../../../supabase/functions/voice-intent/logic';
import { normalizeDigits } from '../../api/sales';

interface Tok {
  /** Original spelling (kept for customer names and product hints). */
  o: string;
  /** Normalized spelling (alef forms unified, ة->ه, ى->ي) for keyword matching. */
  n: string;
}

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

// ---------- numbers ----------

const UNITS: Record<string, number> = {
  واحد: 1, واحده: 1, وحده: 1,
  اتنين: 2, اثنين: 2, اثنان: 2, اتنان: 2,
  تلاته: 3, ثلاثه: 3,
  اربعه: 4,
  خمسه: 5,
  سته: 6,
  سبعه: 7,
  تمانيه: 8, ثمانيه: 8,
  تسعه: 9,
  عشره: 10,
};
// Short forms ("تلات الاف", "خمس سنين") count as numbers only before a scale/hundred/year word.
const BARE: Record<string, number> = {
  اتنين: 2, تلات: 3, ثلاث: 3, تلت: 3, اربع: 4, خمس: 5, ست: 6, سبع: 7, تمن: 8, ثمان: 8, تسع: 9, عشر: 10,
};
const TEENS: Record<string, number> = {
  احداشر: 11, حداشر: 11,  اتناشر: 12, اثناشر: 12,
  تلتاشر: 13, تلاتاشر: 13, ثلاثتاشر: 13,
  اربعتاشر: 14, اربعطاشر: 14,
  خمستاشر: 15, خمسطاشر: 15,
  ستاشر: 16, سطاشر: 16,
  سبعتاشر: 17, سبعطاشر: 17,
  تمنتاشر: 18, تمانتاشر: 18, ثمانتاشر: 18,
  تسعتاشر: 19, تسعطاشر: 19,
};
const TENS: Record<string, number> = {
  عشرين: 20, تلاتين: 30, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90,
};
const HUNDREDS: Record<string, number> = {
  ميتين: 200, مئتين: 200, مائتين: 200,
  تلتميه: 300, تلاتميه: 300, ثلاثميه: 300, تلتمايه: 300,
  ربعميه: 400, اربعميه: 400,
  خمسميه: 500, خمسمايه: 500,
  ستميه: 600, سطميه: 600,
  سبعميه: 700,
  تمنميه: 800, تمانميه: 800, ثمانميه: 800,
  تسعميه: 900,
};
const HUNDRED_BASE = set('ميه ميت مايه مئه مائه');
const THOUSAND_FIXED: Record<string, number> = { الفين: 2000, مليونين: 2000000 };
const SCALE_MULT: Record<string, number> = { الف: 1000, الاف: 1000, مليون: 1000000, ملايين: 1000000 };
const FRAC: Record<string, number> = { نص: 0.5, نصف: 0.5, ربع: 0.25 };

const isDigit = (n: string) => /^\d+(\.\d+)?$/.test(n);
const isScale = (n: string | undefined) =>
  !!n && (n in SCALE_MULT || n in THOUSAND_FIXED);
const isBigWord = (n: string | undefined) => isScale(n) || (!!n && (HUNDRED_BASE.has(n) || n in HUNDREDS));

function isKnownWord(n: string): boolean {
  return n in UNITS || n in TEENS || n in TENS || n in HUNDREDS || HUNDRED_BASE.has(n) || isScale(n);
}

/** A token that is, on its own, part of a spoken/written number. */
function numAt(ns: string[], i: number): boolean {
  const n = ns[i];
  if (n === undefined) return false;
  if (isDigit(n) || isKnownWord(n)) return true;
  if (n in BARE) return isBigWord(ns[i + 1]);
  return false;
}

interface Run {
  s: number;
  e: number;
}

/** First maximal number phrase starting at or after `from`. */
function findRun(ns: string[], from = 0): Run | null {
  for (let s = from; s < ns.length; s++) {
    const startsOk = numAt(ns, s) || (ns[s] in FRAC && isScale(ns[s + 1]));
    if (!startsOk) continue;
    let e = s + 1;
    for (;;) {
      if (e >= ns.length) break;
      if (numAt(ns, e) && !(isDigit(ns[e]) && isDigit(ns[e - 1]))) {
        e += 1;
        continue;
      }
      if (ns[e] in FRAC && (ns[e - 1] === 'و' || isScale(ns[e + 1]))) {
        e += 1;
        continue;
      }
      if (ns[e] === 'و' && e + 1 < ns.length && (numAt(ns, e + 1) || ns[e + 1] in FRAC)) {
        e += 2;
        continue;
      }
      break;
    }
    return { s, e };
  }
  return null;
}

function allRuns(ns: string[]): Run[] {
  const out: Run[] = [];
  let from = 0;
  for (;;) {
    const r = findRun(ns, from);
    if (!r) return out;
    out.push(r);
    from = r.e;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function wordValue(ns: string[], i: number): number | undefined {
  const n = ns[i];
  if (isDigit(n)) return Number(n);
  if (n in UNITS) return UNITS[n];
  if (n in TEENS) return TEENS[n];
  if (n in TENS) return TENS[n];
  if (n in BARE) return BARE[n];
  return undefined;
}

/** Value of a token list already known to be a number phrase. */
function evalNumber(ns: string[]): number | undefined {
  let total = 0;
  let current = 0;
  let lastUnit = 0;
  let unit = 1;
  let seen = false;
  let joined = false;
  for (let i = 0; i < ns.length; i++) {
    const t = ns[i];
    if (t === 'و') {
      joined = true;
      continue;
    }
    const wasJoined = joined;
    joined = false;
    if (t in FRAC) {
      seen = true;
      if (wasJoined) total += unit * FRAC[t];
      else current += FRAC[t];
      continue;
    }
    if (isDigit(t)) {
      current += Number(t);
      lastUnit = 0;
      unit = 1;
      seen = true;
    } else if (t in UNITS || (t in BARE && !(t in TENS))) {
      const v = t in UNITS ? UNITS[t] : BARE[t];
      current += v;
      lastUnit = v <= 9 ? v : 0;
      unit = 1;
      seen = true;
    } else if (t in TEENS || t in TENS) {
      current += t in TEENS ? TEENS[t] : TENS[t];
      lastUnit = 0;
      unit = 1;
      seen = true;
    } else if (t in HUNDREDS) {
      current += HUNDREDS[t];
      lastUnit = 0;
      unit = 100;
      seen = true;
    } else if (HUNDRED_BASE.has(t)) {
      if (lastUnit >= 2) current += lastUnit * 99;
      else current += 100;
      lastUnit = 0;
      unit = 100;
      seen = true;
    } else if (t in THOUSAND_FIXED) {
      total += THOUSAND_FIXED[t];
      unit = t === 'الفين' ? 1000 : 1000000;
      lastUnit = 0;
      seen = true;
    } else if (t in SCALE_MULT) {
      total += (current || 1) * SCALE_MULT[t];
      current = 0;
      unit = SCALE_MULT[t];
      lastUnit = 0;
      seen = true;
    }
  }
  return seen ? round2(total + current) : undefined;
}

// ---------- text -> tokens ----------

const MONEY = set('جنيه جنيها جنيهات ج egp le');
const PCT_PHRASE_2 = set('الميه المايه المئه');
const PCT_PHRASE_1 = set('بالميه بالمايه بالمئه');

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function tokenize(text: string): Tok[] {
  let s = normalizeDigits(String(text ?? ''));
  s = s.replace(/[ً-ٰٟـ]/g, '');
  s = s.replace(/(\d)[,٬](?=\d{3}(?!\d))/g, '$1');
  s = s.replace(/[%٪]/g, ' % ');
  s = s.replace(/(\d)\.(?=\d)/g, '$1\u0001');
  s = s.replace(/([ء-ي])(?=\d)/g, '$1 ').replace(/(\d)(?=[ء-يa-zA-Z])/g, '$1 ');
  s = s.replace(/[^ء-يa-zA-Z0-9\u0001%\s]/g, ' ').replace(/\u0001/g, '.');
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((o) => ({ o, n: norm(o) }));
}

const wordLike = (n: string) => isKnownWord(n) || n in BARE;

function prepass(raw: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (MONEY.has(t.n)) continue;
    if (t.n === 'م' && raw[i - 1]?.n === 'ج') continue;
    if (PCT_PHRASE_1.has(t.n) || (t.n === 'في' && raw[i + 1] && PCT_PHRASE_2.has(raw[i + 1].n))) {
      if (t.n === 'في') i += 1;
      out.push({ o: '%', n: '%' });
      continue;
    }
    if (t.n.length > 1 && !isKnownWord(t.n) && !(t.n in BARE) && !(t.n in FRAC)) {
      const rest = t.n.slice(1);
      if (t.n[0] === 'و' && (wordLike(rest) || rest in FRAC)) {
        out.push({ o: 'و', n: 'و' }, { o: t.o.slice(1), n: rest });
        continue;
      }
      if (t.n[0] === 'ب' && wordLike(rest)) {
        out.push({ o: 'ب', n: 'ب' }, { o: t.o.slice(1), n: rest });
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

/** "ألفين وخمسمية" -> 2500. Digits are taken as they are. undefined when no number is found. */
export function parseAmount(words: string): number | undefined {
  const ns = prepass(tokenize(words)).map((t) => t.n);
  const r = findRun(ns);
  return r ? evalNumber(ns.slice(r.s, r.e)) : undefined;
}

// ---------- vocabulary ----------

const FILLER = set('بقولك قولي يا ممكن لو سمحت ياريت عايز عاوز عايزه عاوزه انا');
const STOP = set(
  'يا من ل لي لو سمحت ممكن عايز عاوز عايزه عاوزه ياريت اعمل اعملي ده دي دا كده بس النهارده انهارده امبارح دلوقتي كمان ب في كام ايه قول قولي انا بقولك تقريبا حوالي يعني طيب اللي ال الشهر شهر صفر',
);
const HONORIFIC = set(
  'الحاج حاج الحاجه حاجه استاذ الاستاذ استاذه الاستاذه معلم المعلم دكتور الدكتور دكتوره الدكتوره الست ست باشا بيه افندم',
);
const LAM_NAMES = set('ليلي لبني لطفي لمياء لميس لينا لؤي لقمان لبيب لطيفه ليث لوسي لانا لبنه ليلا');
const CONNECT = set('عبد ابو ام ابن بن بنت ابوال');
const PRODUCTS = set(
  'تلاجه ثلاجه غساله بوتاجاز بوتجاز تكييف تلفزيون شاشه موبايل تليفون لابتوب لاب مروحه سخان فريزر ديب مكنسه ميكروويف عربيه موتوسيكل توكتوك دراجه عجله سرير غرفه اوضه انتريه كنبه صالون دولاب مطبخ سجاده مرتبه مكتب كرسي ترابيزه تابلت ايفون ماكينه خلاط مكواه فرن طقم بوتجازه ديب فريزر',
);

const LATE = set('متاخر متاخرين المتاخرين متاخرات المتاخرات متاخره');
const LATE_PLURAL = set('متاخرين المتاخرين متاخرات المتاخرات');
const TOTALS_KW = set('حصلنا حصلت اتحصل تحصيل التحصيل تحصيلات اجمالي الاجمالي المحصل محصل حصل');
const TODAY = set('النهارده انهارده اليوم النهارضه');
const MONTH = set('الشهر شهر الشهري');
const OPEN_VERBS = set('افتح افتحلي افتحلنا افتحي روح وديني اعرض اعرضلي');
const OPEN_STOP = set('لي ملف صفحه صفحة حساب العميل عميل الخاص بتاع');
const CUSTOMERS_WORDS = set('العملاء عملاء');
const INVOICES_WORDS = set('الفواتير فواتير');
const HOME_WORDS = set('الرئيسيه رئيسيه البدايه الهوم home');
const INV_NOUN = set('فاتوره الفاتوره بيعه البيعه عقد العقد');
const NEW_WORD = set('جديده جديد');
const CREATE_VERBS = set('اعمل اعملي عمل انشئ سجل سجلي ضيف اضف عايز عاوز');
const PAY_VERBS = set('دفع دفعت دفعوا دفعو سدد سددت سددوا جاب جابت جابوا جابو جبت قبضت استلمت اخدت خدت حصلت حصل');
const REC = set('سجل سجلي ضيف اضف حط حطلي');
const PAY_NOUNS = set('دفعه دفعات قسط القسط مبلغ فلوس تحصيل');
const QUESTION = set('كام ايه مين ولا هل');
const BALANCE_KW = set('عليه عليها عليهم');
const BALANCE_NOUN = set('حساب رصيد مديونيه مديون الحساب');
const BALANCE_DROP = set('عليه عليها عليهم كام ايه باقي فاضل حساب رصيد مديونيه مديون بكام الحساب فيه فيها');
const AFTER_BALANCE_WORD = set('باقي فاضل كام حساب');
const BETAA = set('بتاع بتاعه بتاعت بتاعتي بتاعتنا');
const INVOICE_TAIL = set('فاضل باقي فيها فيه كام عليها عليه ايه بكام في تفاصيل');
const YEAR_WORDS = set('سنه سنين سنوات عام اعوام');
const MONTH_WORDS = set('شهر شهور اشهر');
const RATE_KW = set('فايده فوايد فائده ربح نسبه');
const DOWN_KW = set('مقدم المقدم مقدمه');
const PRICE_MARK = set('ب سعر سعرها بسعر ثمن ثمنها بمبلغ مبلغ بقيمه');
const SKIP_BEFORE_NUM = set('ب قدره قدرها هي بقيمه حوالي');
const SALE_INST = set('تقسيط بالتقسيط قسط بالقسط اقساط تقسيطي');
const SALE_CASH = set('كاش نقدي نقدا بالكاش نقداً');
const INV_DROP = set('فاتوره الفاتوره');
const PREP_BEFORE_METHOD = set('ب علي عن طريق');

const METHOD_MAP: Record<string, Method> = {
  كاش: 'cash', نقدي: 'cash', نقدا: 'cash',
  انستاباي: 'instapay', انستاپاي: 'instapay', انستا: 'instapay',
  فوري: 'fawry', فورى: 'fawry',
  محفظه: 'wallet', فودافون: 'wallet',
  فيزا: 'card', كارت: 'card', فيزه: 'card',
  تحويل: 'bank', بنك: 'bank', بنكي: 'bank', حواله: 'bank',
};

function methodOf(n: string): Method | undefined {
  for (const cand of [n, n.startsWith('بال') ? n.slice(3) : '', n.startsWith('ب') ? n.slice(1) : '', n.startsWith('ال') ? n.slice(2) : '']) {
    if (cand && cand in METHOD_MAP) return METHOD_MAP[cand];
  }
  return undefined;
}

const stripB = (n: string) => (n.startsWith('ب') ? n.slice(1) : n);

// ---------- token helpers ----------

const cut = (ts: Tok[], s: number, e: number): Tok[] => [...ts.slice(0, s), ...ts.slice(e)];
const ns = (ts: Tok[]) => ts.map((t) => t.n);
const joinO = (ts: Tok[]) => ts.map((t) => t.o).join(' ').trim();
const isProduct = (n: string) => PRODUCTS.has(n) || (n.startsWith('ال') && PRODUCTS.has(n.slice(2)));

function runValue(ts: Tok[], r: Run): number | undefined {
  return evalNumber(ns(ts).slice(r.s, r.e));
}

/** Pulls the payment method out (with a leading "ب" / "على" / "عن طريق"). */
function takeMethod(ts: Tok[]): { method?: Method; ts: Tok[] } {
  for (let i = 0; i < ts.length; i++) {
    let method: Method | undefined;
    let len = 1;
    const a = stripB(ts[i].n);
    const b = ts[i + 1]?.n;
    if ((a === 'فودافون' && b === 'كاش') || (a === 'انستا' && b === 'باي')) {
      method = a === 'فودافون' ? 'wallet' : 'instapay';
      len = 2;
    } else {
      method = methodOf(ts[i].n);
    }
    if (!method) continue;
    let s = i;
    while (s > 0 && PREP_BEFORE_METHOD.has(ts[s - 1].n)) s -= 1;
    return { method, ts: cut(ts, s, i + len) };
  }
  return { ts };
}

/** Honorifics, fillers and glue words never belong to a customer name. */
function nameTokens(ts: Tok[], extraDrop?: Set<string>): Tok[] {
  return ts.filter((t) => !STOP.has(t.n) && !HONORIFIC.has(t.n) && !(extraDrop && extraDrop.has(t.n)));
}

/** "لأحمد" after "سجل دفعة" / "فاتورة جديدة" is "ل" + "أحمد". */
function stripLam(ts: Tok[]): Tok[] {
  const f = ts[0];
  if (f && f.n.length >= 3 && f.n[0] === 'ل' && !LAM_NAMES.has(f.n)) {
    return [{ o: f.o.slice(1), n: f.n.slice(1) }, ...ts.slice(1)];
  }
  return ts;
}

function splitNameProduct(rest: Tok[], expectProduct: boolean): { name: Tok[]; product: Tok[] } {
  if (!rest.length) return { name: [], product: [] };
  for (let i = 1; i < rest.length; i++) {
    if (isProduct(rest[i].n)) return { name: rest.slice(0, i), product: rest.slice(i) };
  }
  if (!expectProduct) return { name: rest, product: [] };
  let end = 1;
  while (end < rest.length && CONNECT.has(rest[end - 1].n)) end += 1;
  return { name: rest.slice(0, end), product: rest.slice(end) };
}

type Raw = Record<string, unknown>;
const UNKNOWN: Raw = { type: 'unknown' };

/** "<kw> [ب] <number> [%]" (or "<number> <kw>" when allowed). Removes the matched tokens. */
function takeKeywordNumber(ts: Tok[], kw: Set<string>, allowBefore: boolean): { value?: number; ts: Tok[] } | null {
  const n = ns(ts);
  const i = n.findIndex((t) => kw.has(t) || kw.has(stripB(t)));
  if (i < 0) return null;
  let j = i + 1;
  while (j < n.length && SKIP_BEFORE_NUM.has(n[j]) && !numAt(n, j)) j += 1;
  const after = findRun(n, j);
  if (after && after.s === j) {
    let e = after.e;
    if (n[e] === '%') e += 1;
    return { value: runValue(ts, after), ts: cut(ts, i, e) };
  }
  if (allowBefore) {
    for (const r of allRuns(n)) {
      if (r.e === i) return { value: runValue(ts, r), ts: cut(ts, r.s, i + 1) };
    }
  }
  return { ts: cut(ts, i, i + 1) };
}

// ---------- intents ----------

function parseOpen(toks: Tok[]): Raw {
  const li = toks.findIndex((t) => !FILLER.has(t.n));
  const rest = toks.slice(li + 1).filter((t) => !OPEN_STOP.has(t.n) && !STOP.has(t.n));
  if (!rest.length) return UNKNOWN;
  const first = rest[0].n;
  if (rest.length === 1) {
    if (CUSTOMERS_WORDS.has(first)) return { type: 'open', target: 'customers' };
    if (INVOICES_WORDS.has(first) || INV_DROP.has(first)) return { type: 'open', target: 'invoices' };
    if (HOME_WORDS.has(first)) return { type: 'open', target: 'home' };
  }
  if (INV_DROP.has(first)) {
    const { name, product } = splitNameProduct(nameTokens(rest.slice(1)), false);
    if (!name.length) return { type: 'open', target: 'invoices' };
    return { type: 'open', target: 'invoice', customer: joinO(name), invoice_hint: product.length ? joinO(product) : undefined };
  }
  const name = nameTokens(rest);
  return name.length ? { type: 'open', target: 'customer', customer: joinO(name) } : UNKNOWN;
}

function parseCreate(toks: Tok[]): Raw {
  let ts = toks;
  const out: Raw = { type: 'create_invoice' };

  // interest rate: "فايدة 10 %" / "10 في الميه" / "5%"
  const rate = takeKeywordNumber(ts, RATE_KW, false);
  if (rate) {
    ts = rate.ts;
    if (rate.value !== undefined) out.rate_percent = rate.value;
  } else {
    const p = ns(ts).indexOf('%');
    if (p > 0) {
      const r = allRuns(ns(ts)).find((x) => x.e === p);
      if (r) {
        out.rate_percent = runValue(ts, r);
        ts = cut(ts, r.s, p + 1);
      }
    }
  }

  // years: "سنتين" / "3 سنين" / "سنة" / "24 شهر"
  {
    const n = ns(ts);
    const yi = n.findIndex((t) => t === 'سنتين' || YEAR_WORDS.has(t) || MONTH_WORDS.has(t));
    if (yi >= 0) {
      const w = n[yi];
      let s = yi;
      let years: number | undefined;
      const prevNum = yi > 0 && (isDigit(n[yi - 1]) || n[yi - 1] in UNITS || n[yi - 1] in BARE) ? wordValue(n, yi - 1) : undefined;
      if (prevNum !== undefined) s = yi - 1;
      if (w === 'سنتين') years = 2;
      else if (MONTH_WORDS.has(w)) years = prevNum !== undefined && prevNum % 12 === 0 ? prevNum / 12 : undefined;
      else years = prevNum !== undefined ? prevNum : w === 'سنه' || w === 'عام' ? 1 : undefined;
      if (years !== undefined || w !== 'شهر') {
        if (years !== undefined) out.years = years;
        ts = cut(ts, s, yi + 1);
      }
    }
  }

  // down payment
  const down = takeKeywordNumber(ts, DOWN_KW, true);
  if (down) {
    ts = down.ts;
    if (down.value !== undefined) out.down_payment = down.value;
  }

  // sale type
  {
    const n = ns(ts);
    const inst = n.some((t) => SALE_INST.has(t));
    const cash = n.some((t) => SALE_CASH.has(t));
    if (inst) out.sale_type = 'installment';
    else if (cash) out.sale_type = 'cash';
    ts = ts.filter((t) => !SALE_INST.has(t.n) && !SALE_CASH.has(t.n));
  }

  // price: "ب<number>" / "بسعر <number>" / else the first number left
  {
    const n = ns(ts);
    const runs = allRuns(n);
    const marked = runs.find((r) => r.s > 0 && PRICE_MARK.has(n[r.s - 1]));
    const pick = marked ?? runs[0];
    if (pick) {
      out.price = runValue(ts, pick);
      ts = cut(ts, marked ? pick.s - 1 : pick.s, pick.e);
    }
  }

  const rest = stripLam(
    nameTokens(ts, new Set([...INV_NOUN, ...NEW_WORD, ...CREATE_VERBS])),
  );
  const { name, product } = splitNameProduct(rest, true);
  if (!name.length) return UNKNOWN;
  out.customer = joinO(name);
  if (product.length) out.product = joinO(product);
  return out;
}

function parsePayment(toks: Tok[], recMode: boolean): Raw {
  let ts = toks;
  const out: Raw = { type: 'record_payment' };

  const r = findRun(ns(ts));
  if (r) {
    out.amount = runValue(ts, r);
    ts = cut(ts, r.s, r.e);
  }
  const m = takeMethod(ts);
  if (m.method) out.method = m.method;
  let pre = m.ts;
  if (!recMode) {
    // "<name> دفع 500 على [الفاتورة]": a dangling preposition after the verb is not part of the name.
    const vi = pre.map((t) => PAY_VERBS.has(t.n)).lastIndexOf(true);
    const hasName = vi > 0 && nameTokens(pre.slice(0, vi), new Set([...PAY_VERBS, ...REC, ...PAY_NOUNS])).length > 0;
    while (hasName && pre.length - 1 > vi && (pre[pre.length - 1].n === 'علي' || pre[pre.length - 1].n === 'عن' || INV_DROP.has(pre[pre.length - 1].n) || STOP.has(pre[pre.length - 1].n))) {
      pre = pre.slice(0, -1);
    }
  }
  ts = pre.filter((t) => !PAY_VERBS.has(t.n) && !REC.has(t.n) && !PAY_NOUNS.has(t.n) && !INV_DROP.has(t.n) && !STOP.has(t.n) && !HONORIFIC.has(t.n));

  const n = ns(ts);
  const mk = n.findIndex((t, i) => i >= 1 && i < n.length - 1 && (t === 'علي' || t === 'عن'));
  let nameT = ts;
  if (mk >= 0) {
    nameT = ts.slice(0, mk);
    const hint = ts.slice(mk + 1);
    if (hint.length) out.invoice_hint = joinO(hint);
  }
  if (recMode) nameT = stripLam(nameT);
  if (!nameT.length) return UNKNOWN;
  out.customer = joinO(nameT);
  return out;
}

function parseAskInvoice(toks: Tok[]): Raw {
  const n = ns(toks);
  const bi = n.findIndex((t) => BETAA.has(t));
  if (bi >= 0) {
    const before = toks.slice(0, bi).filter((t) => !INV_DROP.has(t.n) && !INVOICE_TAIL.has(t.n) && !STOP.has(t.n));
    const afterAll = toks.slice(bi + 1);
    const stopAt = afterAll.findIndex((t) => INVOICE_TAIL.has(t.n) && t.n !== 'في');
    const nameT = nameTokens(stopAt >= 0 ? afterAll.slice(0, stopAt) : afterAll);
    if (!nameT.length) return UNKNOWN;
    return { type: 'ask_invoice', customer: joinO(nameT), invoice_hint: before.length ? joinO(before) : undefined };
  }
  const rest = nameTokens(toks.filter((t) => !INV_DROP.has(t.n) && !INVOICE_TAIL.has(t.n)));
  const { name, product } = splitNameProduct(rest, false);
  if (!name.length) return UNKNOWN;
  return { type: 'ask_invoice', customer: joinO(name), invoice_hint: product.length ? joinO(product) : undefined };
}

function parseBalance(toks: Tok[]): Raw {
  const keep = toks.filter((t, i) => {
    if (BALANCE_DROP.has(t.n) || PAY_VERBS.has(t.n)) return false;
    if (t.n === 'علي' && i > 0 && AFTER_BALANCE_WORD.has(toks[i - 1].n)) return false;
    return true;
  });
  const name = nameTokens(keep);
  return name.length ? { type: 'ask_balance', customer: joinO(name) } : UNKNOWN;
}

function detect(toks: Tok[]): Raw {
  if (!toks.length) return UNKNOWN;
  const n = ns(toks);
  const has = (s: Set<string>) => n.some((t) => s.has(t));
  const lead = n.find((t) => !FILLER.has(t)) ?? '';

  if (OPEN_VERBS.has(lead)) return parseOpen(toks);

  const payVerb = has(PAY_VERBS);
  if (!payVerb && has(LATE) && (n.includes('مين') || has(LATE_PLURAL))) return { type: 'ask_late' };

  const run = findRun(n);
  if (!run && has(TOTALS_KW)) {
    if (has(TODAY)) return { type: 'ask_totals', period: 'today' };
    if (has(MONTH)) return { type: 'ask_totals', period: 'month' };
  }

  // A question about payments ("سيد دفع كام", "مين دفع", "هو سيد دفع ولا لأ") is never a payment to record.
  if (payVerb && !run && n.some((t) => QUESTION.has(t))) {
    return n.includes('كام') && !n.some((t) => t === 'مين' || t === 'ولا' || t === 'هل') ? parseBalance(toks) : UNKNOWN;
  }

  // "سجل دفعة ..." / "سجل قسط ..." (the noun must follow the verb directly)
  const recIdx = n.findIndex((t, i) => REC.has(t) && (PAY_NOUNS.has(n[i + 1]) || (n[i + 1] === 'ال' && PAY_NOUNS.has(n[i + 2]))));
  const payTrigger = payVerb || recIdx >= 0;

  // "فاتورة لمنى تلاجة" (the ل prefix) is a new invoice even without "جديدة"
  const lamForm = INV_NOUN.has(lead) && (n[n.indexOf(lead) + 1] === 'ل' || (n[n.indexOf(lead) + 1]?.length >= 3 && n[n.indexOf(lead) + 1][0] === 'ل' && !LAM_NAMES.has(n[n.indexOf(lead) + 1])));
  if (has(INV_NOUN) && !payVerb && (has(NEW_WORD) || lamForm || (!payTrigger && (has(CREATE_VERBS) || !!run)))) {
    return parseCreate(toks);
  }

  // "<amount> [method] من <name>"
  let implicit = false;
  if (run) {
    let k = run.e;
    while (k < n.length && methodOf(n[k]) !== undefined) k += 1;
    implicit = n[k] === 'من';
  }
  if (payTrigger || implicit) return parsePayment(toks, recIdx >= 0);

  if (has(BETAA) || INV_NOUN.has(lead)) return parseAskInvoice(toks);

  if (has(BALANCE_NOUN) || (has(BALANCE_KW) && (n.includes('كام') || n.includes('ايه')))) return parseBalance(toks);
  if ((n.includes('باقي') || n.includes('فاضل')) && n.includes('كام')) return parseBalance(toks);
  if (n.some((t, i) => t === 'كام' && n[i + 1] === 'علي')) return parseBalance(toks);

  return UNKNOWN;
}

// ---------- final whitelist (mirrors validateIntent) ----------

const METHODS: readonly string[] = ['cash', 'instapay', 'fawry', 'wallet', 'card', 'bank'];
const MAX_NUM = 10_000_000;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= 120 ? t : undefined;
}
function num(v: unknown, min: number, max: number, minExclusive = false): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (minExclusive ? v <= min : v < min) return undefined;
  return v > max ? undefined : v;
}
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

function finalize(r: Raw): Intent {
  const customer = str(r.customer);
  switch (r.type) {
    case 'record_payment':
      if (!customer) return { type: 'unknown' };
      return compact({
        type: 'record_payment',
        customer,
        amount: num(r.amount, 0, MAX_NUM, true),
        method: typeof r.method === 'string' && METHODS.includes(r.method) ? (r.method as Method) : undefined,
        invoice_hint: str(r.invoice_hint),
      }) as Intent;
    case 'create_invoice':
      if (!customer) return { type: 'unknown' };
      return compact({
        type: 'create_invoice',
        customer,
        product: str(r.product),
        price: num(r.price, 0, MAX_NUM, true),
        sale_type: r.sale_type === 'cash' || r.sale_type === 'installment' ? r.sale_type : undefined,
        down_payment: num(r.down_payment, 0, MAX_NUM),
        rate_percent: num(r.rate_percent, 0, 200),
        years: num(r.years, 1, 5),
      }) as Intent;
    case 'ask_balance':
      return customer ? { type: 'ask_balance', customer } : { type: 'unknown' };
    case 'ask_invoice':
      return customer ? (compact({ type: 'ask_invoice', customer, invoice_hint: str(r.invoice_hint) }) as Intent) : { type: 'unknown' };
    case 'ask_late':
      return { type: 'ask_late' };
    case 'ask_totals':
      return r.period === 'today' || r.period === 'month' ? { type: 'ask_totals', period: r.period } : { type: 'unknown' };
    case 'open': {
      const t = r.target;
      if (t === 'customers' || t === 'invoices' || t === 'home') return { type: 'open', target: t };
      if (t === 'customer' && customer) return { type: 'open', target: 'customer', customer };
      if (t === 'invoice' && customer) return compact({ type: 'open', target: 'invoice', customer, invoice_hint: str(r.invoice_hint) }) as Intent;
      return { type: 'unknown' };
    }
    default:
      return { type: 'unknown' };
  }
}

export function parseCommand(text: string): Intent {
  try {
    const raw = detect(prepass(tokenize(text)));
    // A minus sign on a number ("-500", "500-") means we cannot trust the amount: drop it.
    if (/(^|[^\d])-\s?\d|\d\s?-(?!\d)/.test(normalizeDigits(String(text ?? '')))) {
      for (const k of ['amount', 'price', 'down_payment', 'rate_percent']) delete raw[k];
    }
    return finalize(raw);
  } catch {
    return { type: 'unknown' };
  }
}
