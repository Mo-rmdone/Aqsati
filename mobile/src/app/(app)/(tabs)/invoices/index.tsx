import { StyleSheet, Text } from 'react-native';

import { Screen } from '../../../../ui/Screen';
import { colors, space, type } from '../../../../ui/theme';

// Placeholder until the invoice list lands.
export default function Invoices() {
  return (
    <Screen title="الفواتير">
      <Text style={styles.soon}>قريب</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  soon: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: space[6] },
});
