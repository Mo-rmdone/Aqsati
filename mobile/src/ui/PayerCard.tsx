import { StyleSheet, Text, View } from 'react-native';

import { formatEGP } from '../lib/money';
import { border, colors, radius, shadow, space, type } from './theme';

/** Who is paying, shown above the payment form so money never lands on the wrong customer. */
export function PayerCard({ name, phone, owed }: { name: string; phone?: string | null; owed: number }) {
  return (
    <View style={styles.card} accessibilityLabel={`الدفعة من ${name}`}>
      <Text style={styles.caption}>الدفعة من</Text>
      <Text style={styles.name}>{name}</Text>
      {phone ? <Text style={styles.phone}>{phone}</Text> : null}
      <Text style={styles.owed}>{`عليه ${formatEGP(owed)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.hairline,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[1],
    ...shadow.card,
  },
  caption: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
  name: { ...type.title3, color: colors.ink, textAlign: 'right' },
  phone: { ...type.body, color: colors.inkMuted, textAlign: 'right', writingDirection: 'ltr' },
  owed: { ...type.moneyMd, color: colors.ink, textAlign: 'right' },
});
