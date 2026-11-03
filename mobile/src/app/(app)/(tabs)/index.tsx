import { useRouter } from 'expo-router';
import {
  Banknote,
  CheckSquare,
  FilePlus,
  MessageCircle,
  Search,
  Square,
  StickyNote,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { activityText, useCollectionsKpi, useRecentActivity, type ActivityRow } from '../../../api/dashboard';
import { useFollowup, useLogContact, type ContactKind, type FollowupRow } from '../../../api/followup';
import { useShopSettings } from '../../../api/settings';
import { useAuth } from '../../../lib/auth';
import { formatDateAr, headerDateAr, todayISO } from '../../../lib/date';
import { newId } from '../../../lib/ids';
import { followupReminder, whatsappLink } from '../../../lib/whatsapp';
import { Button } from '../../../ui/Button';
import { ContactSheet } from '../../../ui/ContactSheet';
import { DataTable } from '../../../ui/DataTable';
import { useIsDesktop } from '../../../ui/layout';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { StatusChip } from '../../../ui/StatusChip';
import { Tile } from '../../../ui/Tile';
import { colors, radius, shadow, size, space, type } from '../../../ui/theme';
import { VoicePanel } from '../../../ui/VoicePanel';

function isOverdue(r: FollowupRow): boolean {
  return r.status === 'late';
}

function payPath(r: FollowupRow): string {
  return `/payment/new?customerId=${r.customer_id}`;
}

function kindWord(kind: string | null): string {
  if (kind === 'call') return 'اتصلت';
  if (kind === 'whatsapp') return 'واتساب';
  return 'ملاحظة';
}

function sinceText(r: FollowupRow): string {
  if ((r.days_late ?? 0) > 0) return `متأخر ${r.days_late} يوم`;
  return r.next_due_date ? `يستحق ${formatDateAr(r.next_due_date)}` : '';
}

function amountOf(r: FollowupRow): number {
  return (r.overdue_count ?? 0) > 0 ? (r.overdue_amount ?? 0) : (r.next_due_amount ?? 0);
}

/** The status line under a row: contacted (bucket 2) or promised (bucket 1). Null for bucket 0. */
function contactLine(r: FollowupRow): string | null {
  const promise = r.promise_date ? `وعد يدفع ${formatDateAr(r.promise_date)}` : null;
  if (r.bucket === 2) {
    const words: string[] = [];
    if (r.called_today) words.push('اتصلت');
    if (r.whatsapp_today) words.push('واتساب');
    if (words.length === 0) words.push(kindWord(r.last_contact_kind));
    const parts = [`✓ ${words.join(' · ')}`];
    if (r.last_note) parts.push(r.last_note);
    if (promise) parts.push(promise);
    return parts.join(' · ');
  }
  return r.bucket === 1 ? promise : null;
}

function IconAction({
  label,
  Icon,
  onPress,
  disabled,
  compact,
  wide,
}: {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  compact: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        compact ? styles.compact : styles.phoneAction,
        wide ? styles.wideAction : styles.iconAction,
        disabled && styles.actionDone,
      ]}
    >
      <Icon size={size.iconSm} color={colors.brand} />
      {wide ? <Text style={styles.actionText}>{label}</Text> : null}
    </Pressable>
  );
}

function RowActions({
  row,
  compact,
  called,
  onCall,
  onWhatsapp,
  onNote,
  onPay,
}: {
  row: FollowupRow;
  compact: boolean;
  called: boolean;
  onCall: () => void;
  onWhatsapp: (() => void) | null;
  onNote: () => void;
  onPay: () => void;
}) {
  return (
    <View style={styles.actions}>
      <IconAction
        compact={compact}
        wide
        label={called ? '✓ اتصلت' : 'اتصلت'}
        Icon={called ? CheckSquare : Square}
        disabled={called}
        onPress={onCall}
      />
      {onWhatsapp ? (
        <IconAction compact={compact} label="واتساب" Icon={MessageCircle} onPress={onWhatsapp} />
      ) : (
        <Text style={styles.phoneHint}>رقم الموبايل مش صحيح، صلّحه عشان تبعت واتساب</Text>
      )}
      <IconAction compact={compact} label="ملاحظة" Icon={StickyNote} onPress={onNote} />
      {compact ? (
        <Pressable accessibilityRole="button" onPress={onPay} style={[styles.compact, styles.compactPrimary]}>
          <Text style={[styles.compactText, { color: colors.onBrand }]}>تسجيل دفعة</Text>
        </Pressable>
      ) : (
        <View style={styles.flex}>
          <Button title="تسجيل دفعة" onPress={onPay} />
        </View>
      )}
    </View>
  );
}

