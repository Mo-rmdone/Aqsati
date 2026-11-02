import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useIsDesktop } from './layout';
import { border, colors, radius, size, space, type } from './theme';

export type Column<T> = { key: string; title: string; width?: number; render: (row: T) => ReactNode };

const DEFAULT_WIDTH = 160;

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  onRowPress,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  onRowPress?: (row: T) => void;
  empty?: ReactNode;
}) {
  const desktop = useIsDesktop();
  const cell = (c: Column<T>) => (c.width ? { width: c.width } : { flex: 1, minWidth: DEFAULT_WIDTH });
  const minWidth = columns.reduce((sum, c) => sum + (c.width ?? DEFAULT_WIDTH), 0);
  return (
    <View style={styles.card}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
      >
        <View style={{ minWidth, flexGrow: 1 }}>
          <View style={styles.head}>
            {columns.map((c) => (
              <View key={c.key} style={[styles.cell, cell(c)]}>
                <Text style={[styles.headText, desktop ? type.helper : type.body]}>{c.title}</Text>
              </View>
            ))}
          </View>
          {rows.length === 0 ? (
            <View style={styles.empty}>{empty}</View>
          ) : (
            rows.map((row, i) => (
              <Pressable
                key={keyOf(row)}
                accessibilityRole={onRowPress ? 'button' : undefined}
                disabled={!onRowPress}
                onPress={() => onRowPress?.(row)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowLine,
                  pressed && { backgroundColor: colors.brandSoft },
                ]}
              >
                {columns.map((c) => (
                  <View key={c.key} style={[styles.cell, cell(c)]}>
                    {c.render(row)}
                  </View>
                ))}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  scrollView: { flexGrow: 0 },
  scroll: { flexGrow: 1 },
  head: { flexDirection: 'row', backgroundColor: colors.surfaceSunken, minHeight: size.tapMin, alignItems: 'center' },
  headText: { color: colors.inkMuted, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: size.tapMin + space[2] },
  rowLine: { borderTopWidth: border.hairline, borderTopColor: colors.line },
  cell: { paddingHorizontal: space[4], paddingVertical: space[3], justifyContent: 'center' },
  empty: { padding: space[6], alignItems: 'center' },
});
