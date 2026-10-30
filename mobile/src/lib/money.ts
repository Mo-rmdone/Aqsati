// Mirrors supabase/migrations/0012 build_schedule exactly. All arithmetic is in
// integer piasters so results agree with Postgres numeric to the piaster.

/** round-half-away-from-zero of num/den for integers (den > 0), like Postgres round(numeric). */
function divRound(num: number, den: number): number {
  const sign = num < 0 ? -1 : 1;
  const a = Math.abs(num);
  return sign * Math.floor((2 * a + den) / (2 * den));
}

// toFixed(6) strips float drift (1.005 * 100 = 100.49999999999999) before rounding.
const toPiasters = (egp: number) => Math.round(Number((egp * 100).toFixed(6)));
const fromPiasters = (p: number) => p / 100;

function splitPiasters(totalP: number, n: number): number[] {
  const base = divRound(totalP, n);
  const out = Array<number>(n).fill(base);
  out[n - 1] = totalP - base * (n - 1);
  return out;
}

/** n amounts of round(total/n, 2); the last absorbs the residual. */
export function splitTotal(total: number, n: number): number[] {
  return splitPiasters(toPiasters(total), n).map(fromPiasters);
}

const pad = (x: number, w = 2) => String(x).padStart(w, '0');

/** start + months, clamping to month end (Postgres date + interval 'N months'). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${pad(ny, 4)}-${pad(nm)}-${pad(Math.min(d, dim))}`;
}

export type InstallmentPreview = {
  financed: number;
  total: number;
  monthly: number;
  last: number;
  count: number;
  firstDue: string;
  schedule: { seq: number; dueDate: string; amount: number }[];
};

export function previewInstallments(input: {
  price: number;
  down: number;
  ratePercent: number;
  years: number;
  saleDate: string;
}): InstallmentPreview {
  const financedP = toPiasters(input.price) - toPiasters(input.down);
  const rateHundredths = Math.round(input.ratePercent * 100); // percent * 100
  const interestP = divRound(financedP * rateHundredths, 10000);
  const totalP = financedP + interestP;
  const count = Math.round(input.years * 12);
  const amounts = splitPiasters(totalP, count);
  const schedule = amounts.map((p, i) => ({
    seq: i + 1,
    dueDate: addMonths(input.saleDate, i + 1),
    amount: fromPiasters(p),
  }));
  return {
    financed: fromPiasters(financedP),
    total: fromPiasters(totalP),
    monthly: schedule[0].amount,
    last: schedule[count - 1].amount,
    count,
    firstDue: schedule[0].dueDate,
    schedule,
  };
}

/** "812.50 ج.م" — Latin digits, 2 decimals, thousands separator. */
export function formatEGP(n: number): string {
  const p = toPiasters(n);
  const abs = Math.abs(p);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${p < 0 ? '-' : ''}${whole}.${pad(abs % 100)} ج.م`;
}
