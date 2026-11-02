import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useInvoices, type InvoiceQuery, type InvoiceRow } from '../../../../api/invoices';
import { formatDateAr, todayISO } from '../../../../lib/date';
import { formatEGP } from '../../../../lib/money';
import { invoiceStatusChip } from '../../../../lib/status';
import { Button } from '../../../../ui/Button';
import { DataTable } from '../../../../ui/DataTable';
import { FilterChips } from '../../../../ui/FilterChips';
import { useIsDesktop } from '../../../../ui/layout';
import { Money } from '../../../../ui/Money';
import { Screen } from '../../../../ui/Screen';
import { StatusChip } from '../../../../ui/StatusChip';
import { colors, radius, shadow, size, space, type } from '../../../../ui/theme';

const DATES: { value: 'today' | 'month' | 'all'; label: string }[] = [
  { value: 'today', label: 'النهارده' },
  { value: 'month', label: 'الشهر ده' },
  { value: 'all', label: 'الكل' },
];
const TYPES: { value: InvoiceQuery['type']; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'cash', label: 'كاش' },
  { value: 'installment', label: 'قسط' },
];
const STATUSES: { value: InvoiceQuery['status']; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'open', label: 'جاري' },
  { value: 'late', label: 'متأخر' },
  { value: 'settled', label: 'خلّص' },
];
const PERIOD_LABEL = { today: 'النهارده', month: 'الشهر ده', all: 'كل الفترات' };

function StatusCell({ status }: { status: string | null }) {
  const chip = invoiceStatusChip(status);
  return <StatusChip label={chip.label} tone={chip.tone} />;
}

function Group({ label, inline, children }: { label: string; inline: boolean; children: React.ReactNode }) {
  return (
    <View style={inline ? styles.groupInline : styles.group}>
      <Text style={inline ? styles.groupLabelInline : styles.groupLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function Invoices() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [date, setDate] = useState<'today' | 'month' | 'all'>('month');
  const [saleType, setSaleType] = useState<InvoiceQuery['type']>('all');
  const [status, setStatus] = useState<InvoiceQuery['status']>('all');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch } = useInvoices(
    { search: debounced, date, type: saleType, status },
    todayISO(),
  );
  const open = (r: InvoiceRow) => router.push(`/contract/${r.contract_id}`);
  const filtered = debounced.trim().length > 0 || date !== 'all' || saleType !== 'all' || status !== 'all';

  const countText = data ? `${data.capped ? '+' : ''}${data.count} فاتورة` : '';
  const period = PERIOD_LABEL[debounced.trim() ? 'all' : date];
  const subtitle = data ? `${period} · ${countText}` : period;
  const footer = data
    ? `بيعت في الفترة: ${countText} · ${formatEGP(data.total)}${data.capped ? ' (أول 100)' : ''}`
    : '';

  const emptyNode = filtered ? (
    <Text style={styles.empty}>مفيش فواتير بالشروط دي</Text>
  ) : (
    <View style={styles.center}>
      <Text style={styles.empty}>لسه مفيش فواتير.</Text>
      <Button title="فاتورة جديدة" onPress={() => router.push('/sale/new')} />
    </View>
  );

  return (
    <Screen title="الفواتير" wide>
      <Text style={styles.sub}>{subtitle}</Text>
      <View style={styles.search}>
        <Search size={size.iconSm} color={colors.inkMuted} />
        <TextInput
          accessibilityLabel="بحث في الفواتير"
          placeholder="ابحث برقم العقد، رقم الفاتورة الخارجي، السلعة، أو العميل"
          placeholderTextColor={colors.inkMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>
      <View style={desktop ? styles.filtersRow : styles.filtersStack}>
        <Group label="التاريخ" inline={desktop}>
          <FilterChips options={DATES} value={date} onChange={setDate} />
        </Group>
        <Group label="النوع" inline={desktop}>
          <FilterChips options={TYPES} value={saleType} onChange={setSaleType} />
        </Group>
        <Group label="الحالة" inline={desktop}>
          <FilterChips options={STATUSES} value={status} onChange={setStatus} />
        </Group>
      </View>
      {isLoading ? <ActivityIndicator color={colors.brand} /> : null}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>تعذر تحميل الفواتير</Text>
          <Button title="إعادة المحاولة" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : null}
      {data && desktop ? (
        <>
          <DataTable
            rows={data.rows}
            keyOf={(r) => r.contract_id ?? ''}
            onRowPress={open}
            empty={emptyNode}
            columns={[
              { key: 'no', title: 'رقم', width: 90, render: (r) => <Text style={styles.cellText}>{r.contract_no}</Text> },
              { key: 'customer', title: 'العميل', render: (r) => <Text style={styles.cellName}>{r.customer_name}</Text> },
              { key: 'product', title: 'السلعة', render: (r) => <Text style={styles.cellText}>{r.product_desc}</Text> },
              {
                key: 'type',
                title: 'النوع',
                width: 100,
                render: (r) => <Text style={styles.cellText}>{r.sale_type === 'cash' ? 'كاش' : 'قسط'}</Text>,
              },
              {
                key: 'date',
                title: 'التاريخ',
                width: 150,
                render: (r) => <Text style={styles.cellText}>{formatDateAr(r.sale_date ?? '')}</Text>,
              },
              { key: 'total', title: 'الإجمالي', width: 150, render: (r) => <Money value={r.total_payable ?? 0} /> },
              {
                key: 'remaining',
                title: 'الباقي',
                width: 150,
                render: (r) => (r.remaining == null ? <Text style={styles.cellText}>-</Text> : <Money value={r.remaining} />),
              },
              { key: 'status', title: 'الحالة', width: 140, render: (r) => <StatusCell status={r.status} /> },
            ]}
          />
          {data.rows.length > 0 ? <Text style={styles.footer}>{footer}</Text> : null}
        </>
      ) : null}
      {data && !desktop && data.rows.length === 0 ? emptyNode : null}
      {data && !desktop
        ? data.rows.map((r) => (
            <Pressable key={r.contract_id} accessibilityRole="button" onPress={() => open(r)} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.title}>{`${r.contract_no} · ${r.product_desc}`}</Text>
                <Text style={styles.meta}>{`${r.customer_name} · ${formatDateAr(r.sale_date ?? '')}`}</Text>
                <View style={styles.rowMeta}>
                  <StatusCell status={r.status} />
                  {r.remaining == null ? null : <Money value={r.remaining} />}
                </View>
              </View>
              {/* RTL: "forward" points to the end edge, i.e. left. */}
              <ChevronLeft size={size.iconMd} color={colors.inkMuted} />
            </Pressable>
          ))
        : null}
      {data && !desktop && data.rows.length > 0 ? <Text style={styles.footer}>{footer}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: size.tapLg,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
  },
  searchInput: { flex: 1, ...type.body, color: colors.ink, textAlign: 'right', minHeight: size.tapLg },
  group: { gap: space[1] },
  groupLabel: { ...type.label, color: colors.inkMuted, textAlign: 'right' },
  // Desktop: the three groups sit on one wrapping row, each label beside its chips.
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[8], rowGap: space[3] },
  filtersStack: { gap: space[4] },
  groupInline: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  groupLabelInline: { ...type.helper, color: colors.inkMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: size.tapLg + space[4],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadow.card,
  },
  rowText: { flex: 1, gap: space[1] },
  rowMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  title: { ...type.title3, color: colors.ink, textAlign: 'right' },
  meta: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  cellName: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  cellText: { ...type.body, color: colors.ink, textAlign: 'right' },
  footer: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
  center: { gap: space[3], paddingVertical: space[6] },
});
