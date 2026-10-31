import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import type { ContractBalance } from './contracts';
import type { PaymentMethod } from './sales';

export interface PaymentLineInput {
  contractId: string;
  amount: number;
}

/** Customer's contracts that can take a payment: installment, known remaining > 0. `preferId` goes first. */
export function openInstallmentContracts(rows: ContractBalance[], preferId?: string): ContractBalance[] {
  const open = rows.filter((r) => r.sale_type === 'installment' && r.remaining !== null && r.remaining > 0);
  const first = preferId ? open.filter((r) => r.contract_id === preferId) : [];
  return [...first, ...open.filter((r) => r.contract_id !== preferId)];
}

export function toPaymentLines(lines: PaymentLineInput[]) {
  return lines
    .filter((l) => Number.isFinite(l.amount) && l.amount > 0)
    .map((l) => ({ contract_id: l.contractId, amount: l.amount }));
}

/** Down-payment / cash lines belong to the invoice and are not editable here. */
export function isPaymentEditable(lines: { kind: string }[]): boolean {
  return lines.length > 0 && lines.every((l) => l.kind === 'installment');
}

function invalidateAfterPayment(qc: QueryClient, customerId: string, contractIds: string[], paymentId?: string) {
  qc.invalidateQueries({ queryKey: ['contracts', customerId] });
  for (const c of contractIds) qc.invalidateQueries({ queryKey: ['contract', c] });
  qc.invalidateQueries({ queryKey: ['customer', customerId] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  if (paymentId) qc.invalidateQueries({ queryKey: ['payment', paymentId] });
}

/** Idempotent on `id`: the caller keeps one id per form attempt (see idForAttempt). */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      customerId: string;
      method: PaymentMethod;
      lines: PaymentLineInput[];
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('record_payment', {
        p_id: v.id,
        p_customer: v.customerId,
        p_method: v.method,
        p_lines: toPaymentLines(v.lines),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_r, v) =>
      invalidateAfterPayment(qc, v.customerId, toPaymentLines(v.lines).map((l) => l.contract_id)),
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      customerId: string;
      method: PaymentMethod;
      lines: PaymentLineInput[];
      /** contracts the payment touched before the edit, so their caches refresh too */
      previousContractIds?: string[];
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('update_payment', {
        p_id: v.id,
        p_method: v.method,
        p_lines: toPaymentLines(v.lines),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_r, v) =>
      invalidateAfterPayment(
        qc,
        v.customerId,
        [...toPaymentLines(v.lines).map((l) => l.contract_id), ...(v.previousContractIds ?? [])],
        v.id,
      ),
  });
}

export type PaymentRow = Pick<Tables<'payment'>, 'id' | 'receipt_no' | 'amount' | 'method' | 'received_at' | 'edited_at' | 'customer_id'>;
export type PaymentLineRow = Pick<Tables<'payment_line'>, 'payment_id' | 'contract_id' | 'amount' | 'kind'>;

export interface ContractPayment extends PaymentRow {
  /** this payment's amount on the contract being viewed */
  line_amount: number;
  editable: boolean;
}

export function useContract(id: string) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      const [contract, balance, installments, myLines] = await Promise.all([
        supabase.from('contract').select('*').eq('id', id).maybeSingle(),
        supabase.from('v_contract_balance').select('*').eq('contract_id', id).maybeSingle(),
        supabase.from('installment').select('*').eq('contract_id', id).order('seq_no', { ascending: true }),
        supabase.from('payment_line').select('payment_id, contract_id, amount, kind').eq('contract_id', id),
      ]);
      if (contract.error) throw contract.error;
      if (balance.error) throw balance.error;
      if (installments.error) throw installments.error;
      if (myLines.error) throw myLines.error;
      if (!contract.data) return null;

      const ids = Array.from(new Set(myLines.data.map((l) => l.payment_id)));
      let payments: ContractPayment[] = [];
      if (ids.length > 0) {
        const [pays, allLines] = await Promise.all([
          supabase
            .from('payment')
            .select('id, receipt_no, amount, method, received_at, edited_at, customer_id')
            .in('id', ids)
            .order('received_at', { ascending: false }),
          supabase.from('payment_line').select('payment_id, contract_id, amount, kind').in('payment_id', ids),
        ]);
        if (pays.error) throw pays.error;
        if (allLines.error) throw allLines.error;
        payments = pays.data.map((p) => {
          const lines = allLines.data.filter((l) => l.payment_id === p.id);
          const mine = lines.filter((l) => l.contract_id === id).reduce((s, l) => s + Number(l.amount), 0);
          return { ...p, line_amount: mine, editable: isPaymentEditable(lines) };
        });
      }
      return { contract: contract.data, balance: balance.data, installments: installments.data, payments };
    },
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: ['payment', id],
    queryFn: async () => {
      const [pay, lines] = await Promise.all([
        supabase
          .from('payment')
          .select('id, receipt_no, amount, method, received_at, edited_at, customer_id')
          .eq('id', id)
          .maybeSingle(),
        supabase.from('payment_line').select('payment_id, contract_id, amount, kind').eq('payment_id', id),
      ]);
      if (pay.error) throw pay.error;
      if (lines.error) throw lines.error;
      if (!pay.data) return null;
      return { payment: pay.data as PaymentRow, lines: lines.data as PaymentLineRow[] };
    },
  });
}
