import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDateAr } from '../lib/date';
import { parseDayMonth, promiseChoices } from '../lib/promise';
import { Button } from './Button';
import { Field } from './Field';
import { useIsDesktop } from './layout';
import { colors, radius, size, space, type } from './theme';

export const NOTE_MAX = 500;

export function ContactSheet({
  visible,
  customerName,
  onClose,
  onSave,
  today,
}: {
  visible: boolean;
  customerName: string;
  onClose: () => void;
  /** Return false (or reject) to keep the sheet open with an error; the parent closes it on success. */
  onSave: (v: { note: string; promiseDate?: string }) => Promise<boolean | void> | boolean | void;
  today: string;
}) {
  const desktop = useIsDesktop();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    setSaving(true);
    setFailed(false);
    let ok = true;
    try {
      ok = (await onSave({ note: note.trim(), promiseDate: promiseDate ?? undefined })) !== false;
    } catch {
      ok = false;
    }
    setSaving(false);
    if (!ok) setFailed(true);
  };
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (visible) {
      setNote('');
      setChosen(null);
      setTyped('');
      setSaving(false);
      setFailed(false);
    }
  }, [visible]);

  const typedDate = typed.trim() ? parseDayMonth(typed, today) : null;
  const typedInvalid = typed.trim() !== '' && typedDate === null;
  const choices = promiseChoices(today);
  // Chips are keyed/selected by label: on a month's last day two labels share one date.
  const chosenDate = choices.find((c) => c.label === chosen)?.date ?? null;
  const promiseDate = typed.trim() ? typedDate : chosenDate;
  const canSave = !typedInvalid && (note.trim() !== '' || promiseDate !== null);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={[styles.overlay, desktop ? styles.overlayDesktop : styles.overlayPhone]}>
        <Pressable accessibilityLabel="إغلاق" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.card, desktop ? styles.cardDesktop : styles.cardPhone]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={styles.title}>{`ملاحظة على ${customerName}`}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>الملاحظة</Text>
              <TextInput
                accessibilityLabel="الملاحظة"
                multiline
                maxLength={NOTE_MAX}
                value={note}
                onChangeText={setNote}
                placeholderTextColor={colors.inkMuted}
                style={styles.noteInput}
              />
            </View>
            <Text style={styles.label}>وعد يدفع يوم</Text>
            <View style={styles.chips}>
              {choices.map((c) => {
                const on = chosen === c.label && !typed.trim();
                return (
                  <Pressable
                    key={c.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setTyped('');
                      setChosen(on ? null : c.label);
                    }}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Field
              label="أو اكتب التاريخ (يوم/شهر)"
              value={typed}
              onChangeText={(t) => {
                setTyped(t);
                if (t.trim()) setChosen(null);
              }}
              error={typedInvalid ? 'التاريخ مش صحيح' : null}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />
            {promiseDate ? <Text style={styles.picked}>{`وعد يدفع ${formatDateAr(promiseDate)}`}</Text> : null}
            {failed ? <Text style={styles.failed}>ماتحفظتش، جرّب تاني</Text> : null}
            <View style={styles.buttons}>
              <View style={styles.flex}>
                <Button
                  title={saving ? 'بيتحفظ…' : 'حفظ'}
                  disabled={!canSave || saving}
                  onPress={() => void save()}
                />
              </View>
              <View style={styles.flex}>
                <Button title="رجوع" variant="secondary" onPress={onClose} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  overlayDesktop: { alignItems: 'center', justifyContent: 'center' },
  overlayPhone: { justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.scrim },
  failed: { ...type.body, color: colors.error, textAlign: 'right' },
  card: { backgroundColor: colors.surface, padding: space[5] },
  cardDesktop: { width: '100%', maxWidth: size.columnMax, borderRadius: radius.xl, maxHeight: '90%' },
  cardPhone: { width: '100%', borderTopStartRadius: radius.xl, borderTopEndRadius: radius.xl, maxHeight: '90%' },
  body: { gap: space[3] },
  title: { ...type.title3, color: colors.ink, textAlign: 'right' },
  field: { gap: space[2] },
  label: { ...type.label, color: colors.ink, textAlign: 'right' },
  noteInput: {
    minHeight: size.tapLg * 2,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space[4],
    ...type.body,
    color: colors.ink,
    textAlign: 'right',
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: size.tapMin,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.inverse, borderColor: colors.inverse },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.onInverse },
  picked: { ...type.bodyStrong, color: colors.brand, textAlign: 'right' },
  buttons: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
  flex: { flex: 1 },
});
