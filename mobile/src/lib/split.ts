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
  if (used.length === 0) return 'وزّع المبلغ على عقد واحد على الأقل';
  if (used.some((l) => cents(l.amount) > cents(l.remaining))) return 'المبلغ أكبر من المتبقي على العقد';
  const sum = used.reduce((s, l) => s + cents(l.amount), 0);
  if (sum !== cents(total)) return 'مجموع التوزيع لازم يساوي المبلغ الكلي';
  return null;
}

/** One open contract takes the whole total; otherwise the merchant fills the rows. */
export function autoSplit(total: number, contracts: { contractId: string; remaining: number }[]) {
  const single = contracts.length === 1;
  return contracts.map((c) => ({ contractId: c.contractId, amount: single && Number.isFinite(total) ? total : 0 }));
}
