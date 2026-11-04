import { StyleSheet, Text, View } from 'react-native';

import { formatEGP } from '../lib/money';
import { border, colors, radius, shadow, space, type } from './theme';

/**
 * Phone Home numbers in one card: the overdue total leads (the number that needs action),
 * the week's due and the month's collection follow as two short lines.
 */
export function NumbersCard({ overdue, dueWeek, collectedMonth }: { overdue: number; dueWeek: number; collectedMonth: number }) {
  const late = overdue > 0;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{late ? 'متأخر على الناس' : 'مفيش متأخرات'}</Text>
      {late ? <Text style={[styles.lead, styles.leadLate]}>{formatEGP(overdue)}</Text> : null}
      <View style={styles.lines}>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>مستحق الأسبوع ده</Text>
          <Text style={styles.lineValue}>{formatEGP(dueWeek)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>المحصّل الشهر ده</Text>
          <Text style={[styles.lineValue, collectedMonth > 0 && styles.paid]}>{formatEGP(collectedMonth)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.hairline,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[2],
    ...shadow.card,
  },
  label: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  lead: { ...type.displayMoney, color: colors.ink, textAlign: 'right' },
  leadLate: { color: colors.overdue },
  lines: { gap: space[1], borderTopWidth: border.hairline, borderTopColor: colors.line, paddingTop: space[2] },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  lineLabel: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  lineValue: { ...type.bodyStrong, color: colors.ink },
  paid: { color: colors.paid },
});
