import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from './theme';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.border, fg: colors.text },
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
};

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  text: { fontSize: font.small, fontWeight: '600' },
});
