import { useLocalSearchParams, useRouter } from 'expo-router';
import { MessageCircle, Phone, StickyNote, type LucideIcon } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCustomer, useCustomerSummary } from '../../../../api/customers';
import { contactLine, useCustomerContacts, useLogContact, type ContactKind, type ContactLog } from '../../../../api/followup';
import { useCustomerInvoices } from '../../../../api/invoices';
import { isOpeningBalance, paymentSpreadText, useCustomerPayments, type CustomerPayment } from '../../../../api/payments';
import { PAYMENT_METHODS } from '../../../../api/sales';
import { formatDateAr, localDateISO, todayISO } from '../../../../lib/date';
import { newId } from '../../../../lib/ids';
import { customerStatusChip, invoiceStatusChip } from '../../../../lib/status';
import { formatEGP } from '../../../../lib/money';
import { whatsappLink } from '../../../../lib/whatsapp';
import { Button } from '../../../../ui/Button';
import { ContactSheet } from '../../../../ui/ContactSheet';
import { DataTable, type Column } from '../../../../ui/DataTable';
import { useIsDesktop } from '../../../../ui/layout';
import { Money } from '../../../../ui/Money';
import { Screen } from '../../../../ui/Screen';
import { StatusChip } from '../../../../ui/StatusChip';
import { Tile } from '../../../../ui/Tile';
import { colors, radius, shadow, size, space, type } from '../../../../ui/theme';
import type { InvoiceRow } from '../../../../api/invoices';

const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const invoiceColumns: Column<InvoiceRow>[] = [
  { key: 'no', title: 'رقم', width: 90, render: (r) => <Text style={styles.cellStrong}>{`#${r.contract_no ?? ''}`}</Text> },
  { key: 'product', title: 'السلعة', render: (r) => <Text style={styles.cell}>{r.product_desc ?? '—'}</Text> },
  { key: 'type', title: 'النوع', width: 100, render: (r) => <Text style={styles.cell}>{r.sale_type === 'cash' ? 'كاش' : 'قسط'}</Text> },
  { key: 'total', title: 'الإجمالي', width: 160, render: (r) => <Money value={Number(r.total_payable ?? 0)} style={styles.money} /> },
  {
    key: 'remaining',
    title: 'الباقي',
    width: 160,
    render: (r) =>
      r.remaining === null ? <Text style={styles.cell}>غير معروف</Text> : <Money value={Number(r.remaining)} style={styles.money} />,
  },
  { key: 'status', title: 'الحالة', width: 140, render: (r) => <StatusChip {...invoiceStatusChip(r.status)} /> },
];

const paymentColumns: Column<CustomerPayment>[] = [
  { key: 'date', title: 'التاريخ', width: 150, render: (p) => <Text style={styles.cell}>{formatDateAr(localDateISO(p.received_at))}</Text> },
  { key: 'amount', title: 'المبلغ', width: 160, render: (p) => <Money value={p.amount} style={styles.money} /> },
  {
    key: 'method',
    title: 'الطريقة',
    width: 180,
    render: (p) => (
      <View style={styles.methodCell}>
        <Text style={styles.cell}>{methodLabel(p.method)}</Text>
        {isOpeningBalance(p.is_opening, p.lines) ? <StatusChip label="رصيد افتتاحي" tone="unknown" /> : null}
      </View>
    ),
  },
  { key: 'spread', title: 'اتوزعت على', render: (p) => <Text style={styles.cell}>{paymentSpreadText(p.lines)}</Text> },
];

const KIND_ICON: Record<ContactKind, LucideIcon> = { call: Phone, whatsapp: MessageCircle, note: StickyNote };
const COLLAPSED = 10;

/** Logging for this customer: ids are reused per kind until a log succeeds, so retries and double presses are idempotent. */
function useContactActions(customerId: string) {
  const log = useLogContact();
  const pending = useRef(new Map<ContactKind, string>());
  const [error, setError] = useState('');

  const send = async (kind: ContactKind, extra?: { note?: string; promiseDate?: string }, fixedId?: string) => {
    let id = fixedId ?? pending.current.get(kind);
    if (!id) {
      id = newId();
      pending.current.set(kind, id);
    }
    try {
      await log.mutateAsync({ id, customerId, kind, ...extra });
      pending.current.delete(kind);
      setError('');
      return true;
    } catch {
      setError('مقدرتش أسجّل التواصل، جرّب تاني');
      return false;
    }
  };

  return { send, error };
}

