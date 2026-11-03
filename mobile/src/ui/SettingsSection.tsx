import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { border, colors, radius, space, type } from './theme';

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
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
    gap: space[4],
  },
  title: { ...type.title3, color: colors.ink, textAlign: 'right' },
});
