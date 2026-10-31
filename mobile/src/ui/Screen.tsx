import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, size, space, type } from './theme';

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
      {onBack || title ? (
        <View style={styles.bar}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              onPress={onBack}
              hitSlop={8}
              style={styles.back}
            >
              {/* RTL: "back" points to the start edge, i.e. right. */}
              <ChevronRight size={size.iconMd} color={colors.brand} />
              <Text style={styles.backText}>رجوع</Text>
            </Pressable>
          ) : null}
          {title ? <Text style={styles.title}>{title}</Text> : null}
        </View>
      ) : null}
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
  root: { flex: 1, backgroundColor: colors.paper },
  // Web/tablet: the app is one centered phone-width column.
  content: {
    padding: size.gutter,
    gap: space[4],
    flexGrow: 1,
    width: '100%',
    maxWidth: size.columnMax,
    alignSelf: 'center',
  },
  bar: { gap: space[1] },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    minHeight: size.tapMin,
  },
  backText: { ...type.label, color: colors.brand },
  title: { ...type.title2, color: colors.ink, textAlign: 'right' },
});
