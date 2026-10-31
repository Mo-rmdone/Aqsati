import { Redirect } from 'expo-router';

// Placeholder for the "+ فاتورة" tab button (see _layout.tsx); never rendered normally.
export default function SaleTab() {
  return <Redirect href="/sale/new" />;
}