function ContactLogCard({
  rows,
  loading,
  failed,
  error,
  onCall,
  onNote,
}: {
  rows: ContactLog[];
  loading: boolean;
  failed: boolean;
  error: string;
  onCall: () => void;
  onNote: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, COLLAPSED);
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>سجل التواصل</Text>
      <View style={styles.contactButtons}>
        <View style={styles.flex}>
          <Button title="اتصلت" variant="secondary" onPress={onCall} />
        </View>
        <View style={styles.flex}>
          <Button title="ملاحظة" variant="secondary" onPress={onNote} />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {failed ? <Text style={styles.error}>تعذر تحميل سجل التواصل</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {!loading && !failed && rows.length === 0 ? <Text style={styles.empty}>لسه مفيش تواصل مسجّل</Text> : null}
      {shown.map((c) => {
        const Icon = KIND_ICON[c.kind as ContactKind] ?? StickyNote;
        const line = contactLine(c);
        return (
          <View key={c.id} style={styles.contactItem}>
            <View style={styles.iconDot}>
              <Icon size={size.iconSm} color={colors.brand} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.cellStrong}>{line.title}</Text>
              <Text style={styles.sub}>{line.sub}</Text>
            </View>
          </View>
        );
      })}
      {rows.length > COLLAPSED ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} style={styles.linkBtn}>
          <Text style={styles.link}>{all ? 'عرض أقل' : 'عرض الكل'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function CustomerFile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const desktop = useIsDesktop();
  const customer = useCustomer(id);
  const summary = useCustomerSummary(id);
  const invoices = useCustomerInvoices(id);
  const payments = useCustomerPayments(id);
  const contacts = useCustomerContacts(id);
  const { send, error: contactError } = useContactActions(id);
  const [noteOpen, setNoteOpen] = useState(false);
  // One id per note-sheet session: retries of the same sheet reuse it, a new sheet gets a new one.
  const noteId = useRef('');
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/customers'));

  if (customer.isLoading || summary.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (customer.error || summary.error || !customer.data) {
    return (
      <Screen title="ملف العميل" onBack={goBack}>
        <Text style={styles.error}>{customer.error || summary.error ? 'تعذر تحميل العميل' : 'العميل غير موجود'}</Text>
      </Screen>
    );
  }
  const c = customer.data;
  const s = summary.data;
  const remaining = Number(s?.remaining_total ?? 0);
  const wa = whatsappLink(c.phone, '');
  const nextDue =
    s?.next_due_date && s.next_due_amount != null
      ? `${formatEGP(Number(s.next_due_amount))} · ${formatDateAr(s.next_due_date)}`
      : '—';

  const actions = (
    <View style={desktop ? styles.actionsRow : styles.actionsCol}>
      {remaining > 0 ? <Button title="تسجيل دفعة" onPress={() => router.push(`/payment/new?customerId=${id}`)} /> : null}
      {wa ? (
        <Button
          title="واتساب"
          variant="secondary"
          onPress={() => {
            // Open synchronously on the press (popup blockers reject window.open after an await), log in parallel.
            void Linking.openURL(wa);
            void send('whatsapp');
          }}
        />
      ) : null}
    </View>
  );

  const details = (
    <View style={styles.card}>
      <Text style={styles.heading}>البيانات</Text>
      <InfoRow label="موبايل" value={c.phone} />
      <InfoRow label="رقم قومي" value={c.national_id} />
      <InfoRow label="عنوان" value={c.address} />
      {c.notes ? (
        <View style={styles.notes}>
          <Text style={styles.label}>ملاحظات</Text>
          <Text style={styles.noteText}>{c.notes}</Text>
        </View>
      ) : null}
      <Button title="تعديل" variant="secondary" onPress={() => router.push(`/customer/${id}/edit`)} />
    </View>
  );

  const contactCard = (
    <ContactLogCard
      rows={contacts.data ?? []}
      loading={contacts.isLoading}
      failed={!!contacts.error}
      error={contactError}
      onCall={() => void send('call')}
      onNote={() => {
        noteId.current = newId();
        setNoteOpen(true);
      }}
    />
  );

  const main = (
    <View style={styles.main}>
      <View style={styles.sectionHead}>
        <Text style={styles.heading}>الفواتير</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/sale/new?customerId=${id}`)} style={styles.linkBtn}>
          <Text style={styles.link}>فاتورة جديدة ليه</Text>
        </Pressable>
      </View>
      {invoices.error ? <Text style={styles.error}>تعذر تحميل الفواتير</Text> : null}
      <DataTable
        columns={invoiceColumns}
        rows={invoices.data ?? []}
        keyOf={(r) => r.contract_id ?? ''}
        onRowPress={(r) => router.push(`/contract/${r.contract_id}`)}
        empty={<Text style={styles.empty}>{invoices.isLoading ? 'جاري التحميل…' : 'مفيش فواتير لسه'}</Text>}
      />

      <Text style={styles.heading}>سجل الدفعات</Text>
      {payments.error ? <Text style={styles.error}>تعذر تحميل الدفعات</Text> : null}
      <DataTable
        columns={paymentColumns}
        rows={payments.data ?? []}
        keyOf={(p) => p.id}
        empty={<Text style={styles.empty}>{payments.isLoading ? 'جاري التحميل…' : 'مفيش دفعات لسه'}</Text>}
      />
    </View>
  );

  const chip = customerStatusChip(s?.status ?? null);

  return (
    <Screen title={c.name} onBack={desktop ? undefined : goBack} actions={desktop ? actions : undefined}>
      {desktop ? (
        <Pressable accessibilityRole="link" onPress={goBack} style={styles.linkBtn}>
          <Text style={styles.crumb}>{`العملاء  ›  ${c.name}`}</Text>
        </Pressable>
      ) : null}
      <View style={styles.subtitle}>
        <StatusChip {...chip} />
        <Text style={styles.phone}>{c.phone}</Text>
        {c.blacklist_flag ? <StatusChip label="قائمة سوداء" tone="error" /> : null}
      </View>
      {desktop ? null : actions}

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Tile label="دفع لحد دلوقتي" value={Number(s?.paid_total ?? 0)} tone="paid" />
        </View>
        <View style={styles.tile}>
          <Tile label="الباقي عليه" value={remaining} tone="due" />
        </View>
        <View style={styles.tile}>
          <Tile label="متأخر عليه" value={Number(s?.overdue_amount ?? 0)} tone="overdue" />
        </View>
        <View style={styles.tile}>
          <Tile label="القسط الجاي" value={nextDue} tone="neutral" />
        </View>
      </View>

      {desktop ? (
        <View style={styles.columns}>
          {main}
          <View style={styles.side}>
            {details}
            {contactCard}
          </View>
        </View>
      ) : (
        <>
          {main}
          {details}
          {contactCard}
        </>
      )}
      <ContactSheet
        visible={noteOpen}
        customerName={c.name}
        today={todayISO()}
        onClose={() => setNoteOpen(false)}
        onSave={async ({ note, promiseDate }) => {
          const ok = await send('note', { note, promiseDate }, noteId.current);
          if (ok) setNoteOpen(false);
          return ok;
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  columns: { flexDirection: 'row', gap: space[6], alignItems: 'flex-start' },
  main: { flex: 1, gap: space[4], minWidth: 0 },
  side: { width: size.sideColumn, gap: space[4] },
  flex: { flex: 1 },
  contactButtons: { flexDirection: 'row', gap: space[2] },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  iconDot: {
    width: size.tapMin - space[2],
    height: size.tapMin - space[2],
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sub: { ...type.body, color: colors.inkMuted, textAlign: 'right' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  tile: { flexGrow: 1, flexBasis: 160 },
  subtitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] },
  phone: { ...type.body, color: colors.inkMuted, writingDirection: 'ltr' },
  actionsRow: { flexDirection: 'row', gap: space[3] },
  actionsCol: { gap: space[3] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[4] },
  label: { ...type.body, color: colors.inkMuted },
  value: { ...type.bodyStrong, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  notes: { backgroundColor: colors.coinSoft, borderRadius: radius.md, padding: space[3], gap: space[1] },
  noteText: { ...type.body, color: colors.ink, textAlign: 'right' },
  heading: { ...type.title3, color: colors.ink, textAlign: 'right' },
  link: { ...type.label, color: colors.brand },
  linkBtn: { minHeight: size.tapMin, justifyContent: 'center' },
  crumb: { ...type.label, color: colors.inkMuted, textAlign: 'right' },
  cell: { ...type.body, color: colors.ink, textAlign: 'right' },
  cellStrong: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  money: { ...type.body },
  methodCell: { gap: space[1], alignItems: 'flex-start' },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center' },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
});
