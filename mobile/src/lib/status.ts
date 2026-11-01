import type { Tone } from '../ui/StatusChip';

export type StatusChipProps = { label: string; tone: Tone };

const UNKNOWN: StatusChipProps = { label: 'غير معروف', tone: 'unknown' };

export function customerStatusChip(status: string | null): StatusChipProps {
  switch (status) {
    case 'late_many':
      return { label: 'متأخر كتير', tone: 'overdue' };
    case 'late':
      return { label: 'متأخر', tone: 'overdue' };
    case 'regular':
      return { label: 'منتظم', tone: 'paid' };
    case 'done':
      return { label: 'خلّص', tone: 'paid' };
    default:
      return UNKNOWN;
  }
}

export function invoiceStatusChip(status: string | null): StatusChipProps {
  switch (status) {
    case 'late':
      return { label: 'متأخر', tone: 'overdue' };
    case 'open':
      return { label: 'جاري', tone: 'due' };
    case 'settled':
      return { label: 'خلّص', tone: 'paid' };
    default:
      return UNKNOWN;
  }
}
