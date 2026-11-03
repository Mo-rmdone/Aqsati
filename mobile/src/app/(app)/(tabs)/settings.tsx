import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native';

import {
  removeShopLogo,
  uploadShopLogo,
  useLogoUrl,
  useShopSettings,
  useUpdateShopSettings,
} from '../../../api/settings';
import { sanitizeRate } from '../../../api/sales';
import { useAuth } from '../../../lib/auth';
import { todayISO } from '../../../lib/date';
import { diffSettings, formFromSettings, validateSettings, type SettingsForm } from '../../../lib/settingsForm';
import { DEFAULT_TEMPLATE, PLACEHOLDERS, renderTemplate } from '../../../lib/template';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { Field } from '../../../ui/Field';
import { useIsDesktop } from '../../../ui/layout';
import { Screen } from '../../../ui/Screen';
import { SettingsSection } from '../../../ui/SettingsSection';
import { colors, radius, size, space, type } from '../../../ui/theme';

const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = 'image/png,image/jpeg,image/webp';

function pickImage(onFile: (f: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = LOGO_TYPES;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

export default function Settings() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const qc = useQueryClient();
  const { saved: savedParam } = useLocalSearchParams<{ saved?: string }>();
  const { profile, signOut } = useAuth();
  const owner = profile?.role === 'owner';
  const tenantId = profile?.tenant_id ?? null;

  const settings = useShopSettings();
  const save = useUpdateShopSettings();
  const saved = settings.data;
  const logo = useLogoUrl(saved?.logoPath ?? null);

  const [draft, setDraft] = useState<SettingsForm | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!saved) {
    return (
      <Screen title="الإعدادات">
        {settings.isError ? (
          <Text style={styles.error}>ماقدرناش نجيب الإعدادات، جرّب تاني</Text>
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
      </Screen>
    );
  }

  const form = draft ?? formFromSettings(saved);
  const errors = validateSettings(form);
  const input = diffSettings(form, saved);
  const edit = (patch: Partial<SettingsForm>) => {
    setStatus('idle');
    setDraft({ ...form, ...patch });
  };

  const onSave = async () => {
    setShowErrors(true);
    if (!input || Object.keys(errors).length > 0) return;
    try {
      await save.mutateAsync(input);
      setDraft(null);
      setShowErrors(false);
      setStatus('saved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('failed');
    }
  };

  const refreshLogo = async () => {
    await qc.invalidateQueries({ queryKey: ['shopSettings'] });
    await qc.invalidateQueries({ queryKey: ['logoUrl'] });
  };

  const onLogoFile = async (file: File) => {
    setLogoError(null);
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('الصورة كبيرة، اختار صورة أقل من 1 ميجا');
      return;
    }
    if (!tenantId) return;
    setLogoBusy(true);
    try {
      await uploadShopLogo(tenantId, file, file.type, saved.logoPath);
      await refreshLogo();
    } catch {
      setLogoError('ماتحفظش، جرّب تاني');
    } finally {
      setLogoBusy(false);
    }
  };

  const onLogoRemove = async () => {
    if (!tenantId || !saved.logoPath) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      await removeShopLogo(tenantId, saved.logoPath);
      await refreshLogo();
    } catch {
      setLogoError('ماتحفظش، جرّب تاني');
    } finally {
      setLogoBusy(false);
    }
  };

  const preview = renderTemplate(form.template, {
    customer: 'سيد',
    amount: 1500,
    date: todayISO(),
    shop: form.name.trim() || saved.name,
  });
  const err = (k: keyof SettingsForm) => (showErrors ? errors[k] : undefined);

  return (
    <Screen title="الإعدادات">
      <View style={[styles.column, desktop && styles.columnDesktop]}>
        {savedParam === 'password' ? <Text style={styles.ok}>اتغيّرت كلمة المرور</Text> : null}
        <SettingsSection title="بيانات المحل">
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              {logo.data ? <Image source={{ uri: logo.data }} style={styles.logo} accessibilityLabel="لوجو المحل" /> : null}
            </View>
            {owner && Platform.OS === 'web' ? (
              <View style={styles.logoActions}>
                <Button title="غيّر اللوجو" variant="secondary" loading={logoBusy} onPress={() => pickImage((f) => void onLogoFile(f))} />
                {saved.logoPath ? (
                  <Button title="شيل اللوجو" variant="secondary" disabled={logoBusy} onPress={() => void onLogoRemove()} />
                ) : null}
              </View>
            ) : null}
          </View>
          {logoError ? <Text style={styles.error}>{logoError}</Text> : null}
          <Field label="الاسم" value={form.name} editable={owner} error={err('name')} onChangeText={(v) => edit({ name: v })} />
          <Field label="العنوان" value={form.address} editable={owner} onChangeText={(v) => edit({ address: v })} />
          <Field
            label="التليفون"
            value={form.phone}
            editable={owner}
            keyboardType="phone-pad"
            error={err('phone')}
            helper="بيظهروا على الإيصالات والكشوف"
            onChangeText={(v) => edit({ phone: v })}
          />
        </SettingsSection>

        <SettingsSection title="إعدادات التقسيط">
          <Field
            label="الفايدة الافتراضية %"
            value={form.rate}
            editable={owner}
            keyboardType="decimal-pad"
            error={err('rate')}
            onChangeText={(v) => edit({ rate: sanitizeRate(v) })}
          />
          <View style={styles.group}>
            <Text style={styles.label}>المدة الافتراضية</Text>
            <View style={styles.chips}>
              {[1, 2, 3, 4, 5].map((y) => (
                <Chip
                  key={y}
                  label={`${y} ${y === 1 ? 'سنة' : 'سنين'}`}
                  selected={form.years === y}
                  onPress={() => owner && edit({ years: y })}
                />
              ))}
              <Chip label="بدون" selected={form.years === null} onPress={() => owner && edit({ years: null })} />
            </View>
            <Text style={styles.helper}>بتتطبق على الفواتير الجديدة بس</Text>
          </View>
        </SettingsSection>

        <SettingsSection title="رسالة الواتساب">
          <Field
            label="نص الرسالة"
            value={form.template}
            editable={owner}
            multiline
            numberOfLines={5}
            error={err('template')}
            style={styles.multiline}
            onChangeText={(v) => edit({ template: v })}
          />
          {owner ? (
            <>
              <View style={styles.chips}>
                {PLACEHOLDERS.map((p) => (
                  <Chip key={p} label={p} selected={false} onPress={() => edit({ template: form.template + p })} />
                ))}
              </View>
              <Button
                title="رجّع الرسالة الأصلية"
                variant="secondary"
                disabled={form.template === DEFAULT_TEMPLATE}
                onPress={() => edit({ template: DEFAULT_TEMPLATE })}
              />
            </>
          ) : null}
          <View style={styles.previewBox}>
            <Text style={styles.label}>معاينة</Text>
            <Text style={styles.preview}>{preview}</Text>
          </View>
        </SettingsSection>

        {owner ? (
          <View style={styles.group}>
            <Button title="حفظ" loading={save.isPending} disabled={!input} onPress={() => void onSave()} />
            {status === 'saved' ? <Text style={styles.ok}>اتحفظ</Text> : null}
            {status === 'failed' ? <Text style={styles.error}>ماتحفظش، جرّب تاني</Text> : null}
          </View>
        ) : null}

        <SettingsSection title="الحساب">
          <View style={styles.group}>
            <Text style={styles.label}>المستخدم</Text>
            <Text style={styles.value}>{profile?.full_name ?? '—'}</Text>
          </View>
          <Button title="غيّر كلمة المرور" variant="secondary" onPress={() => router.push('/account/password')} />
          <Button title="تسجيل الخروج" variant="secondary" onPress={() => void signOut()} />
        </SettingsSection>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4], width: '100%' },
  columnDesktop: { maxWidth: size.settingsMax, alignSelf: 'center' },
  group: { gap: space[2] },
  label: { ...type.label, color: colors.ink, textAlign: 'right' },
  value: { ...type.body, color: colors.ink, textAlign: 'right' },
  helper: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
  error: { ...type.helper, color: colors.error, textAlign: 'right' },
  ok: { ...type.label, color: colors.paid, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  logoBox: {
    width: size.logoLg,
    height: size.logoLg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  logoActions: { flex: 1, gap: space[2] },
  multiline: { minHeight: size.tapLg * 2, paddingVertical: space[3], textAlignVertical: 'top' },
  previewBox: { backgroundColor: colors.brandSoft, borderRadius: radius.md, padding: space[4], gap: space[2] },
  preview: { ...type.body, color: colors.ink, textAlign: 'right' },
});
