import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useCustomerContracts } from '../../../api/contracts';
import { openInstallmentContracts, useRecordPayment } from '../../../api/payments';
import { idForAttempt } from '../../../api/sales';
import { newId } from '../../../lib/ids';
import { PaymentForm } from '../../../ui/PaymentForm';
import { Screen } from '../../../ui/Screen';
import { colors, font } from '../../../ui/theme';

export default function NewPayment() {
  const router = useRouter();
  const { customerId = '', contractId } = useLocalSearchParams<{ customerId?: string; contractId?: string }>();
  const record = useRecordPayment();
  // Same id for a pure retry; a new one once the inputs changed after an attempt.
  const attemptRef = useRef<{ id: string; sig: string | null }>({ id: newId(), sig: null });
  const contracts = useCustomerContracts(customerId);
  const open = useMemo(() => openInstallmentContracts(contracts.data ?? [], contractId), [contracts.data, contractId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(contractId ? `/contract/${contractId}` : `/customers/${customerId}`);
  };

  return (
    <Screen title="تسجيل دفعة" onBack={goBack}>
      {contracts.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {contracts.error ? <Text style={styles.error}>تعذر تحميل العقود</Text> : null}
      {contracts.data && open.length === 0 ? <Text style={styles.error}>مفيش عقود مفتوحة للدفع</Text> : null}
      {open.length > 0 ? (
        <PaymentForm
          contracts={open.map((c) => ({
            contractId: c.contract_id as string,
            title: `${c.product_desc ?? ''} (عقد ${c.contract_no})`,
            remaining: Number(c.remaining),
          }))}
          submitLabel="حفظ الدفعة"
          loading={record.isPending}
          onSubmit={async ({ method, lines, sig }) => {
            attemptRef.current = idForAttempt(attemptRef.current, sig, newId);
            await record.mutateAsync({ id: attemptRef.current.id, customerId, method, lines });
            router.replace(contractId ? `/contract/${contractId}` : `/customers/${customerId}`);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: font.body, textAlign: 'center' },
});
