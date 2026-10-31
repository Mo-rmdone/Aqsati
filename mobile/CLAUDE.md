## Design (Notah | نوتة)

Source of truth: `docs/brand/design-system/` (tokens.json, CLAUDE.md, logo files).

- Use `src/ui/theme.ts` only. No hand-written hex or px values in screens.
- RTL first: `flexDirection: 'row'` follows the writing direction (don't use `row-reverse` for RTL); use start/end, not left/right. Back button = chevron-right.
- Touch targets ≥ 48; buttons and inputs 56; text ≥ 16 (status chips 14, always with an icon).
- Money: "1,234.50 ج.م", Latin digits, two decimals (`formatEGP` / `<Money>`).
- Money statuses (مدفوع / جزئي / مستحق / متأخر / غير معروف): icon + word + color via `<StatusChip tone=…>`. Overdue is terracotta, never red.
- Red (`colors.error`) is for system errors only. Icons: Lucide only (`lucide-react-native`).
- Font: IBM Plex Sans Arabic via `type.*` styles (loaded in `src/ui/fonts.ts`).
- Copy in Egyptian Arabic; no "من فضلك" or "تم بنجاح".
- Coin amber (`colors.coin`) is reserved for the center "+ فاتورة" action and brand highlights.
