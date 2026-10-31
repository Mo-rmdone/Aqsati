import { useQuery } from '@tanstack/react-query';

import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type ContractBalance = Tables<'v_contract_balance'>;

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
