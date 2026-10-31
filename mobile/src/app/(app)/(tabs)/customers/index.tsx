import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCustomers } from '../../../../api/customers';
import { Button } from '../../../../ui/Button';
import { Screen } from '../../../../ui/Screen';
import { colors, radius, shadow, size, space, type } from '../../../../ui/theme';

// Customers are added inside the new-invoice flow, so this list is the shop's real
// customers: everyone with at least one invoice.
export default function Customers() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isLoading, error, refetch } = useCustomers(debounced, { withInvoices: true });
  const searching = debounced.trim().length > 0;

  return (
    <Screen title="العملاء">
      <View style={styles.search}>
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
      {isLoading ? <ActivityIndicator color={colors.brand} /> : null}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>تعذر تحميل العملاء</Text>
          <Button title="إعادة المحاولة" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : null}
      {data && data.length === 0 ? (
        searching ? (
          <Text style={styles.empty}>مفيش نتائج</Text>
        ) : (
          <View style={styles.center}>
            <Text style={styles.empty}>لسه مفيش عملاء. أول فاتورة تعملها، العميل بتاعها هيظهر هنا.</Text>
            <Button title="فاتورة جديدة" onPress={() => router.push('/sale/new')} />
          </View>
        )
      ) : null}
      {data?.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => router.push(`/customers/${c.id}`)}
          style={styles.row}
        >
          <View style={styles.rowText}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.phone}>{c.phone}</Text>
          </View>
          {/* RTL: "forward" points to the end edge, i.e. left. */}
          <ChevronLeft size={size.iconMd} color={colors.inkMuted} />
        </Pressable>
      ))}
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
  name: { ...type.title3, color: colors.ink, textAlign: 'right' },
  phone: { ...type.helper, color: colors.inkMuted, textAlign: 'right', writingDirection: 'ltr' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
  center: { gap: space[3], paddingVertical: space[6] },
});
