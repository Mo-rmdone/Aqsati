import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../lib/auth';
import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type FollowupRow = Tables<'v_followup'>;
export type ContactLog = Tables<'contact_log'>;
export type ContactKind = 'call' | 'whatsapp' | 'note';

export function useFollowup() {
  return useQuery({
    queryKey: ['dashboard', 'followup'],
    queryFn: async (): Promise<FollowupRow[]> => {
      const { data, error } = await supabase
        .from('v_followup')
        .select('*')
        .order('bucket')
        .order('days_late', { ascending: false })
        .order('next_due_date')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface LogContactInput {
  id: string;
  customerId: string;
  kind: ContactKind;
  note?: string;
  promiseDate?: string;
}

/** Idempotent on `id`. Never sends created_by / created_at: the DB sets and the policy pins them. */
export function useLogContact() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: LogContactInput): Promise<void> => {
      if (!profile) throw new Error('not signed in');
      const { error } = await supabase.from('contact_log').upsert(
        {
          id: c.id,
          tenant_id: profile.tenant_id,
          customer_id: c.customerId,
          kind: c.kind,
          note: c.note?.trim() || null,
          promise_date: c.promiseDate || null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: (_r, c) => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['contacts', c.customerId] });
    },
  });
}

export function useCustomerContacts(customerId: string) {
  return useQuery({
    queryKey: ['contacts', customerId],
    queryFn: async (): Promise<ContactLog[]> => {
      const { data, error } = await supabase
        .from('contact_log')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}
