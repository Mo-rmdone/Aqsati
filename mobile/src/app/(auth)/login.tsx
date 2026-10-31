import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Screen } from '../../ui/Screen';
import { colors, font } from '../../ui/theme';

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
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      return;
    }
    // Provisions the shop here if this is the first sign-in after email confirmation.
    await refreshProfile();
    setSubmitting(false);
    router.replace('/');
  }

  return (
    <Screen title="تسجيل الدخول">
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
  error: { color: colors.danger, fontSize: font.small, textAlign: 'right' },
  link: { color: colors.primary, fontSize: font.body, textAlign: 'center' },
});
