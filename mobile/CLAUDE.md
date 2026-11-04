## Design (Notah | نوتة)

Source of truth: `/DESIGN.md` (v2, "calm ledger, large print": `DESIGN_SYSTEM_V1.md` adapted for older shop owners). The logo files are still in `docs/brand/design-system/`; its tokens.json is the old v1 palette and is superseded.

- Use `src/ui/theme.ts` only. No hand-written hex or px values in screens.
- RTL first: `flexDirection: 'row'` follows the writing direction (don't use `row-reverse` for RTL); use start/end, not left/right. Back button = chevron-right.
- Touch targets ≥ 48; buttons and inputs 56; body 17, text ≥ 16 (status chips 15, always with an icon).
- Money: "1,234.50 ج.م", Latin digits, two decimals (`formatEGP` / `<Money>`).
- Money statuses (مدفوع / جزئي / مستحق / متأخر / غير معروف): icon + word + tinted fill and border via `<StatusChip tone=…>`. Overdue is burnt orange, never red.
- Red (`colors.error`) is for system errors and destructive actions only. Icons: Lucide only (`lucide-react-native`), always beside a word.
- One blue action (`colors.brand`) per screen; other buttons are `secondary` (white, gray border, black text).
- Black (`colors.inverse`) marks "where you are": the active sidebar item and selected chips. Nothing else is black-filled.
- Page = gray tray (`colors.paper`); content groups = white cards with a 1px `colors.line` border.
- Font: IBM Plex Sans Arabic via `type.*` styles (loaded in `src/ui/fonts.ts`).
- Copy in Egyptian Arabic; no "من فضلك" or "تم بنجاح".
- `colors.coin` names the "+ فاتورة" action; in v2 it is the action blue.

## Desktop (v2)

- Use `useIsDesktop()` (`src/ui/layout.ts`) for the ≥ 1024 switch; below it the phone layout with bottom tabs applies.
- Lists use `DataTable` on desktop and rows on phone.
- Content max width is `size.contentMax`; never hard-code it.
- `Screen actions` render on desktop only, so phone screens put their buttons in the body.
- Text ≥ 16 everywhere (the 15px chip is the only exception).
- Never put tests under `src/app/` (Expo Router would treat them as routes).
- The Cairo day comes from `todayISO()` (`src/lib/date.ts`), never `new Date().toISOString()`.
- On web, open external links (WhatsApp, tel:) synchronously in the press handler, before any await, or the browser blocks the popup. Log or save in parallel.
