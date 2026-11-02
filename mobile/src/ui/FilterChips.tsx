import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { border, colors, radius, size, space, type } from './theme';

export type FilterOption<V extends string> = { value: V; label: string; count?: number };

export function FilterChips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: FilterOption<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    // flexGrow 0: inside a vertical ScrollView a horizontal one otherwise stretches to fill the free height.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.chipOn]}
          >
            <Text style={[styles.text, selected && styles.textOn]}>
              {o.count === undefined ? o.label : `${o.label} (${o.count})`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: space[2], alignItems: 'center' },
  chip: {
    minHeight: size.tapMin,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  text: { ...type.label, color: colors.ink },
  textOn: { color: colors.onBrand },
});
