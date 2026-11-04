import { usePathname, useRouter, type Href } from 'expo-router';
import { ChartColumn, FileText, House, Plus, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, radius, size, space, type } from './theme';

type Item = { label: string; href: Href; match: string; Icon: LucideIcon; disabled?: boolean };

const items: Item[] = [
  { label: 'الرئيسية', href: '/', match: '/', Icon: House },
  { label: 'العملاء', href: '/customers', match: '/customers', Icon: Users },
  { label: 'الفواتير', href: '/invoices', match: '/invoices', Icon: FileText },
  { label: 'التقارير', href: '/', match: '/reports', Icon: ChartColumn, disabled: true },
  { label: 'الإعدادات', href: '/settings', match: '/settings', Icon: SlidersHorizontal },
];

function isActive(path: string, match: string): boolean {
  if (match === '/') return path === '/' || path === '';
  return path === match || path.startsWith(`${match}/`);
}

export function Sidebar() {
  const router = useRouter();
  const path = usePathname();
  return (
    <View style={styles.root}>
      <View style={styles.logoRow}>
        <View style={styles.mark}>
          <Text style={styles.markText}>ن</Text>
        </View>
        <Text style={styles.brand}>نوتة</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="فاتورة جديدة"
        onPress={() => router.push('/sale/new')}
        style={styles.cta}
      >
        <Plus size={size.iconMd} color={colors.onCoin} strokeWidth={2.75} />
        <Text style={styles.ctaText}>فاتورة جديدة</Text>
      </Pressable>

      <View style={styles.nav}>
        {items.map(({ label, href, match, Icon, disabled }) => {
          const active = !disabled && isActive(path, match);
          // Black pill = where you are; the rest stay dark gray, never faint.
          const fg = active ? colors.onInverse : disabled ? colors.inkMuted : colors.ink;
          return (
            <Pressable
              key={label}
              accessibilityRole="link"
              accessibilityLabel={label}
              accessibilityState={{ selected: active, disabled: !!disabled }}
              disabled={disabled}
              onPress={() => router.navigate(href)}
              style={(state) => [
                styles.item,
                !active && !disabled && (state as { hovered?: boolean }).hovered && styles.itemHover,
                active && styles.itemActive,
              ]}
            >
              <Icon size={size.iconMd} color={fg} />
              <Text style={[styles.itemText, { color: fg }, active && styles.itemTextActive]}>{label}</Text>
              {disabled ? (
                <View style={styles.soon}>
                  <Text style={styles.soonText}>قريب</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: size.sidebar,
    backgroundColor: colors.surface,
    borderEndWidth: border.hairline,
    borderEndColor: colors.line,
    padding: space[4],
    gap: space[5],
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  mark: {
    width: size.logo,
    height: size.logo,
    borderRadius: radius.md,
    backgroundColor: colors.inverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { ...type.title3, color: colors.onInverse },
  brand: { ...type.wordmark, color: colors.ink },
  cta: {
    minHeight: size.tapLg,
    borderRadius: radius.md,
    backgroundColor: colors.coin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  ctaText: { ...type.label, color: colors.onCoin },
  nav: { gap: space[1] },
  item: {
    minHeight: size.tapMin,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[3],
  },
  itemHover: { backgroundColor: colors.surfaceSunken },
  itemActive: { backgroundColor: colors.inverse },
  itemText: { ...type.body },
  itemTextActive: { ...type.bodyStrong },
  soon: {
    marginStart: 'auto',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  soonText: { ...type.helper, color: colors.inkMuted },
});
