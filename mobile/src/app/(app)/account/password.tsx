import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../../lib/auth';
import { changePassword, type ChangePasswordResult } from '../../../lib/password';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { useIsDesktop } from '../../../ui/layout';
import { Screen } from '../../../ui/Screen';
import { colors, size, space, type } from '../../../ui/theme';

const MESSAGES: Record<Exclude<ChangePasswordResult, 'ok'>, string> = {
  wrong_current: 'كلمة المرور الحالية غلط',
  weak: 'كلمة المرور ضعيفة (6 حروف على الأقل)',
  same: 'اختار كلمة مختلفة عن الحالية',
  failed: 'ماتغيرتش، جرّب تاني',
};

export default function ChangePassword() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { session } = useAuth();
  const email = session?.user.email ?? '';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    if (next !== confirm) {
      setError('الكلمتين مش زي بعض');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await changePassword(email, current, next);
    setSubmitting(false);
    if (result === 'ok') {
      router.replace({ pathname: '/settings', params: { saved: 'password' } });
      return;
    }
    setError(MESSAGES[result]);
  }

  return (
    <Screen title="غيّر كلمة المرور" onBack={() => router.back()}>
      <View style={[styles.column, desktop && styles.columnDesktop]}>
        <Field
          label="كلمة المرور الحالية"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
        />
        <Field
          label="كلمة المرور الجديدة"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
        />
        <Field
          label="تأكيد كلمة المرور الجديدة"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={() => void submit()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title="غيّر كلمة المرور"
          loading={submitting}
          disabled={!email || !current || !next || !confirm}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4], width: '100%' },
  columnDesktop: { maxWidth: size.settingsMax, alignSelf: 'center' },
  error: { ...type.helper, color: colors.error, textAlign: 'right' },
});
