import { sortWorklist, type WorklistRow } from '../dashboard';

const row = (o: Partial<WorklistRow>): WorklistRow => ({
  contract_id: 'c', customer_id: 'u', name: 'n', phone: '01012345678',
  installment_id: 'i', due_date: '2026-11-01', amount: 100, days_late: 0, status: 'pending', ...o,
});

describe('sortWorklist', () => {
  it('puts overdue first, largest days_late first, then due soonest', () => {
    const rows = [
      row({ installment_id: 'soon', due_date: '2026-11-02', days_late: -2 }),
      row({ installment_id: 'late5', due_date: '2026-10-26', days_late: 5 }),
      row({ installment_id: 'today', due_date: '2026-10-31', days_late: 0 }),
      row({ installment_id: 'late20', due_date: '2026-10-11', days_late: 20 }),
    ];
    expect(sortWorklist(rows).map((r) => r.installment_id)).toEqual(['late20', 'late5', 'today', 'soon']);
  });

  it('puts null due dates / days_late last and does not mutate input', () => {
    const rows = [
      row({ installment_id: 'nul', due_date: null, days_late: null }),
      row({ installment_id: 'a', due_date: '2026-11-03', days_late: -3 }),
      row({ installment_id: 'b', due_date: '2026-11-01', days_late: -1 }),
    ];
    const copy = [...rows];
    expect(sortWorklist(rows).map((r) => r.installment_id)).toEqual(['b', 'a', 'nul']);
    expect(rows).toEqual(copy);
  });
});
