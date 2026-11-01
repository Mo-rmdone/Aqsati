import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { Tables } from '../lib/database.types';
import { formatEGP } from '../lib/money';
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

export interface EditableContract {
  contractId: string;
  title: string;
  remaining: number;
}

const contractTitle = (c: ContractBalance) => `${c.product_desc ?? ''} (عقد ${c.contract_no})`;

/**
 * Contracts an edited payment can be spread over: its own contracts (even if now settled; remaining =
 * current remaining + its own line) followed by the customer's other open installment contracts.
 * Throws when one of the payment's contracts is missing from the balances.
 */
export function editableContracts(
  paymentLines: { contract_id: string; amount: number }[],
  balances: ContractBalance[],
): EditableContract[] {
  const own = new Map<string, number>();
  for (const l of paymentLines) own.set(l.contract_id, (own.get(l.contract_id) ?? 0) + Number(l.amount));
  const result: EditableContract[] = [];
  for (const [id, line] of own) {
    const row = balances.find((b) => b.contract_id === id);
    if (!row) throw new Error(`contract ${id} missing from balances`);
    result.push({ contractId: id, title: contractTitle(row), remaining: (row.remaining ?? 0) + line });
  }
  for (const row of openInstallmentContracts(balances)) {
    const id = row.contract_id as string;
    if (!own.has(id)) result.push({ contractId: id, title: contractTitle(row), remaining: Number(row.remaining) });
  }
  return result;
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

/** Imported "already paid" installments: opening payment whose lines are installments (the down payment keeps its own label). */
export function isOpeningBalance(isOpening: boolean, lines: { kind: string }[]): boolean {
  return isOpening && isPaymentEditable(lines);
}

function invalidateAfterPayment(qc: QueryClient, customerId: string, contractIds: string[], paymentId?: string) {
  qc.invalidateQueries({ queryKey: ['contracts', customerId] });
  for (const c of contractIds) qc.invalidateQueries({ queryKey: ['contract', c] });
  qc.invalidateQueries({ queryKey: ['customer', customerId] });
  qc.invalidateQueries({ queryKey: ['customer-payments', customerId] });
  qc.invalidateQueries({ queryKey: ['customers'] });
  qc.invalidateQueries({ queryKey: ['invoices'] });
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
  /** imported "رصيد افتتاحي" payment */
  opening: boolean;
}

type WindowInstallment = { seq_no: number; amount_due: number; amount_paid: number };

/**
 * The slice of installments to show by default: starts one before the first not-fully-paid
 * installment (so the reader sees the last paid one for context), `size` rows when possible.
 */
export function installmentWindow<T extends WindowInstallment>(
  installments: T[],
  _today: string,
  size = 4,
): { rows: T[]; hiddenCount: number } {
  const firstOpen = installments.findIndex((i) => Number(i.amount_paid) < Number(i.amount_due));
  const raw = (firstOpen === -1 ? installments.length : firstOpen) - 1;
  const start = Math.max(0, Math.min(raw, installments.length - size));
  const rows = installments.slice(start, start + size);
  return { rows, hiddenCount: installments.length - rows.length };
}

type DueInstallment = { due_date: string; amount_due: number; amount_paid: number };

/** Sum still owed on installments whose due date has passed. */
export function overdueAmount(installments: DueInstallment[], today: string): number {
  return installments
    .filter((i) => i.due_date < today && Number(i.amount_paid) < Number(i.amount_due))
    .reduce((s, i) => s + (Number(i.amount_due) - Number(i.amount_paid)), 0);
}

/** Invoice status for invoiceStatusChip: unknown remaining, settled, late (any installment past due) or open. */
export function deriveInvoiceStatus(remaining: number | null, installments: DueInstallment[], today: string) {
  if (remaining === null) return 'unknown';
  if (remaining === 0) return 'settled';
  return overdueAmount(installments, today) > 0 ? 'late' : 'open';
}

/** "15% سنوي · 2 سنين"; "—" for imported or zero-interest contracts. */
export function interestText(rate: number, numInstallments: number, method: string): string {
  if (method === 'imported' || !(Number(rate) > 0)) return '—';
  const pct = Number((Number(rate) * 100).toFixed(2));
  const years = Number((numInstallments / 12).toFixed(2));
  return `${pct}% سنوي · ${years === 1 ? 'سنة' : `${years} سنين`}`;
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
            .select('id, receipt_no, amount, method, received_at, edited_at, customer_id, is_opening')
            .in('id', ids)
            .order('received_at', { ascending: false }),
          supabase.from('payment_line').select('payment_id, contract_id, amount, kind').in('payment_id', ids),
        ]);
        if (pays.error) throw pays.error;
        if (allLines.error) throw allLines.error;
        payments = pays.data.map((p) => {
          const lines = allLines.data.filter((l) => l.payment_id === p.id);
          const mine = lines.filter((l) => l.contract_id === id).reduce((s, l) => s + Number(l.amount), 0);
          return { ...p, line_amount: mine, editable: isPaymentEditable(lines), opening: isOpeningBalance(p.is_opening, lines) };
        });
      }
      return { contract: contract.data, balance: balance.data, installments: installments.data, payments };
    },
  });
}

export interface CustomerPayment {
  id: string;
  receipt_no: number | null;
  received_at: string;
  amount: number;
  method: string;
  is_opening: boolean;
  lines: { contract_id: string; contract_no: number | null; amount: number; kind: string }[];
}

const plainAmount = (n: number) => formatEGP(n).replace(/\s*ج\.م$/, '');

/** "#41: 1,000.00 · #33: 1,000.00", or just "#41" when the payment has a single line. */
export function paymentSpreadText(lines: { contract_no: number | null; amount: number }[]): string {
  if (lines.length === 1) return `#${lines[0].contract_no ?? '—'}`;
  return lines.map((l) => `#${l.contract_no ?? '—'}: ${plainAmount(Number(l.amount))}`).join(' · ');
}

/** All of a customer's payments, newest first, each with its per-invoice lines. */
export function useCustomerPayments(customerId: string) {
  return useQuery({
    queryKey: ['customer-payments', customerId],
    queryFn: async (): Promise<CustomerPayment[]> => {
      const { data, error } = await supabase
        .from('payment')
        .select('id, receipt_no, received_at, amount, method, is_opening, payment_line(contract_id, amount, kind, contract(contract_no))')
        .eq('customer_id', customerId)
        .order('received_at', { ascending: false });
      if (error) throw error;
      type Raw = {
        id: string;
        receipt_no: number | null;
        received_at: string;
        amount: number;
        method: string;
        is_opening: boolean;
        payment_line: {
          contract_id: string;
          amount: number;
          kind: string;
          contract: { contract_no: number } | { contract_no: number }[] | null;
        }[];
      };
      return (data as unknown as Raw[]).map((p) => ({
        id: p.id,
        receipt_no: p.receipt_no,
        received_at: p.received_at,
        amount: Number(p.amount),
        method: p.method,
        is_opening: p.is_opening,
        lines: (p.payment_line ?? [])
          .map((l) => {
            const c = Array.isArray(l.contract) ? l.contract[0] : l.contract;
            return { contract_id: l.contract_id, contract_no: c?.contract_no ?? null, amount: Number(l.amount), kind: l.kind };
          })
          .sort((a, b) => (b.contract_no ?? 0) - (a.contract_no ?? 0)),
      }));
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
