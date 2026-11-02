import { useMutation } from '@tanstack/react-query';

import type { Intent } from '../../../supabase/functions/voice-intent/logic';
import { cairoDayStart } from '../lib/date';
import { supabase } from '../lib/supabase';
import { filterNameRows, namePattern } from '../lib/voice/normalize';
import type { CustomerOption, VoiceData } from '../lib/voice/resolve';
import { escapeSearch } from './customers';
import { normalizeDigits } from './sales';

export type { Intent };

export type VoiceErrorCode = 'budget_exceeded' | 'not_configured' | 'too_long' | 'unavailable' | 'unauthorized';

export class VoiceError extends Error {
  code: VoiceErrorCode;
  constructor(code: VoiceErrorCode) {
    super(code);
    this.name = 'VoiceError';
    this.code = code;
  }
}

const TEXT: Record<VoiceErrorCode, string> = {
  budget_exceeded: 'خلّصت حصة الشهر للمساعد الصوتي',
  not_configured: 'المساعد الصوتي لسه مش متفعّل',
  too_long: 'الكلام طويل، قولها أقصر',
  unavailable: 'المساعد مش متاح دلوقتي، جرّب كمان شوية',
  unauthorized: 'سجّل دخول تاني وجرّب',
};

export function voiceErrorText(code: VoiceErrorCode): string {
  return TEXT[code];
}

async function mapError(error: any): Promise<VoiceError> {
  const res = error?.context;
  if (res && typeof res.status === 'number') {
    if (res.status === 401) return new VoiceError('unauthorized');
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body */
    }
    const code = body && typeof body === 'object' ? body.error : undefined;
    if (code === 'budget_exceeded' || code === 'not_configured' || code === 'too_long') return new VoiceError(code);
  }
  return new VoiceError('unavailable');
}

export function useVoiceIntent() {
  return useMutation({
    mutationFn: async (text: string): Promise<Intent> => {
      const { data, error } = await supabase.functions.invoke('voice-intent', { body: { text } });
      if (error) throw await mapError(error);
      const intent = (data as { intent?: Intent } | null)?.intent;
      if (!intent || typeof intent !== 'object') throw new VoiceError('unavailable');
      return intent;
    },
  });
}

// ---- data access for the resolver ----

const num = (v: number | null | undefined): number => v ?? 0;

async function findCustomers(q: string): Promise<CustomerOption[]> {
  const term = normalizeDigits(q).trim();
  if (!term) return [];
  const safe = escapeSearch(term);
  const [byName, byPhone] = await Promise.all([
    supabase.from('customer').select('id, name, phone').ilike('name', namePattern(term, safe)).order('created_at', { ascending: false }).limit(40),
    supabase.from('customer').select('id, name, phone').ilike('phone', `${safe}%`).order('created_at', { ascending: false }).limit(6),
  ]);
  if (byName.error) throw byName.error;
  if (byPhone.error) throw byPhone.error;
  const merged = new Map<string, { id: string; name: string; phone: string }>();
  for (const c of [...filterNameRows(byName.data ?? [], term, 6), ...(byPhone.data ?? [])]) merged.set(c.id, c);
  const rows = Array.from(merged.values()).slice(0, 6);
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('v_customer_summary')
    .select('customer_id, remaining_total')
    .in('customer_id', rows.map((r) => r.id));
  if (error) throw error;
  const rem = new Map((data ?? []).map((r) => [r.customer_id, num(r.remaining_total)]));
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, remaining: rem.get(r.id) ?? 0 }));
}

const voiceData: VoiceData = {
  findCustomers,
  async customerSummary(id) {
    const { data, error } = await supabase.from('v_customer_summary').select('*').eq('customer_id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      name: data.name ?? '',
      paid_total: num(data?.paid_total),
      remaining_total: num(data?.remaining_total),
      overdue_amount: num(data?.overdue_amount),
      next_due_date: data?.next_due_date ?? null,
      next_due_amount: data?.next_due_amount ?? null,
    };
  },
  async lastPayment(id) {
    const { data, error } = await supabase
      .from('payment')
      .select('amount, received_at')
      .eq('customer_id', id)
      .eq('is_opening', false)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? { amount: data.amount, received_at: data.received_at } : null;
  },
  // scope 'payable' (payment intents) = installment contracts with remaining > 0, as the payment form shows.
  // scope 'all' (ask_invoice / open) = every non-settled invoice.
  async openInvoices(customerId, scope = 'all') {
    const { data, error } = await supabase
      .from('v_invoice_list')
      .select('contract_id, contract_no, product_desc, external_invoice_no, remaining, status, sale_type')
      .eq('customer_id', customerId)
      .neq('status', 'settled')
      .order('sale_date', { ascending: false });
    if (error) throw error;
    return (data ?? [])
      .filter((r) => r.contract_id)
      .filter((r) => scope === 'all' || (r.sale_type === 'installment' && num(r.remaining) > 0))
      .map((r) => ({
        id: r.contract_id as string,
        contract_no: r.contract_no,
        product_desc: r.product_desc,
        external_invoice_no: r.external_invoice_no,
        remaining: num(r.remaining),
      }));
  },
  async lateSummary() {
    const { data, error } = await supabase
      .from('v_followup')
      .select('name, days_late, overdue_amount')
      .eq('status', 'late')
      .order('days_late', { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    return {
      count: rows.length,
      total: rows.reduce((s, r) => s + num(r.overdue_amount), 0),
      top: rows.slice(0, 5).map((r) => ({ name: r.name ?? '', days_late: num(r.days_late) })),
    };
  },
  async totals() {
    const [pay, kpi] = await Promise.all([
      supabase.from('payment').select('amount').eq('is_opening', false).gte('received_at', cairoDayStart()),
      supabase.from('v_collections_kpi').select('collected_this_month').maybeSingle(),
    ]);
    if (pay.error) throw pay.error;
    if (kpi.error) throw kpi.error;
    const today = Math.round((pay.data ?? []).reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return { today, month: num(kpi.data?.collected_this_month) };
  },
};

export function useVoiceData(): VoiceData {
  return voiceData;
}
