import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { contractStatus, hasOpenBalance, useCustomerContracts } from '../../../../api/contracts';
import { useCustomer } from '../../../../api/customers';
import { Button } from '../../../../ui/Button';
import { Money } from '../../../../ui/Money';
import { Screen } from '../../../../ui/Screen';
import { StatusChip } from '../../../../ui/StatusChip';
import { colors, radius, shadow, space, type } from '../../../../ui/theme';

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
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  if (customer.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (customer.error || !customer.data) {
    return (
      <Screen title="ملف العميل" onBack={goBack}>
        <Text style={styles.error}>{customer.error ? 'تعذر تحميل العميل' : 'العميل غير موجود'}</Text>
      </Screen>
    );
  }
  const c = customer.data;
  const hasRemaining = hasOpenBalance(contracts.data ?? []);

  return (
    <Screen title={c.name} onBack={goBack}>
      <View style={styles.card}>
        <Row label="الموبايل">{c.phone}</Row>
        {c.national_id ? <Row label="الرقم القومي">{c.national_id}</Row> : null}
        {c.address ? <Row label="العنوان">{c.address}</Row> : null}
        {c.blacklist_flag ? <StatusChip label="قائمة سوداء" tone="error" /> : null}
      </View>

      <Button title="فاتورة جديدة" onPress={() => router.push(`/sale/new?customerId=${id}`)} />
      {hasRemaining ? (
        <Button
          title="تسجيل دفعة"
          variant="secondary"
          onPress={() => router.push(`/payment/new?customerId=${id}`)}
        />
      ) : null}

      <Text style={styles.heading}>العقود</Text>
      {contracts.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {contracts.error ? <Text style={styles.error}>تعذر تحميل العقود</Text> : null}
      {contracts.data && contracts.data.length === 0 ? <Text style={styles.empty}>مفيش عقود لسه</Text> : null}
      {contracts.data?.map((k) => {
        const status = contractStatus(k.remaining);
        return (
          <View key={k.contract_id} style={styles.card}>
            <Row label="رقم العقد">{String(k.contract_no)}</Row>
            <Row label="السلعة">{k.product_desc}</Row>
            <Row label="النوع">{k.sale_type === 'cash' ? 'كاش' : 'قسط'}</Row>
            <Row label="المدفوع">
              <Money value={Number(k.paid)} />
            </Row>
            <Row label="الباقي">
              {k.remaining === null ? <Text style={styles.value}>غير معروف</Text> : <Money value={k.remaining} />}
            </Row>
            <StatusChip
              label={status === 'settled' ? 'مدفوع بالكامل' : status === 'open' ? 'جاري' : 'غير معروف'}
              tone={status === 'settled' ? 'paid' : status === 'open' ? 'due' : 'unknown'}
            />
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
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  // 'row' follows the writing direction (RTL on web via dir="rtl", on native via forceRTL).
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[4] },
  label: { ...type.helper, color: colors.inkMuted },
  value: { ...type.bodyStrong, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  heading: { ...type.title3, color: colors.ink, textAlign: 'right' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
});
