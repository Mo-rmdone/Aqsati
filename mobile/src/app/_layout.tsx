import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, I18nManager, Platform, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '../lib/auth';
import { QueryCacheGuard } from '../lib/QueryCacheGuard';
import { isSupabaseConfigured } from '../lib/supabase';
import { Button } from '../ui/Button';
import { colors, font, spacing } from '../ui/theme';

// Arabic-first app: force RTL on native (takes effect after a reload). On web the
// export is a single-page app (+html.tsx is not used), so set dir/lang at runtime.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function NotConfigured() {
  return (
    <Centered>
      <Text style={styles.heading}>التطبيق غير مهيّأ</Text>
      <Text style={styles.body}>
        متغيرات الاتصال بالخادم (EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY) غير مضبوطة.
        أضفها في ملف البيئة ثم أعد تشغيل التطبيق.
      </Text>
    </Centered>
  );
}

function NoProfile() {
  const { refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <Text style={styles.heading}>تعذّر تحميل حسابك</Text>
      <Text style={styles.body}>لم نعثر على بيانات المتجر لهذا الحساب. حاول مرة أخرى أو سجّل الخروج.</Text>
      <View style={styles.actions}>
        <Button
          title="إعادة المحاولة"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await refreshProfile();
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button title="تسجيل الخروج" variant="secondary" onPress={() => void signOut()} />
      </View>
    </Centered>
  );
}

function Gate() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const inAuth = (segments[0] as string | undefined) === '(auth)';

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }
  // Session without a profile: show a retry screen (never a spinner), but keep the
  // auth stack mounted so a signup in flight is not torn down mid-provisioning.
  if (session && !profile && !inAuth) return <NoProfile />;

  if (!session && !inAuth) return <Redirect href="/login" />;
  if (session && profile && inAuth) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  if (!isSupabaseConfigured) return <NotConfigured />;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <QueryCacheGuard />
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: font.body, color: colors.muted, textAlign: 'center', maxWidth: 420 },
  actions: { gap: spacing.sm, alignSelf: 'stretch', maxWidth: 320 },
});
