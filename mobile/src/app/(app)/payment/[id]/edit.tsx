import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useCustomerContracts } from '../../../../api/contracts';
import { isPaymentEditable, usePayment, useUpdatePayment } from '../../../../api/payments';
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
  const ready = data && contracts.data;
  const editable = data ? isPaymentEditable(data.lines) : false;

  return (
    <Screen title="تعديل دفعة" onBack={goBack}>
      {payment.isLoading || (data && contracts.isLoading) ? <ActivityIndicator color={colors.primary} /> : null}
      {payment.error || contracts.error ? <Text style={styles.error}>تعذر تحميل الدفعة</Text> : null}
      {payment.data === null ? <Text style={styles.error}>الدفعة غير موجودة</Text> : null}
      {data && !editable ? <Text style={styles.error}>الدفعة دي مش على أقساط ومش بتتعدل من هنا</Text> : null}
      {ready && editable ? (
        <PaymentForm
          contracts={data.lines.map((l) => {
            const row = contracts.data.find((c) => c.contract_id === l.contract_id);
            return {
              contractId: l.contract_id,
              title: `${row?.product_desc ?? ''} (عقد ${row?.contract_no ?? ''})`,
              // this payment's own amount is released when it is edited
              remaining: Number(row?.remaining ?? 0) + Number(l.amount),
            };
          })}
          initialAmounts={Object.fromEntries(data.lines.map((l) => [l.contract_id, String(Number(l.amount))]))}
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
