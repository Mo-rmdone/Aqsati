import { useRouter } from 'expo-router';
import { Banknote, FilePlus, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  activityText,
  useCollectionsKpi,
  useRecentActivity,
  useWorklist,
  type ActivityRow,
  type WorklistRow,
} from '../../../api/dashboard';
import { useAuth } from '../../../lib/auth';
import { formatDateAr, headerDateAr } from '../../../lib/date';
import { reminderMessage, whatsappLink } from '../../../lib/whatsapp';
import { Button } from '../../../ui/Button';
import { DataTable } from '../../../ui/DataTable';
import { useIsDesktop } from '../../../ui/layout';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { StatusChip } from '../../../ui/StatusChip';
import { Tile } from '../../../ui/Tile';
import { colors, radius, shadow, size, space, type } from '../../../ui/theme';

function lateText(days: number | null, due: string | null): string {
  if (days !== null && days > 0) return `متأخر ${days} يوم (من ${formatDateAr(due ?? '')})`;
  if (days === 0) return 'مستحق النهارده';
  return due ? `يستحق ${formatDateAr(due)}` : '';
}

function linkFor(row: WorklistRow, shopName: string): string | null {
  if (!row.phone) return null;
  return whatsappLink(
    row.phone,
    reminderMessage({
      customer: row.name ?? '',
      amount: row.amount ?? 0,
      dueDate: formatDateAr(row.due_date ?? ''),
      merchant: shopName,
    }),
  );
}

function payPath(row: WorklistRow): string {
  return `/payment/new?customerId=${row.customer_id}&contractId=${row.contract_id}`;
}

function WorkRow({ row, shopName }: { row: WorklistRow; shopName: string }) {
  const router = useRouter();
  const link = linkFor(row, shopName);
  const overdue = (row.days_late ?? 0) > 0;
  return (
    <View style={[styles.row, overdue && styles.rowLate]}>
      <View style={styles.rowTop}>
        <Text style={styles.name}>{row.name ?? ''}</Text>
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
          <Button title="تسجيل دفعة" onPress={() => router.push(payPath(row))} />
        </View>
      </View>
      {link === null ? <Text style={styles.hint}>رقم الموبايل مش صحيح، صلّحه عشان تبعت واتساب</Text> : null}
    </View>
  );
}

function CompactButton({
  title,
  onPress,
  secondary,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.compact, secondary ? styles.compactSecondary : styles.compactPrimary]}
    >
      <Text style={[styles.compactText, { color: secondary ? colors.brand : colors.onBrand }]}>{title}</Text>
    </Pressable>
  );
}

function WorkTable({ rows, shopName }: { rows: WorklistRow[]; shopName: string }) {
  const router = useRouter();
  return (
    <DataTable
      rows={rows}
      keyOf={(r) => r.installment_id ?? ''}
      empty={<Text style={styles.empty}>مفيش أقساط مستحقة دلوقتي</Text>}
      columns={[
        {
          key: 'customer',
          title: 'العميل',
          render: (r) => (
            <View>
              <Text style={styles.cellName}>{r.name ?? ''}</Text>
              <Text style={styles.phone}>{r.phone ?? ''}</Text>
            </View>
          ),
        },
        {
          key: 'late',
          title: 'المتأخر',
          width: 200,
          render: (r) => <Text style={styles.cellText}>{lateText(r.days_late, r.due_date)}</Text>,
        },
        { key: 'amount', title: 'من', width: 150, render: (r) => <Money value={r.amount ?? 0} /> },
        {
          key: 'status',
          title: 'الحالة',
          width: 190,
          render: (r) => {
            const overdue = (r.days_late ?? 0) > 0;
            return <StatusChip label={overdue ? 'متأخر' : 'مستحق'} tone={overdue ? 'overdue' : 'due'} />;
          },
        },
        {
          key: 'actions',
          title: '',
          width: 270,
          render: (r) => {
            const link = linkFor(r, shopName);
            return (
              <View style={styles.actions}>
                {link ? (
                  <CompactButton
                    title="واتساب"
                    secondary
                    onPress={() => {
                      void Linking.openURL(link);
                    }}
                  />
                ) : null}
                <CompactButton title="تسجيل دفعة" onPress={() => router.push(payPath(r))} />
              </View>
            );
          },
        },
      ]}
    />
  );
}

