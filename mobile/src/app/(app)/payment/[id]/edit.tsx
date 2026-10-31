import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useCustomerContracts } from '../../../../api/contracts';
import { editableContracts, isPaymentEditable, usePayment, useUpdatePayment } from '../../../../api/payments';
import type { PaymentMethod } from '../../../../api/sales';
import { PaymentForm } from '../../../../ui/PaymentForm';
import { Screen } from '../../../../ui/Screen';
import { colors, font } from '../../../../ui/theme';

export default function EditPayment() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const payment = usePayment(id);
  const customerId = payment.data?.payment.customer_id ?? '';
  const contracts = useCustomerContracts(customerId);
  const update = useUpdatePayment();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(customerId ? `/customers/${customerId}` : '/customers'));

  const data = payment.data;
  const editable = data ? isPaymentEditable(data.lines) : false;
  let candidates: ReturnType<typeof editableContracts> | null = null;
  if (data && contracts.data) {
    try {
      candidates = editableContracts(data.lines, contracts.data);
    } catch {
      candidates = null;
    }
  }
  const missing = !!data && !!contracts.data && !candidates;
  const initialAmounts: Record<string, string> = {};
  for (const l of data?.lines ?? []) {
    initialAmounts[l.contract_id] = String((Number(initialAmounts[l.contract_id] ?? 0) + Number(l.amount)).toFixed(2));
  }

  return (
    <Screen title="تعديل دفعة" onBack={goBack}>
      {payment.isLoading || (data && contracts.isLoading) ? <ActivityIndicator color={colors.primary} /> : null}
      {payment.error || contracts.error ? <Text style={styles.error}>تعذر تحميل الدفعة</Text> : null}
      {payment.data === null ? <Text style={styles.error}>الدفعة غير موجودة</Text> : null}
      {data && !editable ? <Text style={styles.error}>الدفعة دي مش على أقساط ومش بتتعدل من هنا</Text> : null}
      {missing ? <Text style={styles.error}>تعذر تحميل عقود الدفعة</Text> : null}
      {data && candidates && editable ? (
        <PaymentForm
          contracts={candidates}
          initialAmounts={initialAmounts}
          initialMethod={data.payment.method as PaymentMethod}
          submitLabel="حفظ التعديل"
          loading={update.isPending}
          onSubmit={async ({ method, lines }) => {
            await update.mutateAsync({
              id,
              customerId,
              method,
              lines,
              previousContractIds: data.lines.map((l) => l.contract_id),
            });
            goBack();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: font.body, textAlign: 'center' },
});
