import { useRouter } from 'expo-router';
import { FileSpreadsheet, Trash2 } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  applyRowEdit,
  downloadTemplate,
  fetchExistingImports,
  findExistingCustomers,
  markDuplicates,
  markNameConflicts,
  readSpreadsheet,
  removeRowById,
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
import { border, colors, radius, shadow, size, space, type } from '../../ui/theme';

type Cust = { id: string; name: string };
const IS_WEB = Platform.OS === 'web';
const LOOKUP_DEBOUNCE_MS = 500;
const FETCH_FAILED = 'تعذر التأكد من العقود المستوردة قبل كده، حاول تاني';
const FILE_FAILED = 'تعذر قراية الملف، حاول تاني';
const SAVE_FAILED = 'تعذر الحفظ، حاول تاني';
const LOOKUP_FAILED = 'تعذر التأكد من العملاء الموجودين، ممكن تكمل وتحفظ عادي';

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

function FilterChip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn, disabled && styles.inactive]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
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

// Memoized with stable callbacks: a keystroke in one row re-renders only that row.
const RowCard = memo(function RowCard({
  row,
  open,
  locked,
  existing,
  onToggle,
  onEdit,
  onSkip,
  onRemove,
}: {
  row: ImportRow;
  open: boolean;
  locked: boolean;
  existing?: Cust;
  onToggle: (id: string) => void;
  onEdit: (id: string, key: RawKey, value: string) => void;
  onSkip: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const c = row.computed;
  const saved = row.status === 'saved';
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        disabled={locked}
        onPress={() => onToggle(row.id)}
        style={styles.cardHead}
      >
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
        {saved ? <StatusChip label="اتحفظ" tone="paid" /> : null}
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

      {row.duplicate && !saved ? (
        <FilterChip label="تخطي" selected={row.skip} disabled={locked} onPress={() => onSkip(row.id)} />
      ) : null}

      {open && !saved && !locked ? (
        <View style={styles.editor}>
          {IMPORT_COLUMNS.map((col) => (
            <Field
              key={col.key}
              label={col.header}
              value={row.raw[col.key]}
              onChangeText={(v) => onEdit(row.id, col.key, v)}
              autoCapitalize="none"
            />
          ))}
          <Pressable accessibilityRole="button" onPress={() => onRemove(row.id)} style={styles.remove}>
            <Trash2 size={size.iconSm} color={colors.inkMuted} />
            <Text style={styles.removeText}>شيل الصف ده</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

export default function ImportScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const save = useImportSave();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const existingImports = useRef<ExistingImport[]>([]);
  const [existing, setExisting] = useState<Map<string, Cust>>(new Map());
  const looked = useRef<Map<string, Cust | null>>(new Map());
  const [lookupTick, setLookupTick] = useState(0);
  const [lookupError, setLookupError] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'review'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved] = useState(false);

  const saving = save.isPending;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  // Existing-customer lookup: debounced, only for phones not looked up yet.
  const phonesKey = useMemo(
    () => [...new Set((rows ?? []).map((r) => normalizePhone(r.raw.phone)).filter(Boolean))].sort().join(','),
    [rows],
  );
  useEffect(() => {
    if (!profile || !phonesKey) return;
    const missing = phonesKey.split(',').filter((p) => !looked.current.has(p));
    if (missing.length === 0) return;
    let live = true;
    const t = setTimeout(() => {
      findExistingCustomers(missing, profile.tenant_id)
        .then((m) => {
          if (!live) return;
          for (const p of missing) looked.current.set(p, m.get(p) ?? null);
          setExisting((cur) => {
            const next = new Map(cur);
            for (const p of missing) {
              const c = m.get(p);
              if (c) next.set(p, c);
              else next.delete(p);
            }
            return next;
          });
        })
        .catch(() => live && setLookupError(true));
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phonesKey, profile, lookupTick]);

  function reset() {
    setRows(null);
    setExisting(new Map());
    looked.current = new Map();
    existingImports.current = [];
    setLookupError(false);
    setSaved(false);
    setOpenId(null);
    setFilter('all');
    setProgress(null);
    setError(null);
  }

  async function onFile(file: File) {
    reset();
    setParsing(true);
    let raws;
    try {
      const parsed = rowsFromSheet(await readSpreadsheet(file));
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.rows.length === 0) throw new Error('الملف مفيهوش عقود');
      raws = parsed.rows;
    } catch (e) {
      const m = (e as { message?: string } | null)?.message;
      setError(m && /[؀-ۿ]/.test(m) ? m : FILE_FAILED);
      setParsing(false);
      return;
    }
    try {
      const found = await fetchExistingImports();
      existingImports.current = found;
      setRows(markDuplicates(markNameConflicts(toImportRows(raws)), found));
    } catch {
      setError(FETCH_FAILED);
    } finally {
      setParsing(false);
    }
  }

  const onToggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), []);
  const onEdit = useCallback(
    (id: string, key: RawKey, value: string) =>
      setRows((cur) => cur && applyRowEdit(cur, id, { [key]: value }, existingImports.current)),
    [],
  );
  const onSkip = useCallback(
    (id: string) => setRows((cur) => cur && cur.map((x) => (x.id === id ? { ...x, skip: !x.skip } : x))),
    [],
  );
  const onRemove = useCallback((id: string) => {
    setRows((cur) => cur && removeRowById(cur, id));
    setOpenId(null);
  }, []);

  const sum = useMemo(() => summarize(rows ?? []), [rows]);
  const pending = (rows ?? []).filter((r) => !r.skip && r.errors.length === 0 && r.status !== 'saved');
  const savedCount = (rows ?? []).filter((r) => r.status === 'saved').length;
  const failedCount = (rows ?? []).filter((r) => r.status === 'failed').length;
  const shown = (rows ?? []).filter(
    (r) => filter === 'all' || (!r.skip && (r.errors.length > 0 || r.warnings.length > 0)),
  );

  async function onSave() {
    if (saving || !rows || pending.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: pending.length });
    try {
      const out = await save.mutateAsync({ rows, onProgress: (done, total) => setProgress({ done, total }) });
      const byId = new Map(out.map((r) => [r.id, r]));
      setRows((cur) => cur && cur.map((r) => byId.get(r.id) ?? r));
      setSaved(true);
      // Saved customers now exist: look phones up again.
      looked.current = new Map();
      setLookupTick((n) => n + 1);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setProgress(null);
    }
  }

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
        </>
      ) : (
        <>
          <View style={styles.summary}>
            <FileSpreadsheet size={size.iconMd} color={colors.brand} />
            <Text style={styles.summaryText}>
              {`${sum.total} عقد · ${sum.customers} عميل · ${sum.needsReview} محتاجين مراجعة · ${sum.duplicates} موجودين بالفعل`}
            </Text>
          </View>
          {!saving ? <Button title="اختار ملف تاني" variant="secondary" onPress={reset} /> : null}

          <View style={styles.chips}>
            <FilterChip label="الكل" selected={filter === 'all'} disabled={saving} onPress={() => setFilter('all')} />
            <FilterChip
              label="محتاج مراجعة"
              selected={filter === 'review'}
              disabled={saving}
              onPress={() => setFilter('review')}
            />
          </View>

          {shown.length === 0 ? <Text style={styles.note}>مفيش صفوف هنا</Text> : null}
          {shown.map((r) => (
            <RowCard
              key={r.id}
              row={r}
              open={openId === r.id}
              locked={saving}
              existing={existing.get(normalizePhone(r.raw.phone))}
              onToggle={onToggle}
              onEdit={onEdit}
              onSkip={onSkip}
              onRemove={onRemove}
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
      {error ? <StatusChip label={error} tone="error" /> : null}
      {lookupError ? <Text style={styles.helper}>{LOOKUP_FAILED}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  note: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space[6] },
  helper: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
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
    borderWidth: border.strong,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  inactive: { opacity: 0.55 },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.brand },
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.hairline,
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
  editor: { gap: space[3], borderTopWidth: border.hairline, borderTopColor: colors.line, paddingTop: space[3] },
  remove: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: size.tapMin },
  removeText: { ...type.label, color: colors.inkMuted },
});
