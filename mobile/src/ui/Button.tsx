import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { border, colors, radius, size, space, type } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'coin';

// One blue action per screen; everything else is a white bordered button.
const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.brand, pressed: colors.brandStrong, fg: colors.onBrand },
  secondary: { bg: colors.surface, pressed: colors.surfaceSunken, fg: colors.ink, border: colors.lineStrong },
  danger: { bg: colors.error, pressed: colors.error, fg: colors.onError },
  coin: { bg: colors.coin, pressed: colors.brandStrong, fg: colors.onCoin },
};

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
  variant?: Variant;
}) {
  const inactive = loading || disabled;
  const p = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed ? p.pressed : p.bg },
        p.border ? { borderWidth: border.strong, borderColor: p.border } : null,
        inactive && styles.inactive,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <Text style={[styles.text, { color: p.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.tapLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  inactive: { opacity: 0.55 },
  text: { ...type.label },
});
