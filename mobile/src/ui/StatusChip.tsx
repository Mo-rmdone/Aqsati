import { Ban, CalendarX, Check, CircleHelp, Clock, Contrast, Pencil, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { border, colors, radius, size, space, type } from './theme';

// Money statuses are never color-only: each tone carries an icon, the caller's word,
// a tinted fill and a tinted border.
export type Tone = 'paid' | 'partial' | 'due' | 'overdue' | 'unknown' | 'error' | 'edited';

const tones: Record<Tone, { bg: string; fg: string; line: string; Icon: LucideIcon }> = {
  paid: { bg: colors.paidBg, fg: colors.paid, line: colors.paidLine, Icon: Check },
  partial: { bg: colors.partialBg, fg: colors.partial, line: colors.partialLine, Icon: Contrast },
  due: { bg: colors.dueBg, fg: colors.due, line: colors.dueLine, Icon: Clock },
  overdue: { bg: colors.overdueBg, fg: colors.overdue, line: colors.overdueLine, Icon: CalendarX },
  unknown: { bg: colors.unknownBg, fg: colors.unknown, line: colors.unknownLine, Icon: CircleHelp },
  error: { bg: colors.errorBg, fg: colors.error, line: colors.errorLine, Icon: Ban },
  edited: { bg: colors.surfaceSunken, fg: colors.inkMuted, line: colors.unknownLine, Icon: Pencil },
};

export function StatusChip({ label, tone = 'unknown' }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.line }]}>
      <t.Icon size={size.iconSm - 4} color={t.fg} strokeWidth={2.5} />
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  text: { ...type.chip },
});
