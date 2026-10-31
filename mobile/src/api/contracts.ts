import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type ContractBalance = Tables<'v_contract_balance'>;

export type ContractStatus = 'settled' | 'open' | 'unknown';

/** A null remaining is unknown, never "settled". */
export function contractStatus(remaining: number | null): ContractStatus {
  if (remaining === null) return 'unknown';
  return remaining === 0 ? 'settled' : 'open';
}

/** Show "record payment" unless every contract is known to be fully paid. */
export function hasOpenBalance(rows: { remaining: number | null }[]): boolean {
  return rows.some((r) => contractStatus(r.remaining) !== 'settled');
}

/** The view has no created_at; contract numbers are sequential, so newest first = contract_no desc. */
export function useCustomerContracts(customerId: string) {
  return useQuery({
    queryKey: ['contracts', customerId],
    queryFn: async (): Promise<ContractBalance[]> => {
      const { data, error } = await supabase
        .from('v_contract_balance')
        .select('*')
        .eq('customer_id', customerId)
        .order('contract_no', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
