export interface SplitLine {
  contractId: string;
  amount: number;
  remaining: number;
}

const cents = (n: number) => Math.round(n * 100);

/** Arabic error, or null when the split can be sent. Zero lines are ignored (unfilled rows). */
export function validateSplit(total: number, lines: SplitLine[]): string | null {
  if (!Number.isFinite(total) || total <= 0) return 'اكتب المبلغ الكلي';
  if (lines.some((l) => Number.isNaN(l.amount) || l.amount < 0)) return 'مبلغ غير صحيح';
  const used = lines.filter((l) => l.amount > 0);
  if (used.length === 0) return 'وزّع المبلغ على فاتورة واحدة على الأقل';
  if (used.some((l) => cents(l.amount) > cents(l.remaining))) return 'المبلغ أكبر من الباقي على الفاتورة';
  const sum = used.reduce((s, l) => s + cents(l.amount), 0);
  if (sum !== cents(total)) return 'مجموع التوزيع لازم يساوي المبلغ الكلي';
  return null;
}

/**
 * Suggested split: fills the contracts in the order given (the caller puts the oldest first),
 * each up to its remaining. The merchant can still change it ("وزّع بنفسي"); anything above
 * the customer's total remaining is left unallocated so validateSplit rejects it.
 */
export function autoSplit(total: number, contracts: { contractId: string; remaining: number }[]) {
  let left = Number.isFinite(total) && total > 0 ? cents(total) : 0;
  return contracts.map((c) => {
    const take = Math.min(left, Math.max(0, cents(c.remaining)));
    left -= take;
    return { contractId: c.contractId, amount: take / 100 };
  });
}

/** Sum of what the customer still owes on the given contracts. */
export function totalRemaining(contracts: { remaining: number }[]): number {
  return contracts.reduce((s, c) => s + cents(c.remaining), 0) / 100;
}
