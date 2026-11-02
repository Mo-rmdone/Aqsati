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

/** True when the normalized haystack contains the normalized needle (empty needle -> false). */
export function containsAr(haystack: string, needle: string): boolean {
  const n = normalizeAr(needle);
  return n !== '' && normalizeAr(haystack).includes(n);
}
