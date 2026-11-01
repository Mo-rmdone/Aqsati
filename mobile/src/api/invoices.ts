import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { escapeSearch } from './customers';
import { normalizeDigits } from './sales';

export type InvoiceRow = Tables<'v_invoice_list'>;

export type InvoiceQuery = {
  search: string;
  date: 'today' | 'month' | 'all' | { from: string; to: string };
  type: 'all' | 'cash' | 'installment';
  status: 'all' | 'open' | 'late' | 'settled';
};

export const INVOICE_LIMIT = 100;

/** ISO dates for the period; `month` is the first..last day of `today`'s month. */
export function dateRange(date: InvoiceQuery['date'], today: string): { from?: string; to?: string } {
  if (date === 'all') return {};
  if (date === 'today') return { from: today, to: today };
  if (date === 'month') {
    const [y, m] = today.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, '0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
  }
  return { from: date.from, to: date.to };
}

interface Filterable {
  eq(column: string, value: unknown): this;
  gte(column: string, value: string): this;
  lte(column: string, value: string): this;
}

function applyFilters<Q extends Filterable>(query: Q, q: InvoiceQuery, range: { from?: string; to?: string }): Q {
  let r = query;
  if (range.from) r = r.gte('sale_date', range.from);
  if (range.to) r = r.lte('sale_date', range.to);
  if (q.type !== 'all') r = r.eq('sale_type', q.type);
  if (q.status !== 'all') r = r.eq('status', q.status);
  return r;
}

export type InvoiceList = {
  rows: InvoiceRow[];
  count: number;
  /** Sum of total_payable over the loaded rows only. */
  total: number;
  /** True when the 100-row limit was reached, so count/total are not full-period figures. */
  capped: boolean;
};

export function useInvoices(q: InvoiceQuery, today: string) {
  const term = normalizeDigits(q.search.trim());
  return useQuery({
    queryKey: ['invoices', term, q.date, q.type, q.status, today],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<InvoiceList> => {
      const range = dateRange(q.date, today);
      const base = () => applyFilters(supabase.from('v_invoice_list').select('*'), q, range);
      const ordered = <T extends { order(c: string, o: { ascending: boolean }): T; limit(n: number): PromiseLike<unknown> }>(
        b: T,
      ) => b.order('contract_no', { ascending: false }).limit(INVOICE_LIMIT) as unknown as PromiseLike<{
        data: InvoiceRow[] | null;
        error: Error | null;
      }>;

      const calls: PromiseLike<{ data: InvoiceRow[] | null; error: Error | null }>[] = [];
      if (!term) {
        calls.push(ordered(base()));
      } else {
        // Separate typed calls merged client-side (see escapeSearch), never an .or() string.
        if (/^\d+$/.test(term)) {
          // A huge term would overflow the bigint column and reject the whole batch.
          const no = Number(term);
          if (Number.isSafeInteger(no) && no > 0) calls.push(ordered(base().eq('contract_no', no)));
          calls.push(ordered(base().ilike('external_invoice_no', `${escapeSearch(term)}%`)));
        }
        const safe = escapeSearch(term);
        calls.push(ordered(base().ilike('product_desc', `%${safe}%`)));
        calls.push(ordered(base().ilike('customer_name', `%${safe}%`)));
      }
      const results = await Promise.all(calls);
      const merged = new Map<string, InvoiceRow>();
      let capped = false;
      for (const res of results) {
        if (res.error) throw res.error;
        const data = res.data ?? [];
        if (data.length >= INVOICE_LIMIT) capped = true;
        for (const row of data) merged.set(row.contract_id ?? '', row);
      }
      const all = Array.from(merged.values()).sort((a, b) => (b.contract_no ?? 0) - (a.contract_no ?? 0));
      if (all.length > INVOICE_LIMIT) capped = true;
      const rows = all.slice(0, INVOICE_LIMIT);
      return {
        rows,
        count: rows.length,
        total: rows.reduce((s, r) => s + (r.total_payable ?? 0), 0),
        capped,
      };
    },
  });
}
