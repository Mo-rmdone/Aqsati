import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../lib/auth';
import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { normalizeDigits } from './sales';

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

/**
 * The customers screen lists only customers who have at least one invoice
 * (customers are created inside the new-invoice flow). The invoice form's picker
 * searches everyone, so an earlier customer is never duplicated.
 */
export function customerSelect(withInvoices: boolean): string {
  return withInvoices ? 'id, name, phone, contract!inner(id)' : 'id, name, phone';
}

const toRow = (c: { id: string; name: string; phone: string }): CustomerRow => ({ id: c.id, name: c.name, phone: c.phone });

export function useCustomers(search: string, { withInvoices = false }: { withInvoices?: boolean } = {}) {
  const term = search.trim();
  const select = customerSelect(withInvoices);
  return useQuery({
    queryKey: ['customers', term, withInvoices],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CustomerRow[]> => {
      if (!term) {
        const { data, error } = await supabase
          .from('customer')
          .select(select)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT);
        if (error) throw error;
        return (data as unknown as CustomerRow[]).map(toRow);
      }
      // Name contains term; phone starts with term. Two typed calls merged
      // client-side (see escapeSearch) instead of a single .or() string.
      const safe = escapeSearch(term);
      const [byName, byPhone] = await Promise.all([
        supabase
          .from('customer')
          .select(select)
          .ilike('name', `%${safe}%`)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT),
        supabase
          .from('customer')
          .select(select)
          .ilike('phone', `${safe}%`)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT),
      ]);
      if (byName.error) throw byName.error;
      if (byPhone.error) throw byPhone.error;
      const merged = new Map<string, CustomerRow>();
      for (const c of [...(byName.data as unknown as CustomerRow[]), ...(byPhone.data as unknown as CustomerRow[])]) {
        merged.set(c.id, toRow(c));
      }
      return Array.from(merged.values()).slice(0, LIST_LIMIT);
    },
  });
}

export type CustomerFilter = 'all' | 'paid_month' | 'late_month' | 'late_many' | 'owes';
export type CustomerSummary = Tables<'v_customer_summary'>;

interface FilterableQuery {
  eq(column: string, value: unknown): this;
  gt(column: string, value: number): this;
}

export function applyCustomerFilter<Q extends FilterableQuery>(query: Q, filter: CustomerFilter): Q {
  switch (filter) {
    case 'paid_month':
      return query.eq('paid_this_month', true);
    case 'late_month':
      return query.eq('late_this_month', true);
    case 'late_many':
      return query.eq('status', 'late_many');
    case 'owes':
      return query.gt('remaining_total', 0);
    default:
      return query;
  }
}

const SEVERITY = ['late_many', 'late', 'unknown', 'regular', 'done'];
const rank = (status: string | null) => {
  const i = SEVERITY.indexOf(status ?? 'unknown');
  return i === -1 ? SEVERITY.indexOf('unknown') : i;
};

/** PostgREST can't order by a custom rank, so severity is applied after the fetch. */
export function sortBySeverity(rows: CustomerSummary[]): CustomerSummary[] {
  return [...rows].sort(
    (a, b) => rank(a.status) - rank(b.status) || (a.name ?? '').localeCompare(b.name ?? '', 'ar'),
  );
}

export function useCustomerSummaries(search: string, filter: CustomerFilter) {
  const term = normalizeDigits(search.trim());
  return useQuery({
    queryKey: ['customers', 'summary', term, filter],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CustomerSummary[]> => {
      const base = () => applyCustomerFilter(supabase.from('v_customer_summary').select('*'), filter);
      if (!term) {
        const { data, error } = await base().order('name').limit(LIST_LIMIT);
        if (error) throw error;
        return sortBySeverity(data ?? []);
      }
      const safe = escapeSearch(term);
      const [byName, byPhone] = await Promise.all([
        base().ilike('name', `%${safe}%`).order('name').limit(LIST_LIMIT),
        base().ilike('phone', `${safe}%`).order('name').limit(LIST_LIMIT),
      ]);
      if (byName.error) throw byName.error;
      if (byPhone.error) throw byPhone.error;
      const merged = new Map<string, CustomerSummary>();
      for (const c of [...(byName.data ?? []), ...(byPhone.data ?? [])]) merged.set(c.customer_id ?? '', c);
      return sortBySeverity(Array.from(merged.values())).slice(0, LIST_LIMIT);
    },
  });
}

/** Real total for the header (ignores the search term; the list itself is capped at 50). */
export function useCustomerCount(filter: CustomerFilter) {
  return useQuery({
    queryKey: ['customers', 'count', filter],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<number> => {
      const { count, error } = await applyCustomerFilter(
        supabase.from('v_customer_summary').select('customer_id', { count: 'exact', head: true }),
        filter,
      );
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export type NewCustomerForm = { name: string; phone: string; nationalId: string; address: string };
export const EMPTY_CUSTOMER: NewCustomerForm = { name: '', phone: '', nationalId: '', address: '' };

/** "عميل جديد" from the invoice search: digits prefill the phone, anything else the name. */
export function prefillFromSearch(search: string): NewCustomerForm {
  const s = normalizeDigits(search.trim());
  return /^[0-9+ ]+$/.test(s) && s !== ''
    ? { ...EMPTY_CUSTOMER, phone: s.replace(/\s/g, '') }
    : { ...EMPTY_CUSTOMER, name: s };
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
export async function findCustomerByPhone(
  phone: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  let q = supabase.from('customer').select('id, name').eq('phone', phone.trim());
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export interface CustomerUpdate {
  id: string;
  name: string;
  phone: string;
  nationalId: string;
  address: string;
  notes: string;
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CustomerUpdate): Promise<void> => {
      const { error } = await supabase
        .from('customer')
        .update({
          name: c.name.trim(),
          phone: c.phone.trim(),
          national_id: c.nationalId.trim() || null,
          address: c.address.trim() || null,
          notes: c.notes.trim() || null,
        })
        .eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: (_r, c) => {
      qc.invalidateQueries({ queryKey: ['customer', c.id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** One customer's row from v_customer_summary, or null. Key lives under ['customers'] so every edit/payment refreshes it. */
export function useCustomerSummary(id: string) {
  return useQuery({
    queryKey: ['customers', 'summary-one', id],
    queryFn: async (): Promise<CustomerSummary | null> => {
      const { data, error } = await supabase.from('v_customer_summary').select('*').eq('customer_id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
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
