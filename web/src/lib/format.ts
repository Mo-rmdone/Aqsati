// Display-only formatters. The frontend never calculates money — all monetary
// math happens in Postgres functions (see supabase/migrations). These helpers
// only format values already computed by the database, for ar-EG / Africa/Cairo.

export const egp = (n: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  }).format(n);

export const arDate = (d: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "Africa/Cairo",
  }).format(new Date(d));
