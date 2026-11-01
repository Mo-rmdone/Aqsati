export type CustomersParams = { q?: string | string[]; pick?: string | string[] };

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Route params of the Customers tab -> screen mode. */
export function parseCustomersParams(p: CustomersParams): { q: string; picking: boolean } {
  return { q: first(p.q) ?? '', picking: first(p.pick) === 'payment' };
}

/** Where a tapped customer row goes; in pick mode it also says to clear the sticky pick param. */
export function customerRowTarget(picking: boolean, id: string | null): { path: string; clearPick: boolean } {
  return picking
    ? { path: `/payment/new?customerId=${id}`, clearPick: true }
    : { path: `/customers/${id}`, clearPick: false };
}
