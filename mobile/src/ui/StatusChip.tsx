import { Ban, CalendarX, Check, CircleHelp, Clock, Contrast, Pencil, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, size, space, type } from './theme';

// Money statuses are never color-only: each tone carries an icon and the caller's word.
export type Tone = 'paid' | 'partial' | 'due' | 'overdue' | 'unknown' | 'error' | 'edited';

const tones: Record<Tone, { bg: string; fg: string; Icon: LucideIcon }> = {
  paid: { bg: colors.paidBg, fg: colors.paid, Icon: Check },
  partial: { bg: colors.partialBg, fg: colors.partial, Icon: Contrast },
  due: { bg: colors.dueBg, fg: colors.due, Icon: Clock },
  overdue: { bg: colors.overdueBg, fg: colors.overdue, Icon: CalendarX },
  unknown: { bg: colors.unknownBg, fg: colors.unknown, Icon: CircleHelp },
  error: { bg: colors.errorBg, fg: colors.error, Icon: Ban },
  edited: { bg: colors.surfaceSunken, fg: colors.inkMuted, Icon: Pencil },
};

export function StatusChip({ label, tone = 'unknown' }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
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
    borderRadius: radius.pill,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  text: { ...type.chip },
});
