import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, radius, spacing } from './theme';

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const inactive = loading || disabled;
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.base, primary ? styles.primary : styles.secondary, inactive && styles.inactive]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.text, { color: primary ? colors.primaryText : colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  inactive: { opacity: 0.6 },
  text: { fontSize: font.body, fontWeight: '600' },
});
