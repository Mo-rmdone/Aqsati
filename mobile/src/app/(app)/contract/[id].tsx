import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { contractStatus } from '../../../api/contracts';
import { useContract } from '../../../api/payments';
import { PAYMENT_METHODS } from '../../../api/sales';
import { Button } from '../../../ui/Button';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { StatusChip, type Tone } from '../../../ui/StatusChip';
import { colors, font, radius, spacing } from '../../../ui/theme';

const INSTALLMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'مدفوع', tone: 'success' },
  partial: { label: 'جزئي', tone: 'warning' },
  overdue: { label: 'متأخر', tone: 'danger' },
  pending: { label: 'لسه', tone: 'neutral' },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {typeof children === 'string' ? <Text style={styles.value}>{children}</Text> : children}
    </View>
  );
}

export default function ContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useContract(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  if (q.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen title="العقد" onBack={goBack}>
        <Text style={styles.error}>{q.error ? 'تعذر تحميل العقد' : 'العقد غير موجود'}</Text>
      </Screen>
    );
  }
  const { contract, balance, installments, payments } = q.data;
  const remaining = balance?.remaining ?? null;
  const status = contractStatus(remaining);
  const canPay = contract.sale_type === 'installment' && status !== 'settled';

  return (
    <Screen title={`عقد رقم ${contract.contract_no}`} onBack={goBack}>
      <View style={styles.card}>
        <Row label="رقم العقد">{String(contract.contract_no)}</Row>
        <Row label="السلعة">{contract.product_desc ?? ''}</Row>
        {contract.external_invoice_no ? <Row label="رقم الفاتورة الخارجي">{contract.external_invoice_no}</Row> : null}
        <Row label="الإجمالي">
          <Money value={Number(balance?.total_payable ?? contract.total_price)} />
        </Row>
        <Row label="المدفوع">
          <Money value={Number(balance?.paid ?? 0)} />
        </Row>
        <Row label="الباقي">
          {remaining === null ? <Text style={styles.value}>غير معروف</Text> : <Money value={remaining} />}
        </Row>
        <StatusChip
          label={status === 'settled' ? 'مدفوع بالكامل' : status === 'open' ? 'جاري' : 'غير معروف'}
          tone={status === 'settled' ? 'success' : status === 'open' ? 'warning' : 'neutral'}
        />
      </View>

      {canPay ? (
        <Button
          title="تسجيل دفعة"
          onPress={() => router.push(`/payment/new?customerId=${contract.customer_id}&contractId=${contract.id}`)}
        />
      ) : null}

      {installments.length > 0 ? (
        <>
          <Text style={styles.heading}>الأقساط</Text>
          <View style={styles.card}>
            <View style={styles.tr}>
              {['رقم', 'الميعاد', 'المستحق', 'المدفوع', 'الحالة'].map((h) => (
                <Text key={h} style={[styles.th, styles.cell]}>
                  {h}
                </Text>
              ))}
            </View>
            {installments.map((i) => {
              const s = INSTALLMENT_STATUS[i.status] ?? { label: i.status, tone: 'neutral' as Tone };
              return (
                <View key={i.id} style={styles.tr}>
                  <Text style={styles.cell}>{i.seq_no}</Text>
                  <Text style={[styles.cell, styles.ltr]}>{i.due_date}</Text>
                  <View style={styles.cell}>
                    <Money value={Number(i.amount_due)} style={styles.small} />
                  </View>
                  <View style={styles.cell}>
                    <Money value={Number(i.amount_paid)} style={styles.small} />
                  </View>
                  <View style={styles.cell}>
                    <StatusChip label={s.label} tone={s.tone} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.heading}>الدفعات</Text>
      {payments.length === 0 ? <Text style={styles.empty}>مفيش دفعات لسه</Text> : null}
      {payments.map((p) => (
        <View key={p.id} style={styles.card}>
          <Row label="إيصال رقم">{String(p.receipt_no ?? '')}</Row>
          <Row label="المبلغ">
            <Money value={p.line_amount} />
          </Row>
          <Row label="الطريقة">{PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}</Row>
          <Row label="التاريخ">{p.received_at.slice(0, 10)}</Row>
          {p.edited_at ? <StatusChip label="اتعدّلت" tone="warning" /> : null}
          {p.editable ? (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/payment/${p.id}/edit`)}>
              <Text style={styles.link}>تعديل</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  label: { fontSize: font.small, color: colors.muted },
  value: { fontSize: font.body, color: colors.text, flexShrink: 1, textAlign: 'right' },
  heading: { fontSize: font.heading, fontWeight: '700', color: colors.text, textAlign: 'right' },
  empty: { color: colors.muted, textAlign: 'center', fontSize: font.body },
  error: { color: colors.danger, textAlign: 'center', fontSize: font.body },
  link: { color: colors.primary, fontSize: font.body, fontWeight: '600', textAlign: 'right' },
  tr: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  cell: { flex: 1, fontSize: font.small, color: colors.text, textAlign: 'center' },
  th: { color: colors.muted, fontWeight: '600' },
  ltr: { writingDirection: 'ltr' },
  small: { fontSize: font.small },
});