function FollowupList({
  rows,
  shopName,
  template,
}: {
  rows: FollowupRow[];
  shopName: string;
  template: string | null;
}) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const log = useLogContact();
  // One pending id per (customer, kind); reused until that mutation succeeds so a retry/double press is idempotent.
  const pending = useRef(new Map<string, string>());
  // Optimistic "called" marks; cleared whenever fresh server data arrives (the server is the source of truth).
  const [called, setCalled] = useState<Set<string>>(new Set());
  useEffect(() => setCalled(new Set()), [rows]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noteFor, setNoteFor] = useState<FollowupRow | null>(null);
  // One id per note-sheet session: retries of the same sheet reuse it, a new sheet gets a new one.
  const noteId = useRef('');

  const send = async (
    customerId: string,
    kind: ContactKind,
    extra?: { note?: string; promiseDate?: string },
    fixedId?: string,
  ): Promise<boolean> => {
    const key = `${customerId}:${kind}`;
    let id = fixedId ?? pending.current.get(key);
    if (!id) {
      id = newId();
      pending.current.set(key, id);
    }
    try {
      await log.mutateAsync({ id, customerId, kind, ...extra });
      pending.current.delete(key);
      setErrors((e) => ({ ...e, [customerId]: '' }));
      return true;
    } catch {
      setErrors((e) => ({ ...e, [customerId]: 'مقدرتش أسجّل المتابعة، جرّب تاني' }));
      return false;
    }
  };

  const isCalled = (r: FollowupRow) =>
    called.has(r.customer_id ?? '') || !!r.called_today;

  const doCall = async (r: FollowupRow) => {
    const id = r.customer_id ?? '';
    if (await send(id, 'call')) setCalled((s) => new Set(s).add(id));
  };

  const linkOf = (r: FollowupRow): string | null =>
    r.phone ? whatsappLink(r.phone, followupReminder(r, shopName, template)) : null;

  const doWhatsapp = (r: FollowupRow, link: string) => {
    // Open synchronously on the press (popup blockers reject window.open after an await), log in parallel.
    void Linking.openURL(link);
    void send(r.customer_id ?? '', 'whatsapp');
  };

  const actionsFor = (r: FollowupRow, compact: boolean) => {
    const link = linkOf(r);
    return (
      <RowActions
        row={r}
        compact={compact}
        called={isCalled(r)}
        onCall={() => void doCall(r)}
        onWhatsapp={link ? () => doWhatsapp(r, link) : null}
        onNote={() => {
          noteId.current = newId();
          setNoteFor(r);
        }}
        onPay={() => router.push(payPath(r))}
      />
    );
  };

  const sheet = (
    <ContactSheet
      visible={noteFor !== null}
      customerName={noteFor?.name ?? ''}
      today={todayISO()}
      onClose={() => setNoteFor(null)}
      onSave={async ({ note, promiseDate }) => {
        const target = noteFor;
        if (!target?.customer_id) return false;
        const ok = await send(target.customer_id, 'note', { note, promiseDate }, noteId.current);
        if (ok) setNoteFor(null);
        return ok;
      }}
    />
  );

  if (rows.length === 0) {
    return <Text style={styles.empty}>مفيش حد محتاج متابعة دلوقتي</Text>;
  }

  if (desktop) {
    return (
      <>
        <DataTable
          rows={rows}
          keyOf={(r) => r.customer_id ?? ''}
          columns={[
            {
              key: 'customer',
              title: 'العميل',
              render: (r) => (
                <View>
                  <Text style={[styles.cellName, r.bucket === 2 && styles.dimText]}>{r.name ?? ''}</Text>
                  <Text style={styles.phone}>{r.phone ?? ''}</Text>
                </View>
              ),
            },
            {
              key: 'amount',
              title: 'المبلغ',
              width: 140,
              render: (r) => (
                <View>
                  <Money value={amountOf(r)} />
                  <Text style={styles.phone}>
                    {isOverdue(r)
                      ? 'متأخر'
                      : r.next_due_date
                        ? `القسط الجاي ${formatDateAr(r.next_due_date)}`
                        : ''}
                  </Text>
                </View>
              ),
            },
            {
              key: 'since',
              title: 'الحالة',
              width: 140,
              render: (r) => (
                <View style={styles.followCell}>
                  <StatusChip label={isOverdue(r) ? 'متأخر' : 'مستحق'} tone={isOverdue(r) ? 'overdue' : 'due'} />
                  <Text style={styles.phone}>{sinceText(r)}</Text>
                </View>
              ),
            },
            {
              key: 'follow',
              title: 'المتابعة',
              width: 300,
              render: (r) => {
                const line = contactLine(r);
                return (
                  <View style={styles.followCell}>
                    {line ? <Text style={[styles.contactLine, r.bucket === 2 && styles.dimText]}>{line}</Text> : null}
                    {actionsFor(r, true)}
                    {errors[r.customer_id ?? ''] ? (
                      <Text style={styles.error}>{errors[r.customer_id ?? '']}</Text>
                    ) : null}
                  </View>
                );
              },
            },
          ]}
        />
        {sheet}
      </>
    );
  }

  return (
    <>
      {rows.map((r) => {
        const line = contactLine(r);
        const dim = r.bucket === 2;
        return (
          <View
            key={r.customer_id}
            style={[styles.row, isOverdue(r) && styles.rowLate]}
          >
            <View style={styles.rowTop}>
              <Text style={[styles.name, dim && styles.dimText]}>{r.name ?? ''}</Text>
              <Money value={amountOf(r)} />
            </View>
            <StatusChip
              label={isOverdue(r) ? `متأخر ${r.days_late ?? 0} يوم` : sinceText(r) || 'مستحق'}
              tone={isOverdue(r) ? 'overdue' : 'due'}
            />
            {line ? <Text style={[styles.contactLine, dim && styles.dimText]}>{line}</Text> : null}
            {actionsFor(r, false)}
            {errors[r.customer_id ?? ''] ? <Text style={styles.error}>{errors[r.customer_id ?? '']}</Text> : null}
          </View>
        );
      })}
      {sheet}
    </>
  );
}

