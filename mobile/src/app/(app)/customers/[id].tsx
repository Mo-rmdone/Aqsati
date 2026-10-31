import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useCustomerContracts } from '../../../api/contracts';
import { useCustomer } from '../../../api/customers';
import { Button } from '../../../ui/Button';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { StatusChip } from '../../../ui/StatusChip';
import { colors, font, radius, spacing } from '../../../ui/theme';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {typeof children === 'string' ? <Text style={styles.value}>{children}</Text> : children}
    </View>
  );
}

export default function CustomerFile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const customer = useCustomer(id);
  const contracts = useCustomerContracts(id);

  if (customer.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (customer.error || !customer.data) {
    return (
      <Screen title="ملف العميل">
        <Text style={styles.error}>{customer.error ? 'تعذر تحميل العميل' : 'العميل غير موجود'}</Text>
      </Screen>
    );
  }
  const c = customer.data;
  const hasRemaining = (contracts.data ?? []).some((k) => Number(k.remaining) > 0);

  return (
    <Screen title={c.name}>
      <View style={styles.card}>
        <Row label="الموبايل">{c.phone}</Row>
        {c.national_id ? <Row label="الرقم القومي">{c.national_id}</Row> : null}
        {c.address ? <Row label="العنوان">{c.address}</Row> : null}
        {c.blacklist_flag ? <StatusChip label="قائمة سوداء" tone="danger" /> : null}
      </View>

      <Button title="فاتورة جديدة" onPress={() => router.push(`/sale/new?customerId=${id}`)} />
      {hasRemaining ? (
        <Button
          title="تسجيل دفعة"
          variant="secondary"
          onPress={() => router.push(`/payment/new?customerId=${id}` as never)}
        />
      ) : null}

      <Text style={styles.heading}>العقود</Text>
      {contracts.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {contracts.error ? <Text style={styles.error}>تعذر تحميل العقود</Text> : null}
      {contracts.data && contracts.data.length === 0 ? <Text style={styles.empty}>مفيش عقود لسه</Text> : null}
      {contracts.data?.map((k) => {
        const settled = Number(k.remaining) === 0;
        return (
          <View key={k.contract_id} style={styles.card}>
            <Row label="رقم العقد">{String(k.contract_no)}</Row>
            <Row label="السلعة">{k.product_desc}</Row>
            <Row label="النوع">{k.sale_type === 'cash' ? 'كاش' : 'قسط'}</Row>
            <Row label="المدفوع">
              <Money value={Number(k.paid)} />
            </Row>
            <Row label="الباقي">
              <Money value={Number(k.remaining)} />
            </Row>
            <StatusChip label={settled ? 'مدفوع بالكامل' : 'جاري'} tone={settled ? 'success' : 'warning'} />
          </View>
        );
      })}
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
});
