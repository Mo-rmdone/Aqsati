import { useRouter } from 'expo-router';
import { FileSpreadsheet, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  applyRowEdit,
  downloadTemplate,
  fetchExistingImports,
  findExistingCustomers,
  markDuplicates,
  markNameConflicts,
  readSpreadsheet,
  useImportSave,
  type ExistingImport,
} from '../../api/import';
import { useAuth } from '../../lib/auth';
import { formatDateAr } from '../../lib/date';
import {
  IMPORT_COLUMNS,
  normalizePhone,
  rowsFromSheet,
  summarize,
  toImportRows,
  type ImportRow,
  type RawKey,
} from '../../lib/importRows';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Money } from '../../ui/Money';
import { Screen } from '../../ui/Screen';
import { StatusChip } from '../../ui/StatusChip';
import { colors, radius, shadow, size, space, type } from '../../ui/theme';

type Existing = Map<string, { id: string; name: string }>;
const IS_WEB = Platform.OS === 'web';

/** Web only: opens the browser file picker (no file input component in React Native Web). */
function pickFile(onFile: (f: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.csv';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function RowCard({
  row,
  open,
  existing,
  onToggle,
  onEdit,
  onSkip,
  onRemove,
}: {
  row: ImportRow;
  open: boolean;
  existing?: { id: string; name: string };
  onToggle: () => void;
  onEdit: (key: RawKey, value: string) => void;
  onSkip: () => void;
  onRemove: () => void;
}) {
  const c = row.computed;
  const locked = row.status === 'saved';
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.cardHead}>
        <Text style={styles.name}>{row.raw.name || 'من غير اسم'}</Text>
        <Text style={styles.sub}>{row.raw.product}</Text>
        {c ? (
          <View style={styles.facts}>
            <Fact label="الإجمالي" value={<Money value={c.total} style={styles.small} />} />
            <Fact label="المقدم" value={<Money value={c.down} style={styles.small} />} />
            <Fact label="القسط" value={<Text style={styles.factText}>{`${c.monthly} × ${c.count}`}</Text>} />
            <Fact label="اتدفع" value={<Text style={styles.factText}>{`${c.paidMonths} شهر`}</Text>} />
            <Fact label="الباقي" value={<Money value={c.left} style={styles.small} />} />
            <Fact label="أول قسط" value={<Text style={styles.factText}>{formatDateAr(c.firstDue)}</Text>} />
            <Fact label="آخر قسط" value={<Text style={styles.factText}>{formatDateAr(c.lastDue)}</Text>} />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.chips}>
        {row.status === 'saved' ? <StatusChip label="اتحفظ" tone="paid" /> : null}
        {row.status === 'failed' ? <StatusChip label={row.failure ?? 'فشل الحفظ'} tone="error" /> : null}
        {row.errors.map((e) => (
          <StatusChip key={e} label={e} tone="error" />
        ))}
        {row.warnings.map((w) => (
          <StatusChip key={w} label={w} tone="due" />
        ))}
        {row.duplicate ? <StatusChip label="موجود بالفعل" tone="unknown" /> : null}
        {existing ? <StatusChip label={`عميل موجود: ${existing.name}`} tone="partial" /> : null}
      </View>

      {row.duplicate && !locked ? (
        <FilterChip label="تخطي" selected={row.skip} onPress={onSkip} />
      ) : null}

      {open && !locked ? (
        <View style={styles.editor}>
          {IMPORT_COLUMNS.map((col) => (
            <Field
              key={col.key}
              label={col.header}
              value={row.raw[col.key]}
              onChangeText={(v) => onEdit(col.key, v)}
              autoCapitalize="none"
            />
          ))}
          <Pressable accessibilityRole="button" onPress={onRemove} style={styles.remove}>
            <Trash2 size={size.iconSm} color={colors.error} />
            <Text style={styles.removeText}>شيل الصف ده</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      {value}
    </View>
  );
}

export default function ImportScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const save = useImportSave();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [existingImports, setExistingImports] = useState<ExistingImport[]>([]);
  const [existing, setExisting] = useState<Existing>(new Map());
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'review'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  // Look up existing customers for any phone not asked about yet (also after phone edits).
  const phonesKey = useMemo(
    () => [...new Set((rows ?? []).map((r) => normalizePhone(r.raw.phone)).filter(Boolean))].sort().join(','),
    [rows],
  );
  useEffect(() => {
    if (!profile || !phonesKey) return;
    let live = true;
    findExistingCustomers(phonesKey.split(','), profile.tenant_id)
      .then((m) => live && setExisting(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [phonesKey, profile]);

  async function onFile(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      const { rows: raws, error } = rowsFromSheet(await readSpreadsheet(file));
      if (error) throw new Error(error);
      if (raws.length === 0) throw new Error('الملف مفيهوش عقود');
      const found = await fetchExistingImports();
      setExistingImports(found);
      setRows(markDuplicates(markNameConflicts(toImportRows(raws)), found));
      setSaved(false);
      setFilter('all');
      setOpenId(null);
    } catch (e) {
      const m = (e as { message?: string } | null)?.message;
      setParseError(m && /[؀-ۿ]/.test(m) ? m : 'تعذر قراية الملف، حاول تاني');
    } finally {
      setParsing(false);
    }
  }

  const sum = useMemo(() => summarize(rows ?? []), [rows]);
  const pending = (rows ?? []).filter((r) => !r.skip && r.errors.length === 0 && r.status !== 'saved');
  const savedCount = (rows ?? []).filter((r) => r.status === 'saved').length;
  const failedCount = (rows ?? []).filter((r) => r.status === 'failed').length;
  const shown = (rows ?? []).filter(
    (r) => filter === 'all' || (!r.skip && (r.errors.length > 0 || r.warnings.length > 0)),
  );

  async function onSave() {
    if (!rows || pending.length === 0) return;
    setProgress({ done: 0, total: pending.length });
    try {
      const out = await save.mutateAsync({ rows, onProgress: (done, total) => setProgress({ done, total }) });
      setRows(out);
      setSaved(true);
    } finally {
      setProgress(null);
    }
  }

  const saving = save.isPending;

  return (
    <Screen title="استيراد من إكسل" onBack={goBack}>
      {!IS_WEB ? (
        <Text style={styles.note}>الاستيراد متاح من المتصفح دلوقتي</Text>
      ) : !rows ? (
        <>
          <Text style={styles.step}>1. نزّل القالب واملاه ببيانات العقود</Text>
          <Button title="نزّل القالب" variant="secondary" onPress={downloadTemplate} />
          <Text style={styles.step}>2. اختار الملف بعد ما تملاه</Text>
          <Button title="اختار الملف" loading={parsing} onPress={() => pickFile(onFile)} />
          {parseError ? <StatusChip label={parseError} tone="error" /> : null}
        </>
      ) : (
        <>
          <View style={styles.summary}>
            <FileSpreadsheet size={size.iconMd} color={colors.brand} />
            <Text style={styles.summaryText}>
              {`${sum.total} عقد · ${sum.customers} عميل · ${sum.needsReview} محتاجين مراجعة · ${sum.duplicates} موجودين بالفعل`}
            </Text>
          </View>

          <View style={styles.chips}>
            <FilterChip label="الكل" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterChip label="محتاج مراجعة" selected={filter === 'review'} onPress={() => setFilter('review')} />
          </View>

          {shown.length === 0 ? <Text style={styles.note}>مفيش صفوف هنا</Text> : null}
          {shown.map((r) => (
            <RowCard
              key={r.id}
              row={r}
              open={openId === r.id}
              existing={existing.get(normalizePhone(r.raw.phone))}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              onEdit={(key, value) => setRows((cur) => cur && applyRowEdit(cur, r.id, { [key]: value }, existingImports))}
              onSkip={() => setRows((cur) => cur && cur.map((x) => (x.id === r.id ? { ...x, skip: !x.skip } : x)))}
              onRemove={() => setRows((cur) => cur && cur.filter((x) => x.id !== r.id))}
            />
          ))}

          {progress ? <Text style={styles.step}>{`بنحفظ ${progress.done} من ${progress.total}`}</Text> : null}
          {saved ? (
            <StatusChip
              label={`اتحفظ ${savedCount} عقد · ${failedCount} فشلوا`}
              tone={failedCount ? 'error' : 'paid'}
            />
          ) : null}
          {saved && pending.length === 0 && failedCount === 0 ? (
            <Button title="خلصنا" onPress={goBack} />
          ) : (
            <Button
              title={saved && failedCount > 0 ? 'حاول تاني' : `حفظ ${pending.length} عقد`}
              loading={saving}
              disabled={pending.length === 0}
              onPress={onSave}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  note: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space[6] },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    padding: space[4],
  },
  summaryText: { ...type.bodyStrong, color: colors.ink, flex: 1, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: size.tapMin,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.brand },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  cardHead: { gap: space[2], minHeight: size.tapMin },
  name: { ...type.title3, color: colors.ink, textAlign: 'right' },
  sub: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  fact: { gap: space[1] },
  factLabel: { ...type.helper, color: colors.inkMuted },
  factText: { ...type.bodyStrong, color: colors.ink },
  small: { ...type.helper },
  editor: { gap: space[3], borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space[3] },
  remove: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: size.tapMin },
  removeText: { ...type.label, color: colors.error },
});