function ActivityCard() {
  const router = useRouter();
  const activity = useRecentActivity();
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>آخر العمليات</Text>
      {activity.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : activity.isError ? (
        <Text style={styles.error}>تعذّر تحميل العمليات</Text>
      ) : activity.data.length === 0 ? (
        <Text style={styles.empty}>مفيش عمليات النهارده</Text>
      ) : (
        activity.data.map((a: ActivityRow, i) => {
          const t = activityText(a);
          const Icon = a.kind === 'sale' ? FilePlus : Banknote;
          return (
            <Pressable
              key={`${a.at}-${i}`}
              accessibilityRole="button"
              disabled={!a.contract_id}
              onPress={() => router.push(`/contract/${a.contract_id}`)}
              style={styles.activity}
            >
              <View style={[styles.iconDot, { backgroundColor: a.kind === 'sale' ? colors.brandSoft : colors.paidBg }]}>
                <Icon size={size.iconSm} color={a.kind === 'sale' ? colors.brand : colors.paid} />
              </View>
              <View style={styles.activityText}>
                <Text style={styles.cellName}>{t.title}</Text>
                <Text style={styles.sub}>{t.sub}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function SearchField({ onSubmit }: { onSubmit: (term: string) => void }) {
  const [term, setTerm] = useState('');
  return (
    <View style={styles.search}>
      <Search size={size.iconSm} color={colors.inkMuted} />
      <TextInput
        accessibilityLabel="بحث عن عميل"
        placeholder="ابحث عن عميل"
        placeholderTextColor={colors.inkMuted}
        value={term}
        onChangeText={setTerm}
        onSubmitEditing={() => onSubmit(term.trim())}
        returnKeyType="search"
        autoCorrect={false}
        style={styles.searchInput}
      />
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { shopName } = useAuth();
  const kpi = useCollectionsKpi();
  const work = useFollowup();
  const settings = useShopSettings();

  const search = (term: string) =>
    router.push(term ? `/customers?q=${encodeURIComponent(term)}` : '/customers');
  const pickPayment = () => router.push('/customers?pick=payment');

  const headerActions = (
    <View style={styles.headerActions}>
      <SearchField onSubmit={search} />
      <Button title="تسجيل دفعة" onPress={pickPayment} />
    </View>
  );

  const tiles = (
    <View style={desktop ? styles.tilesDesktop : styles.tiles}>
      <View style={desktop ? styles.tileCell : undefined}>
        <Tile label="مستحق الأسبوع ده" value={kpi.data?.expected_this_week ?? 0} tone="due" />
      </View>
      <View style={desktop ? styles.tileCell : undefined}>
        <Tile label="المحصّل الشهر ده" value={kpi.data?.collected_this_month ?? 0} tone="paid" />
      </View>
      <View style={desktop ? styles.tileCell : undefined}>
        <Tile label="إجمالي المتأخرات" value={kpi.data?.overdue_total ?? 0} tone="overdue" />
      </View>
    </View>
  );

  const needCall = (work.data ?? []).filter((r) => r.bucket === 0).length;

  const worklist = (
    <>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>مين لازم أكلمه النهارده</Text>
        {work.data && needCall > 0 ? <Text style={styles.count}>{`${needCall} محتاجين مكالمة`}</Text> : null}
      </View>
      {work.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : work.isError ? (
        <Text style={styles.error}>تعذّر تحميل القائمة</Text>
      ) : (
        <FollowupList
          rows={work.data}
          shopName={shopName ?? ''}
          template={settings.data?.whatsappTemplate ?? null}
        />
      )}
    </>
  );

  return (
    <Screen title={shopName ?? 'الرئيسية'} wide actions={headerActions}>
      <Text style={styles.date}>{headerDateAr()}</Text>
      {desktop ? null : (
        <View style={styles.quick}>
          <Button title="فاتورة جديدة" variant="coin" onPress={() => router.push('/sale/new')} />
          <Button title="تسجيل دفعة" onPress={pickPayment} />
          <Button title="بحث عن عميل" variant="secondary" onPress={() => search('')} />
        </View>
      )}
      {tiles}
      {desktop ? null : <VoicePanel onNavigate={(p) => router.push(p as never)} />}
      {kpi.isError ? <Text style={styles.error}>تعذّر تحميل الأرقام</Text> : null}
      {desktop ? (
        <View style={styles.split}>
          <View style={styles.main}>{worklist}</View>
          <View style={styles.side}>
            <VoicePanel onNavigate={(p) => router.push(p as never)} />
            <ActivityCard />
          </View>
        </View>
      ) : (
        <>
          {worklist}
          <ActivityCard />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  quick: { gap: space[3] },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: size.tapLg,
    minWidth: 280,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
  },
  searchInput: { flex: 1, ...type.body, color: colors.ink, textAlign: 'right', minHeight: size.tapLg },
  tiles: { gap: space[3] },
  tilesDesktop: { flexDirection: 'row', gap: space[4] },
  tileCell: { flex: 1 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  main: { flex: 1, gap: space[4] },
  side: { width: size.sideColumn, gap: space[4] },
  heading: { ...type.title3, color: colors.ink, textAlign: 'right', marginTop: space[2] },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    flexWrap: 'wrap',
  },
  count: { ...type.label, color: colors.overdue, textAlign: 'right' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  // Late rows get a terracotta edge on the start side — attention, not alarm.
  rowLate: { borderStartWidth: 4, borderStartColor: colors.overdue },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  name: { ...type.title3, color: colors.ink, flexShrink: 1 },
  dimText: { color: colors.inkMuted },
  contactLine: { ...type.body, color: colors.paid, textAlign: 'right' },
  followCell: { gap: space[2] },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  compact: {
    minHeight: size.tapMin - space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space[1],
  },
  phoneAction: {
    minHeight: size.tapMin,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space[1],
  },
  iconAction: {
    minWidth: size.tapMin,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  wideAction: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.brand,
    paddingHorizontal: space[4],
  },
  actionDone: { backgroundColor: colors.paidBg, borderColor: colors.paid },
  phoneHint: { ...type.body, color: colors.inkMuted, textAlign: 'right', flexBasis: '100%' },
  actionText: { ...type.label, color: colors.brand },
  compactPrimary: { backgroundColor: colors.brand },
  compactText: { ...type.label },
  cellName: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  cellText: { ...type.body, color: colors.ink, textAlign: 'right' },
  phone: { ...type.body, color: colors.inkMuted, textAlign: 'right', writingDirection: 'ltr' },
  sub: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  activity: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: size.tapMin },
  activityText: { flex: 1 },
  iconDot: {
    width: size.tapMin - space[2],
    height: size.tapMin - space[2],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space[6] },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
});
