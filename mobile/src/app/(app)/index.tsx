import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { useCollectionsKpi, useWorklist, type WorklistRow } from '../../api/dashboard';
import { useAuth } from '../../lib/auth';
import { formatDateAr } from '../../lib/date';
import { reminderMessage, whatsappLink } from '../../lib/whatsapp';
import { Button } from '../../ui/Button';
import { Money } from '../../ui/Money';
import { Screen } from '../../ui/Screen';
import { colors, font, radius, spacing } from '../../ui/theme';

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Money value={value} style={{ fontSize: font.heading, fontWeight: '700', color: tone === 'danger' ? colors.danger : colors.text }} />
    </View>
  );
}

function lateText(days: number | null, due: string | null): string {
  if (days !== null && days > 0) return `متأخر ${days} يوم (من ${formatDateAr(due ?? '')})`;
  if (days === 0) return 'مستحق النهارده';
  return due ? `يستحق ${formatDateAr(due)}` : '';
}

function WorkRow({ row, shopName }: { row: WorklistRow; shopName: string }) {
  const router = useRouter();
  const name = row.name ?? '';
  const link = row.phone
    ? whatsappLink(
        row.phone,
        reminderMessage({ customer: name, amount: row.amount ?? 0, dueDate: formatDateAr(row.due_date ?? ''), merchant: shopName }),
      )
    : null;
  const overdue = (row.days_late ?? 0) > 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.name}>{name}</Text>
        <Money value={row.amount ?? 0} style={{ fontWeight: '700' }} />
      </View>
      <Text style={[styles.sub, overdue && { color: colors.danger }]}>
        {lateText(row.days_late, row.due_date)}
      </Text>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            title="واتساب"
            variant="secondary"
            disabled={link === null}
            onPress={() => {
              if (link) void Linking.openURL(link);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="تسجيل دفعة"
            onPress={() =>
              router.push(`/payment/new?customerId=${row.customer_id}&contractId=${row.contract_id}`)
            }
          />
        </View>
      </View>
    </View>
  );
}

export default function Home() {
  const { shopName } = useAuth();
  const kpi = useCollectionsKpi();
  const work = useWorklist();

  return (
    <Screen title={shopName ?? 'الرئيسية'}>
      <View style={styles.tiles}>
        <Tile label="مستحق الأسبوع ده" value={kpi.data?.expected_this_week ?? 0} />
        <Tile label="المحصّل الشهر ده" value={kpi.data?.collected_this_month ?? 0} />
        <Tile label="إجمالي المتأخرات" value={kpi.data?.overdue_total ?? 0} tone="danger" />
      </View>
      {kpi.isError ? <Text style={styles.error}>تعذّر تحميل الأرقام</Text> : null}

      <Text style={styles.heading}>مين لازم أكلمه النهارده</Text>
      {work.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : work.isError ? (
        <Text style={styles.error}>تعذّر تحميل القائمة</Text>
      ) : work.data.length === 0 ? (
        <Text style={styles.empty}>مفيش أقساط مستحقة دلوقتي</Text>
      ) : (
        work.data.map((r) => <WorkRow key={r.installment_id} row={r} shopName={shopName ?? ''} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { gap: spacing.sm },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tileLabel: { fontSize: font.small, color: colors.muted, textAlign: 'right' },
  heading: { fontSize: font.heading, fontWeight: '700', color: colors.text, textAlign: 'right' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: font.body, fontWeight: '600', color: colors.text },
  sub: { fontSize: font.small, color: colors.muted, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  error: { color: colors.danger, textAlign: 'right' },
});
