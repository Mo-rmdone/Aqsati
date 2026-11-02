/**
 * Arabic text normalization for fuzzy matching of spoken names and product hints:
 * strips diacritics/tatweel, unifies alef forms, ة->ه, ى->ي, lowercases, collapses spaces.
 */
export function normalizeAr(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length >= 5 && w.startsWith('ال') ? w.slice(2) : w))
    .join(' ');
}

/**
 * Turns an already-escaped search term into an ilike pattern that tolerates the
 * spelling variants normalizeAr unifies: alef forms, ة/ه, ى/ي each become `_`.
 */
export function fuzzyNamePattern(escaped: string): string {
  return `%${escaped.replace(/[اأإآةهىي]/g, '_')}%`;
}

/** Fuzzy pattern only for terms of 3+ normalized chars; shorter terms stay a plain contains. */
export function namePattern(raw: string, escaped: string): string {
  return normalizeAr(raw).length >= 3 ? fuzzyNamePattern(escaped) : `%${escaped}%`;
}

/** Keeps rows whose name contains the term after normalization, then caps to `limit`. */
export function filterNameRows<T extends { name: string }>(rows: T[], term: string, limit: number): T[] {
  return rows.filter((r) => containsAr(r.name, term)).slice(0, limit);
}

/** True when the normalized haystack contains the normalized needle (empty needle -> false). */
export function containsAr(haystack: string, needle: string): boolean {
  const n = normalizeAr(needle);
  return n !== '' && normalizeAr(haystack).includes(n);
}
