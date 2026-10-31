import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../lib/auth';
import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type Customer = Tables<'customer'>;
export type CustomerRow = Pick<Customer, 'id' | 'name' | 'phone'>;

const LIST_LIMIT = 50;

/**
 * Neutralise a search term for use as an ilike pattern. `%` and `_` are LIKE
 * wildcards; `\` is the LIKE escape; `,` `(` `)` are PostgREST filter syntax.
 * Backslash-escaping is harmless for the latter (LIKE treats `\x` as a literal x).
 * The term is only ever passed to typed .ilike() calls, never to .or().
 */
export function escapeSearch(term: string): string {
  // `*` is PostgREST's alias for `%` in like/ilike values. It is stripped, not escaped:
  // an escaped `\*` would still be rewritten to `\%`.
  return term.replace(/\*/g, '').replace(/[\\%_,()]/g, (ch) => `\\${ch}`);
}

export function useCustomers(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ['customers', term],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CustomerRow[]> => {
      if (!term) {
        const { data, error } = await supabase
          .from('customer')
          .select('id, name, phone')
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT);
        if (error) throw error;
        return data;
      }
      // Name contains term; phone starts with term. Two typed calls merged
      // client-side (see escapeSearch) instead of a single .or() string.
      const safe = escapeSearch(term);
      const [byName, byPhone] = await Promise.all([
        supabase
          .from('customer')
          .select('id, name, phone')
          .ilike('name', `%${safe}%`)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT),
        supabase
          .from('customer')
          .select('id, name, phone')
          .ilike('phone', `${safe}%`)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT),
      ]);
      if (byName.error) throw byName.error;
      if (byPhone.error) throw byPhone.error;
      const merged = new Map<string, CustomerRow>();
      for (const c of [...byName.data, ...byPhone.data]) merged.set(c.id, c);
      return Array.from(merged.values()).slice(0, LIST_LIMIT);
    },
  });
}

export interface NewCustomer {
  id: string;
  name: string;
  phone: string;
  nationalId?: string;
  address?: string;
}

/** Idempotent on `id`: retrying the same submission never creates a second row. */
export function useCreateCustomer() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: NewCustomer): Promise<string> => {
      if (!profile) throw new Error('not signed in');
      const { error } = await supabase.from('customer').upsert(
        {
          id: c.id,
          tenant_id: profile.tenant_id,
          name: c.name.trim(),
          phone: c.phone.trim(),
          national_id: c.nationalId?.trim() || null,
          address: c.address?.trim() || null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) throw error;
      return c.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

/** For the duplicate-phone warning; null when no customer in the shop has this phone. */
export async function findCustomerByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('customer')
    .select('id, name')
    .eq('phone', phone.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: async (): Promise<Customer | null> => {
      const { data, error } = await supabase.from('customer').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
