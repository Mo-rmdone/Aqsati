import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../lib/auth';
import { authErrorMessage } from '../../lib/authErrors';
import { supabase } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Screen } from '../../ui/Screen';
import { colors, space, type } from '../../ui/theme';

export default function Login() {
  const { refreshProfile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setSubmitting(false);
      setError(authErrorMessage(signInError));
      return;
    }
    // Provisions the shop here if this is the first sign-in after email confirmation.
    await refreshProfile();
    setSubmitting(false);
    router.replace('/');
  }

  return (
    <Screen>
      <View style={styles.brand}>
        <Image
          source={require('../../../assets/images/logo-lockup.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="نوتة | Notah"
        />
        <Text style={styles.tagline}>نوتة الأقساط بتاعتك، بتحسب وبتفتكر عنك</Text>
      </View>
      <Text style={styles.title}>تسجيل الدخول</Text>
      <Field
        label="البريد الإلكتروني"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label="كلمة المرور"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="دخول" loading={submitting} onPress={submit} />
      <Link href="/signup" style={styles.link}>
        ليس لديك حساب؟ أنشئ متجرك
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: space[3], paddingTop: space[10], paddingBottom: space[6] },
  logo: { width: 240, height: 61 },
  tagline: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  title: { ...type.title2, color: colors.ink, textAlign: 'right' },
  error: { ...type.helper, color: colors.error, textAlign: 'right' },
  link: { ...type.label, color: colors.brand, textAlign: 'center', paddingVertical: space[3] },
});
