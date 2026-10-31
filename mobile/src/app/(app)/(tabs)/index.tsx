import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { useCollectionsKpi, useWorklist, type WorklistRow } from '../../../api/dashboard';
import { useAuth } from '../../../lib/auth';
import { formatDateAr } from '../../../lib/date';
import { reminderMessage, whatsappLink } from '../../../lib/whatsapp';
import { Button } from '../../../ui/Button';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { StatusChip } from '../../../ui/StatusChip';
import { colors, radius, shadow, space, type } from '../../../ui/theme';

type TileTone = 'due' | 'paid' | 'overdue';
const tileColor: Record<TileTone, string> = { due: colors.due, paid: colors.paid, overdue: colors.overdue };

function Tile({ label, value, tone }: { label: string; value: number; tone: TileTone }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHead}>
        <View style={[styles.dot, { backgroundColor: tileColor[tone] }]} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Money value={value} style={{ ...type.moneyLg, color: tone === 'overdue' ? colors.overdue : colors.ink }} />
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
    <View style={[styles.row, overdue && styles.rowLate]}>
      <View style={styles.rowTop}>
        <Text style={styles.name}>{name}</Text>
        <Money value={row.amount ?? 0} />
      </View>
      <StatusChip label={lateText(row.days_late, row.due_date)} tone={overdue ? 'overdue' : 'due'} />
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
      {link === null ? <Text style={styles.hint}>رقم الموبايل مش صحيح، صلّحه عشان تبعت واتساب</Text> : null}
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
        <Tile label="مستحق الأسبوع ده" value={kpi.data?.expected_this_week ?? 0} tone="due" />
        <Tile label="المحصّل الشهر ده" value={kpi.data?.collected_this_month ?? 0} tone="paid" />
        <Tile label="إجمالي المتأخرات" value={kpi.data?.overdue_total ?? 0} tone="overdue" />
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
  tiles: { gap: space[3] },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[1],
    ...shadow.card,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  tileLabel: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
  heading: { ...type.title3, color: colors.ink, textAlign: 'right', marginTop: space[2] },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  // Late rows get a terracotta edge on the start side — attention, not alarm.
  rowLate: { borderStartWidth: 4, borderStartColor: colors.overdue },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  name: { ...type.title3, color: colors.ink, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: space[2] },
  hint: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space[6] },
  error: { ...type.body, color: colors.error, textAlign: 'right' },
});
