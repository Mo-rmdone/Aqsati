import { CircleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, size, space, type } from './theme';

export function Field({
  label,
  error,
  helper,
  style,
  onFocus,
  onBlur,
  ...input
}: { label: string; error?: string | null; helper?: string } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, focused && styles.focused, error ? styles.inputError : null, style]}
        {...input}
      />
      {error ? (
        <View style={styles.errorRow}>
          <CircleAlert size={size.iconSm} color={colors.error} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  label: { ...type.label, color: colors.ink, textAlign: 'right' },
  input: {
    minHeight: size.tapLg,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    ...type.body,
    color: colors.ink,
    textAlign: 'right',
  },
  focused: { borderColor: colors.focus, borderWidth: 2 },
  inputError: { borderColor: colors.error, borderWidth: 2 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  error: { ...type.helper, color: colors.error, textAlign: 'right', flexShrink: 1 },
  helper: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
});
