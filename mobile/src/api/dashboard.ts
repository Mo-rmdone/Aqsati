import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type WorklistRow = Omit<Tables<'v_worklist'>, 'tenant_id'>;

export interface Kpi {
  expected_this_week: number;
  collected_this_month: number;
  overdue_total: number;
}

const ZERO_KPI: Kpi = { expected_this_week: 0, collected_this_month: 0, overdue_total: 0 };

/** Overdue first (largest days_late), then due soonest; rows with unknown dates last. */
export function sortWorklist<T extends Pick<WorklistRow, 'days_late' | 'due_date'>>(rows: T[]): T[] {
  const late = (r: T) => (r.days_late !== null && r.days_late > 0 ? r.days_late : 0);
  return [...rows].sort((a, b) => {
    if (a.due_date === null || b.due_date === null) {
      if (a.due_date === b.due_date) return 0;
      return a.due_date === null ? 1 : -1;
    }
    const byLate = late(b) - late(a);
    if (byLate !== 0) return byLate;
    return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
  });
}

/** A new shop has no installments, so the view returns no row: show zeros. */
export function useCollectionsKpi() {
  return useQuery({
    queryKey: ['dashboard', 'kpi'],
    queryFn: async (): Promise<Kpi> => {
      const { data, error } = await supabase.from('v_collections_kpi').select('*').maybeSingle();
      if (error) throw error;
      if (!data) return ZERO_KPI;
      return {
        expected_this_week: Number(data.expected_this_week ?? 0),
        collected_this_month: Number(data.collected_this_month ?? 0),
        overdue_total: Number(data.overdue_total ?? 0),
      };
    },
  });
}

export function useWorklist() {
  return useQuery({
    queryKey: ['dashboard', 'worklist'],
    queryFn: async (): Promise<WorklistRow[]> => {
      const { data, error } = await supabase
        .from('v_worklist')
        .select('contract_id, customer_id, name, phone, installment_id, due_date, amount, days_late, status');
      if (error) throw error;
      return sortWorklist(data.map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) })));
    },
  });
}
