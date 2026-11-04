import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useCustomerContracts } from '../../../api/contracts';
import { useCustomer } from '../../../api/customers';
import { payableInOrder, useRecordPayment } from '../../../api/payments';
import { useAttempt } from '../../../lib/attempt';
import { parsePaymentPrefill, prefillAmounts } from '../../../lib/prefill';
import { totalRemaining } from '../../../lib/split';
import { PayerCard } from '../../../ui/PayerCard';
import { PaymentDone } from '../../../ui/PaymentDone';
import { PaymentForm } from '../../../ui/PaymentForm';
import { Screen } from '../../../ui/Screen';
import { colors, type } from '../../../ui/theme';

export default function NewPayment() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string; contractId?: string; amount?: string; method?: string }>();
  const customerId = (Array.isArray(params.customerId) ? params.customerId[0] : params.customerId) ?? '';
  const contractId = Array.isArray(params.contractId) ? params.contractId[0] : params.contractId;
  // Seeds the form once; later param changes never override what the user typed.
  const prefill = useRef(parsePaymentPrefill(params)).current;
  const record = useRecordPayment();
  // Same id for a pure retry; a new one once the inputs changed after an attempt.
  const attempt = useAttempt();
  const customer = useCustomer(customerId);
  const contracts = useCustomerContracts(customerId);
  // The chosen invoice first, then the rest oldest first: the order the money fills them.
  const open = useMemo(() => payableInOrder(contracts.data ?? [], contractId), [contracts.data, contractId]);
  const formContracts = open.map((c) => ({
    contractId: c.contract_id as string,
    title: `${c.product_desc || 'فاتورة'} · فاتورة رقم ${c.contract_no}`,
    remaining: Number(c.remaining),
  }));

  // Set once the payment is saved: the screen then offers the WhatsApp statement instead of leaving.
  const [done, setDone] = useState<{ paymentId: string; paidNow: number } | null>(null);
  const target = (contractId ? `/contract/${contractId}` : `/customers/${customerId}`) as Href;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(target);
  };

  if (done !== null) {
    return (
      <Screen title="تسجيل دفعة" onBack={() => router.replace(target)}>
        <PaymentDone
          customerId={customerId}
          paidNow={done.paidNow}
          onDone={() => router.replace(target)}
          onEdit={() => router.replace(`/payment/${done.paymentId}/edit` as Href)}
        />
      </Screen>
    );
  }

  return (
    <Screen title="تسجيل دفعة" onBack={goBack}>
      {customer.data ? (
        <PayerCard name={customer.data.name} phone={customer.data.phone} owed={totalRemaining(formContracts)} />
      ) : null}
      {contracts.isLoading || customer.isLoading ? <ActivityIndicator color={colors.brand} accessibilityLabel="بيحمّل" /> : null}
      {contracts.error ? <Text style={styles.error}>مقدرتش أحمّل الفواتير، جرّب تاني</Text> : null}
      {contracts.data && open.length === 0 ? <Text style={styles.error}>مفيش فواتير مفتوحة عليها فلوس</Text> : null}
      {open.length > 0 ? (
        <PaymentForm
          key={`${customerId}:${contractId ?? ''}`}
          contracts={formContracts}
          initialAmounts={prefillAmounts(prefill)}
          initialTotal={prefill.amount !== undefined ? String(prefill.amount) : undefined}
          initialMethod={prefill.method}
          submitLabel="سجّل الدفعة"
          payerName={customer.data?.name}
          loading={record.isPending}
          onSubmit={async ({ method, lines, sig }) => {
            const paymentId = await record.mutateAsync({ id: attempt.idFor(sig), customerId, method, lines });
            attempt.reset();
            setDone({ paymentId, paidNow: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100 });
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { ...type.body, color: colors.error, textAlign: 'center' },
});
