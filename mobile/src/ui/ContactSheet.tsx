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
  onSave: (v: { note: string; promiseDate?: string }) => void;
  today: string;
}) {
  const desktop = useIsDesktop();
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (visible) {
      setNote('');
      setChosen(null);
      setTyped('');
    }
  }, [visible]);

  const typedDate = typed.trim() ? parseDayMonth(typed, today) : null;
  const typedInvalid = typed.trim() !== '' && typedDate === null;
  const promiseDate = typed.trim() ? typedDate : chosen;
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
              {promiseChoices(today).map((c) => {
                const on = chosen === c.date && !typed.trim();
                return (
                  <Pressable
                    key={c.date}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setTyped('');
                      setChosen(on ? null : c.date);
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
            <View style={styles.buttons}>
              <View style={styles.flex}>
                <Button
                  title="حفظ"
                  disabled={!canSave}
                  onPress={() => onSave({ note: note.trim(), promiseDate: promiseDate ?? undefined })}
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
  // Dimmed scrim from the ink token (no hand-written colors).
  backdrop: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.ink, opacity: 0.45 },
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
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.onBrand },
  picked: { ...type.bodyStrong, color: colors.brand, textAlign: 'right' },
  buttons: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
  flex: { flex: 1 },
});
