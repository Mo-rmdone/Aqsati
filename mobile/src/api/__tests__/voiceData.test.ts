const mockRows: Record<string, any[]> = {};
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        order: () => Promise.resolve({ data: mockRows[table] ?? [], error: null }),
      };
      return q;
    },
  },
}));

import { useVoiceData } from '../voice';

beforeEach(() => {
  for (const k of Object.keys(mockRows)) delete mockRows[k];
});

test('lateSummary lists the top 5', async () => {
  mockRows.v_followup = Array.from({ length: 7 }, (_, i) => ({ name: `ع${i}`, days_late: 30 - i, overdue_amount: 100 }));
  const l = await useVoiceData().lateSummary();
  expect(l.count).toBe(7);
  expect(l.top).toHaveLength(5);
});

test('openInvoices payable keeps installment with remaining > 0; all keeps every non-settled row', async () => {
  const row = (id: string, sale_type: string, remaining: number | null) => ({
    contract_id: id, contract_no: 1, product_desc: id, external_invoice_no: null, remaining, status: 'due', sale_type,
  });
  mockRows.v_invoice_list = [row('a', 'installment', 50), row('b', 'cash', 20), row('c', 'installment', 0), row('d', 'installment', null)];
  const d = useVoiceData();
  expect((await d.openInvoices('c1', 'payable')).map((i) => i.id)).toEqual(['a']);
  expect((await d.openInvoices('c1')).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
});
