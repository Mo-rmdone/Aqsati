import { useRef } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useCustomerContracts } from '../api/contracts';
import { useCustomerSummary } from '../api/customers';
import { useLogContact } from '../api/followup';
import { useShopSettings } from '../api/settings';
import { newId } from '../lib/ids';
import { formatEGP } from '../lib/money';
import { accountSummaryMessage, whatsappLink } from '../lib/whatsapp';
import { Button } from './Button';
import { colors, space, type } from './theme';

/**
 * Shown after a payment is saved. The WhatsApp button stays disabled until the customer,
 * invoices (refetched after the payment) and shop name have all settled, so the link can be
 * opened synchronously in the press handler.
 */
export function PaymentDone({
  customerId,
  paidNow,
  onDone,
}: {
  customerId: string;
  paidNow: number;
  onDone: () => void;
}) {
  const summary = useCustomerSummary(customerId);
  const contracts = useCustomerContracts(customerId);
  const shop = useShopSettings();
  const log = useLogContact();
  // One id per screen visit: a double press logs once.
  const logId = useRef(newId()).current;

  const noCustomer = summary.isSuccess && !summary.data;
  const failed = summary.isError || noCustomer || contracts.isError || shop.isError;
  const ready =
    summary.isSuccess &&
    !!summary.data &&
    !summary.isFetching &&
    contracts.isSuccess &&
    !contracts.isFetching &&
    shop.isSuccess &&
    !!shop.data;

  const link =
    ready && summary.data && contracts.data && shop.data
      ? whatsappLink(
          summary.data.phone ?? '',
          accountSummaryMessage({
            customer: summary.data.name ?? '',
            paidNow,
            totalPaid: Number(summary.data.paid_total ?? 0),
            invoices: contracts.data
              .filter((c) => c.remaining !== null)
              .map((c) => ({
                title: c.product_desc || `فاتورة ${c.contract_no}`,
                remaining: Number(c.remaining),
              })),
            shop: shop.data.name,
          }),
        )
      : null;
  const badPhone = ready && link === null;

  const send = () => {
    if (!link) return;
    // Open synchronously (popup blockers reject window.open after an await); log in parallel.
    void Linking.openURL(link);
    void log.mutateAsync({ id: logId, customerId, kind: 'whatsapp' }).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{`اتسجلت الدفعة: ${formatEGP(paidNow)}`}</Text>
      {badPhone ? (
        <Text style={styles.helper}>رقم العميل مش موبايل مصري</Text>
      ) : (
        <Button
          title="ابعت كشف حسابه على واتساب"
          onPress={send}
          disabled={!link}
          loading={!ready && !failed}
        />
      )}
      {failed ? <Text style={styles.helper}>مقدرتش أحمّل بيانات العميل</Text> : null}
      <Button title="تمام" variant="secondary" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[4] },
  title: { ...type.title2, color: colors.paid, textAlign: 'center' },
  helper: { ...type.body, color: colors.muted, textAlign: 'center' },
});
