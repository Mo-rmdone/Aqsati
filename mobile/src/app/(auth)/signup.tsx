import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { stashPendingSignup, useAuth } from '../../lib/auth';
import { authErrorMessage } from '../../lib/authErrors';
import { supabase } from '../../lib/supabase';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Screen } from '../../ui/Screen';
import { colors, font } from '../../ui/theme';

export default function Signup() {
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  const [shopName, setShopName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const createdEmail = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit() {
    if (!shopName.trim() || !fullName.trim() || !email.trim()) {
      setError('أكمل جميع الحقول');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
      return;
    }
    setSubmitting(true);
    setError(null);

    // The account already exists and is signed in (a previous attempt created it but
    // signup_tenant failed). Calling signUp again would fail with "already registered",
    // so re-stash the (possibly edited) names and retry provisioning. On success the
    // root gate sees the profile and leaves the auth stack.
    const existingEmail = session?.user.email ?? createdEmail.current;
    if (existingEmail) {
      await stashPendingSignup(existingEmail, { tenantName: shopName.trim(), fullName: fullName.trim() });
      const ok = await refreshProfile();
      setSubmitting(false);
      if (!ok) setError('تعذّر إنشاء المتجر، حاول مرة أخرى');
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
    if (signUpError) {
      setSubmitting(false);
      setError(authErrorMessage(signUpError));
      return;
    }

    if (data.session) {
      // Email confirmation off: live session, provision the shop now. Remember the
      // account locally too: the context session lags behind onAuthStateChange.
      createdEmail.current = email.trim();
      const { error: rpcError } = await supabase.rpc('signup_tenant', {
        p_tenant_name: shopName.trim(),
        p_full_name: fullName.trim(),
      });
      if (rpcError) {
        // The account exists but has no shop; keep the names so a retry can provision it.
        await stashPendingSignup(email, { tenantName: shopName.trim(), fullName: fullName.trim() });
        setSubmitting(false);
        setError(authErrorMessage(rpcError));
        return;
      }
      await refreshProfile();
      setSubmitting(false);
      router.replace('/');
      return;
    }

    // Email confirmation on: provision on the first sign-in after confirming.
    await stashPendingSignup(email, { tenantName: shopName.trim(), fullName: fullName.trim() });
    setSubmitting(false);
    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <Screen title="تحقق من بريدك الإلكتروني">
        <Text style={styles.body}>
          أرسلنا رابط تأكيد إلى {email}. بعد التأكيد سجّل الدخول لإكمال إنشاء متجرك.
        </Text>
        <Link href="/login" style={styles.link}>
          الذهاب لتسجيل الدخول
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title="إنشاء متجر جديد">
      <Field label="اسم المتجر" value={shopName} onChangeText={setShopName} />
      <Field label="اسم المالك" value={fullName} onChangeText={setFullName} autoComplete="name" />
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
        autoComplete="new-password"
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="إنشاء الحساب" loading={submitting} onPress={submit} />
      <Link href="/login" style={styles.link}>
        لديك حساب بالفعل؟ سجّل الدخول
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: font.body, textAlign: 'right' },
  error: { color: colors.danger, fontSize: font.small, textAlign: 'right' },
  link: { color: colors.primary, fontSize: font.body, textAlign: 'center' },
});
