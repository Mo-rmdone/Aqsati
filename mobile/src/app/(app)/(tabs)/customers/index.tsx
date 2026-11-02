import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CUSTOMER_LIST_LIMIT, useCustomerCount, useCustomerSummaries, type CustomerFilter, type CustomerSummary } from '../../../../api/customers';
import { customerRowTarget } from '../../../../lib/customersParams';
import { useCustomersParams } from '../../../../lib/useCustomersParams';
import { formatDateAr } from '../../../../lib/date';
import { formatEGP } from '../../../../lib/money';
import { customerStatusChip } from '../../../../lib/status';
import { Button } from '../../../../ui/Button';
import { DataTable } from '../../../../ui/DataTable';
import { FilterChips } from '../../../../ui/FilterChips';
import { useIsDesktop } from '../../../../ui/layout';
import { Money } from '../../../../ui/Money';
import { Screen } from '../../../../ui/Screen';
import { StatusChip } from '../../../../ui/StatusChip';
import { colors, radius, shadow, size, space, type } from '../../../../ui/theme';

const FILTERS: { value: CustomerFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'paid_month', label: 'دفعوا الشهر ده' },
  { value: 'late_month', label: 'متأخرين الشهر ده' },
  { value: 'late_many', label: 'متأخرين كتير' },
  { value: 'owes', label: 'عليهم فلوس' },
];

function StatusCell({ status }: { status: string | null }) {
  const chip = customerStatusChip(status);
  return <StatusChip label={chip.label} tone={chip.tone} />;
}

function NextDue({ c }: { c: CustomerSummary }) {
  if (c.next_due_date == null) return <Text style={styles.muted}>-</Text>;
  const amount = c.next_due_amount == null ? '' : `${formatEGP(c.next_due_amount)} · `;
  return <Text style={styles.cellText}>{`${amount}${formatDateAr(c.next_due_date)}`}</Text>;
}

// Customers are added inside the new-invoice flow, so this list is the shop's real
// customers: everyone with at least one invoice.
export default function Customers() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { q: paramQ, picking, clearPick } = useCustomersParams();
  const [search, setSearch] = useState(paramQ);
  const [debounced, setDebounced] = useState(paramQ);
  const [filter, setFilter] = useState<CustomerFilter>('all');
  // The tab stays mounted, so a new ?q= (e.g. a second search from Home) must re-seed the field.
  useEffect(() => {
    if (paramQ) {
      setSearch(paramQ);
      setDebounced(paramQ);
    }
  }, [paramQ]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isLoading, error, refetch } = useCustomerSummaries(debounced, filter);
  const { data: total } = useCustomerCount(filter);
  const searching = debounced.trim().length > 0 || filter !== 'all';
  const open = (c: CustomerSummary) => {
    const target = customerRowTarget(picking, c.customer_id);
    if (target.clearPick) clearPick();
    router.push(target.path);
  };
  const importButton = picking ? null : (
    <Button title="استيراد من إكسل" variant="secondary" onPress={() => router.push('/import')} />
  );

  const emptyNode =
    searching ? (
      <Text style={styles.empty}>مفيش نتائج</Text>
    ) : (
      <View style={styles.center}>
        <Text style={styles.empty}>لسه مفيش عملاء. أول فاتورة تعملها، العميل بتاعها هيظهر هنا.</Text>
        {picking ? null : <Button title="فاتورة جديدة" onPress={() => router.push('/sale/new')} />}
      </View>
    );

  return (
    <Screen title={picking ? 'اختار العميل' : 'العملاء'} wide actions={importButton}>
      {total !== undefined ? (
        <Text style={styles.count}>
          {data && data.length >= CUSTOMER_LIST_LIMIT && total > data.length && !debounced.trim()
            ? `أول ${CUSTOMER_LIST_LIMIT} من ${total}`
            : `${total} عميل`}
        </Text>
      ) : null}
      <View style={desktop ? styles.searchRow : styles.searchStack}>
        <View style={[styles.search, desktop && styles.searchDesktop]}>
          <Search size={size.iconSm} color={colors.inkMuted} />
          <TextInput
            accessibilityLabel="بحث بالاسم أو الموبايل"
            placeholder="ابحث بالاسم أو الموبايل"
            placeholderTextColor={colors.inkMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      <Text style={styles.hint}>العميل الجديد بيتضاف من جوه الفاتورة.</Text>
      {desktop ? null : importButton}
      {isLoading ? <ActivityIndicator color={colors.brand} /> : null}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>تعذر تحميل العملاء</Text>
          <Button title="إعادة المحاولة" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : null}
      {data && desktop ? (
        <DataTable
          rows={data}
          keyOf={(c) => c.customer_id ?? ''}
          onRowPress={open}
          empty={emptyNode}
          columns={[
            { key: 'name', title: 'الاسم', render: (c) => <Text style={styles.cellName}>{c.name}</Text> },
            { key: 'phone', title: 'الموبايل', width: 160, render: (c) => <Text style={styles.phone}>{c.phone}</Text> },
            { key: 'count', title: 'الفواتير', width: 110, render: (c) => <Text style={styles.cellText}>{c.invoice_count ?? 0}</Text> },
            { key: 'remaining', title: 'الباقي عليه', width: 170, render: (c) => <Money value={c.remaining_total ?? 0} /> },
            { key: 'next', title: 'أقرب قسط', width: 220, render: (c) => <NextDue c={c} /> },
            { key: 'status', title: 'الحالة', width: 160, render: (c) => <StatusCell status={c.status} /> },
          ]}
        />
      ) : null}
      {data && !desktop && data.length === 0 ? emptyNode : null}
      {data && !desktop
        ? data.map((c) => (
            <Pressable key={c.customer_id} accessibilityRole="button" onPress={() => open(c)} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.phone}>{c.phone}</Text>
                <View style={styles.rowMeta}>
                  <StatusCell status={c.status} />
                  <Money value={c.remaining_total ?? 0} />
                </View>
              </View>
              {/* RTL: "forward" points to the end edge, i.e. left. */}
              <ChevronLeft size={size.iconMd} color={colors.inkMuted} />
            </Pressable>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: size.tapLg,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
  },
  // Desktop: search and filters share one row, as in the approved design.
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  searchStack: { gap: space[4] },
  searchDesktop: { flex: 1, minWidth: size.sideColumn },
  searchInput: { flex: 1, ...type.body, color: colors.ink, textAlign: 'right', minHeight: size.tapLg },
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
  name: { ...type.title3, color: colors.ink, textAlign: 'right' },
  cellName: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  cellText: { ...type.body, color: colors.ink, textAlign: 'right' },
  muted: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  phone: { ...type.body, color: colors.inkMuted, textAlign: 'right', writingDirection: 'ltr' },
  count: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  hint: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
  center: { gap: space[3], paddingVertical: space[6] },
});
