import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCustomer } from '../../../api/customers';
import {
  deriveInvoiceStatus,
  installmentWindow,
  interestText,
  overdueAmount,
  useContract,
  type ContractPayment,
} from '../../../api/payments';
import { PAYMENT_METHODS } from '../../../api/sales';
import { formatDateAr, localDateISO, todayISO } from '../../../lib/date';
import { invoiceStatusChip } from '../../../lib/status';
import { Button } from '../../../ui/Button';
import { DataTable, type Column } from '../../../ui/DataTable';
import { useIsDesktop } from '../../../ui/layout';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { StatusChip, type Tone } from '../../../ui/StatusChip';
import { Tile } from '../../../ui/Tile';
import { border, colors, radius, shadow, size, space, type } from '../../../ui/theme';

const INSTALLMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'مدفوع', tone: 'paid' },
  partial: { label: 'جزئي', tone: 'partial' },
  overdue: { label: 'متأخر', tone: 'overdue' },
  pending: { label: 'مستحق', tone: 'due' },
};

function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.label}>{label}</Text>
      {typeof children === 'string' ? <Text style={styles.value}>{children}</Text> : children}
    </View>
  );
}

function CustomerLink({ customerId }: { customerId: string }) {
  const router = useRouter();
  const q = useCustomer(customerId);
  if (!q.data) return null;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/customers/${customerId}`)} hitSlop={8}>
      <Text style={styles.link}>{q.data.name}</Text>
    </Pressable>
  );
}

export default function ContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const desktop = useIsDesktop();
  const q = useContract(id);
  const [showAll, setShowAll] = useState(false);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/invoices'));

  if (q.isLoading) {
    return (
      <Screen title="الفاتورة" onBack={goBack}>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen title="الفاتورة" onBack={goBack}>
        <Text style={styles.error}>{q.error ? 'تعذر تحميل الفاتورة' : 'الفاتورة غير موجودة'}</Text>
      </Screen>
    );
  }
  const { contract, balance, installments, payments } = q.data;
  const today = todayISO();
  const remaining = balance?.remaining ?? null;
  const total = Number(balance?.total_payable ?? contract.total_price);
  const paid = Number(balance?.paid ?? 0);
  const late = overdueAmount(installments, today);
  const status = deriveInvoiceStatus(remaining, installments, today);
  const chip = invoiceStatusChip(status);
  const canPay = contract.sale_type === 'installment' && status !== 'settled' && remaining !== null && remaining > 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;

  const win = installmentWindow(installments, today);
  const shownInstallments = showAll ? installments : win.rows;
  const payButton = canPay ? (
    <Button
      title="تسجيل دفعة"
      onPress={() => router.push(`/payment/new?customerId=${contract.customer_id}&contractId=${contract.id}`)}
    />
  ) : null;

  const installmentCols: Column<(typeof installments)[number]>[] = [
    { key: 'no', title: 'رقم', width: 80, render: (i) => <Text style={styles.cell}>{i.seq_no}</Text> },
    { key: 'due', title: 'الميعاد', render: (i) => <Text style={styles.cell}>{formatDateAr(i.due_date)}</Text> },
    { key: 'amt', title: 'المستحق', render: (i) => <Money value={Number(i.amount_due)} style={styles.small} /> },
    { key: 'paid', title: 'المدفوع', render: (i) => <Money value={Number(i.amount_paid)} style={styles.small} /> },
    {
      key: 'st',
      title: 'الحالة',
      render: (i) => {
        const s = INSTALLMENT_STATUS[i.status] ?? { label: 'غير معروف', tone: 'unknown' as Tone };
        return <StatusChip label={s.label} tone={s.tone} />;
      },
    },
  ];

  const paymentCols: Column<ContractPayment>[] = [
    { key: 'rc', title: 'إيصال', width: 100, render: (p) => <Text style={styles.cell}>{String(p.receipt_no ?? '')}</Text> },
    { key: 'dt', title: 'التاريخ', render: (p) => <Text style={styles.cell}>{formatDateAr(localDateISO(p.received_at))}</Text> },
    { key: 'am', title: 'المبلغ', render: (p) => <Money value={p.line_amount} style={styles.small} /> },
    {
      key: 'me',
      title: 'الطريقة',
      render: (p) => <Text style={styles.cell}>{PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}</Text>,
    },
    {
      key: 'ed',
      title: 'تعديل',
      render: (p) => (
        <View style={styles.chips}>
          {p.opening ? <StatusChip label="رصيد افتتاحي" tone="unknown" /> : null}
          {p.edited_at ? <StatusChip label="اتعدّلت" tone="edited" /> : null}
          {p.editable ? (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/payment/${p.id}/edit`)}>
              <Text style={styles.link}>تعديل</Text>
            </Pressable>
          ) : null}
        </View>
      ),
    },
  ];

  const main = (
    <View style={styles.col}>
      {installments.length > 0 ? (
        <>
          <Text style={styles.heading}>الأقساط</Text>
          <DataTable
            columns={installmentCols}
            rows={shownInstallments}
            keyOf={(i) => i.id}
            empty={<Text style={styles.empty}>مفيش أقساط</Text>}
          />
          {win.hiddenCount > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.toggle}>
              <Text style={styles.link}>{showAll ? 'عرض أقل' : `عرض كل الأقساط (${installments.length})`}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      <Text style={styles.heading}>الدفعات</Text>
      <DataTable
        columns={paymentCols}
        rows={payments}
        keyOf={(p) => p.id}
        empty={<Text style={styles.empty}>مفيش دفعات لسه</Text>}
      />
    </View>
  );

  const side = (
    <View style={[styles.card, desktop && styles.side]}>
      <Text style={styles.heading}>بيانات الفاتورة</Text>
      {contract.external_invoice_no ? <KeyValue label="رقم الفاتورة الخارجي">{contract.external_invoice_no}</KeyValue> : null}
      <KeyValue label="السعر">
        <Money value={Number(contract.total_price)} style={styles.small} />
      </KeyValue>
      {contract.sale_type === 'cash' ? (
        <KeyValue label="نوع البيع">كاش</KeyValue>
      ) : (
        <>
          <KeyValue label="المقدم">
            <Money value={Number(contract.down_payment)} style={styles.small} />
          </KeyValue>
          <KeyValue label="الفايدة">
            {interestText(Number(contract.interest_rate), contract.num_installments, contract.interest_method)}
          </KeyValue>
          <KeyValue label="أول قسط">{installments[0] ? formatDateAr(installments[0].due_date) : '—'}</KeyValue>
          <KeyValue label="الإجمالي بالفايدة">
            <Money value={total} style={styles.small} />
          </KeyValue>
        </>
      )}
    </View>
  );

  return (
    <Screen title={contract.product_desc ?? `فاتورة #${contract.contract_no}`} onBack={goBack} actions={payButton}>
      <View style={styles.meta}>
        <StatusChip label={chip.label} tone={chip.tone} />
        {contract.interest_method === 'imported' ? <StatusChip label="مستورد" tone="unknown" /> : null}
      </View>
      <View style={styles.meta}>
        <Text style={styles.sub}>عقد #{contract.contract_no} ·</Text>
        <CustomerLink customerId={contract.customer_id} />
        <Text style={styles.sub}>· {formatDateAr(contract.start_date ?? localDateISO(contract.created_at))}</Text>
      </View>

      {desktop ? null : payButton}

      <View style={desktop ? styles.tilesRow : styles.tilesCol}>
        <View style={styles.tileWrap}>
          <Tile label="الإجمالي" value={total} />
        </View>
        <View style={styles.tileWrap}>
          <Tile label="المدفوع" value={paid} tone="paid" />
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        </View>
        <View style={styles.tileWrap}>
          {remaining === null ? <Tile label="الباقي" value="غير معروف" /> : <Tile label="الباقي" value={remaining} tone="due" />}
        </View>
        <View style={styles.tileWrap}>
          <Tile label="متأخر" value={late} tone="overdue" />
        </View>
      </View>

      {desktop ? (
        <View style={styles.cols}>
          {main}
          {side}
        </View>
      ) : (
        <>
          {main}
          {side}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.hairline,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  sub: { ...type.body, color: colors.inkMuted },
  tilesRow: { flexDirection: 'row', gap: space[4] },
  tilesCol: { gap: space[3] },
  tileWrap: { flex: 1, gap: space[2] },
  track: { height: space[2], borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brand },
  cols: { flexDirection: 'row', gap: space[6], alignItems: 'flex-start' },
  col: { flex: 1, gap: space[4] },
  side: { width: size.sideColumn },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[4] },
  label: { ...type.body, color: colors.inkMuted },
  value: { ...type.bodyStrong, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  heading: { ...type.title3, color: colors.ink, textAlign: 'right' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
  link: { ...type.label, color: colors.brand, textAlign: 'right' },
  toggle: { minHeight: size.tapMin, justifyContent: 'center' },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  cell: { ...type.body, color: colors.ink, textAlign: 'right' },
  small: { ...type.body },
});
