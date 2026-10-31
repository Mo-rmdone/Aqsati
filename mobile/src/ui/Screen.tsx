import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, spacing } from './theme';

export function Screen({
  title,
  children,
  scroll = true,
}: {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = (
    <>
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
  title: { fontSize: font.title, fontWeight: '700', color: colors.text, textAlign: 'right' },
});
