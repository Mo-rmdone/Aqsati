import { StyleSheet, Text, View } from 'react-native';

import { Money } from './Money';
import { useIsDesktop } from './layout';
import { colors, radius, shadow, size, space, type } from './theme';

export type TileTone = 'due' | 'paid' | 'overdue' | 'neutral';
const tileColor: Record<TileTone, string> = {
  due: colors.due,
  paid: colors.paid,
  overdue: colors.overdue,
  neutral: colors.inkMuted,
};

export function Tile({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: TileTone }) {
  const desktop = useIsDesktop();
  const valueStyle = { ...type.moneyLg, color: tone === 'overdue' ? colors.overdue : colors.ink };
  return (
    <View style={styles.tile}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: tileColor[tone] }]} />
        <Text style={[desktop ? type.helper : type.body, styles.label]}>{label}</Text>
      </View>
      {typeof value === 'number' ? <Money value={value} style={valueStyle} /> : <Text style={valueStyle}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[1],
    ...shadow.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
  label: { color: colors.inkMuted, textAlign: 'right' },
});
