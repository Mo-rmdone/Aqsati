import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, spacing } from './theme';

export function Screen({
  title,
  children,
  scroll = true,
  onBack,
}: {
  onBack?: () => void;
  title?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = (
    <>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>رجوع</Text>
        </Pressable>
      ) : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={styles.root}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={styles.content}>{body}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  back: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  backText: { fontSize: font.body, color: colors.primary, fontWeight: '600' },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text, textAlign: 'right' },
});
