import { Pressable, StyleSheet, Text } from 'react-native';

import { border, colors, radius, size, space, type } from './theme';

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: size.tapMin,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: border.strong,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  // Selected = black, the system's "this one" mark.
  chipOn: { backgroundColor: colors.inverse, borderColor: colors.inverse },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.onInverse },
});
