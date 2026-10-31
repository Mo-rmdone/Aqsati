import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, font, radius, spacing } from './theme';

export function Field({ label, error, style, ...input }: { label: string; error?: string | null } & TextInputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: font.small, color: colors.muted, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: font.body,
    color: colors.text,
    textAlign: 'right',
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: font.small, color: colors.danger, textAlign: 'right' },
});
