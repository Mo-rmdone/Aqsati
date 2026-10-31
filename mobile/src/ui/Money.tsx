import { Text, type TextStyle } from 'react-native';

import { formatEGP } from '../lib/money';
import { colors } from './theme';

export function Money({ value, style }: { value: number; style?: TextStyle }) {
  // Latin digits inside RTL text: keep the figure left-to-right so "ج.م" does not reorder it.
  return <Text style={[{ color: colors.text, writingDirection: 'ltr' }, style]}>{formatEGP(value)}</Text>;
}