function ActivityCard() {
  const router = useRouter();
  const activity = useRecentActivity();
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>آخر العمليات</Text>
      {activity.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : activity.isError ? (
        <Text style={styles.error}>تعذّر تحميل العمليات</Text>
      ) : activity.data.length === 0 ? (
        <Text style={styles.empty}>مفيش عمليات النهارده</Text>
      ) : (
        activity.data.map((a: ActivityRow, i) => {
          const t = activityText(a);
          const Icon = a.kind === 'sale' ? FilePlus : Banknote;
          return (
            <Pressable
              key={`${a.at}-${i}`}
              accessibilityRole="button"
              disabled={!a.contract_id}
              onPress={() => router.push(`/contract/${a.contract_id}`)}
              style={styles.activity}
            >
              <View style={[styles.iconDot, { backgroundColor: a.kind === 'sale' ? colors.brandSoft : colors.paidBg }]}>
                <Icon size={size.iconSm} color={a.kind === 'sale' ? colors.brand : colors.paid} />
              </View>
              <View style={styles.activityText}>
                <Text style={styles.cellName}>{t.title}</Text>
                <Text style={styles.sub}>{t.sub}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function SearchField({ onSubmit }: { onSubmit: (term: string) => void }) {
  const [term, setTerm] = useState('');
  return (
    <View style={styles.search}>
      <Search size={size.iconSm} color={colors.inkMuted} />
      <TextInput
        accessibilityLabel="بحث عن عميل"
        placeholder="ابحث عن عميل"
        placeholderTextColor={colors.inkMuted}
        value={term}
        onChangeText={setTerm}
        onSubmitEditing={() => onSubmit(term.trim())}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.searchInput}
      />
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { shopName } = useAuth();
  const kpi = useCollectionsKpi();
  const work = useWorklist();

  const search = (term: string) =>
    router.push(term ? `/customers?q=${encodeURIComponent(term)}` : '/customers');
  const pickPayment = () => router.push('/customers?pick=payment');

  const headerActions = (
    <View style={styles.headerActions}>
      <SearchField onSubmit={search} />
      <Button title="تسجيل دفعة" onPress={pickPayment} />
    </View>
  );

  const tiles = (
    <View style={desktop ? styles.tilesDesktop : styles.tiles}>
      <View style={desktop ? styles.tileCell : undefined}>
        <Tile label="مستحق الأسبوع ده" value={kpi.data?.expected_this_week ?? 0} tone="due" />
      </View>
      <View style={desktop ? styles.tileCell : undefined}>
        <Tile label="المحصّل الشهر ده" value={kpi.data?.collected_this_month ?? 0} tone="paid" />
      </View>
      <View style={desktop ? styles.tileCell : undefined}>
        <Tile label="إجمالي المتأخرات" value={kpi.data?.overdue_total ?? 0} tone="overdue" />
      </View>
    </View>
  );

  const worklist = (
    <>
      <Text style={styles.heading}>مين لازم أكلمه النهارده</Text>
      {work.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : work.isError ? (
        <Text style={styles.error}>تعذّر تحميل القائمة</Text>
      ) : desktop ? (
        <WorkTable rows={work.data} shopName={shopName ?? ''} />
      ) : work.data.length === 0 ? (
        <Text style={styles.empty}>مفيش أقساط مستحقة دلوقتي</Text>
      ) : (
        work.data.map((r) => <WorkRow key={r.installment_id} row={r} shopName={shopName ?? ''} />)
      )}
    </>
  );

  return (
    <Screen title={shopName ?? 'الرئيسية'} wide actions={headerActions}>
      <Text style={styles.date}>{headerDateAr()}</Text>
      {desktop ? null : (
        <View style={styles.quick}>
          <Button title="فاتورة جديدة" variant="coin" onPress={() => router.push('/sale/new')} />
          <Button title="تسجيل دفعة" onPress={pickPayment} />
          <Button title="بحث عن عميل" variant="secondary" onPress={() => search('')} />
        </View>
      )}
      {tiles}
      {kpi.isError ? <Text style={styles.error}>تعذّر تحميل الأرقام</Text> : null}
      {desktop ? (
        <View style={styles.split}>
          <View style={styles.main}>{worklist}</View>
          <View style={styles.side}>
            <ActivityCard />
          </View>
        </View>
      ) : (
        <>
          {worklist}
          <ActivityCard />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  quick: { gap: space[3] },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: size.tapLg,
    minWidth: 280,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
  },
  searchInput: { flex: 1, ...type.body, color: colors.ink, textAlign: 'right', minHeight: size.tapLg },
  tiles: { gap: space[3] },
  tilesDesktop: { flexDirection: 'row', gap: space[4] },
  tileCell: { flex: 1 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  main: { flex: 1, gap: space[4] },
  side: { width: size.sideColumn },
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
  compact: {
    minHeight: size.tapMin,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPrimary: { backgroundColor: colors.brand },
  compactSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brand },
  compactText: { ...type.label },
  cellName: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  cellText: { ...type.body, color: colors.ink, textAlign: 'right' },
  phone: { ...type.body, color: colors.inkMuted, textAlign: 'right', writingDirection: 'ltr' },
  sub: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  activity: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: size.tapMin },
  activityText: { flex: 1 },
  iconDot: {
    width: size.tapMin - space[2],
    height: size.tapMin - space[2],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space[6] },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
});
