# DESIGN.md — Notah | نوتة (v2, "calm ledger, large print")

Source: `DESIGN_SYSTEM_V1.md` (a neutral CRM system), adapted for its real users: Egyptian shop owners, many aged 50+, working in Arabic RTL on a phone in shop light and sometimes on a computer.

**The rule of the adaptation:** keep V1's character and enlarge everything a hand or an ageing eye has to hit or read. The character is:
- calm neutrals
- one blue action color
- black for "where am I"
- gray trays holding white cards
- hairline borders and faint shadows

Code lives in `mobile/src/ui/theme.ts`. Screens never hard-code hex or px values.

## 1. Principles

1. **Readable first.** Text is never under 15px; body is 17px. Secondary text is dark gray, never light gray.
2. **One action color.** Blue (`brand`) is used only for the main action and links. Each screen has one primary button; the rest are white bordered buttons.
3. **Black = where you are.** The active sidebar item and the selected filter chip are solid black with white text. Nothing else is black-filled.
4. **Gray tray, white cards.** The page is light gray and content groups are white cards with a 1px border. One level of nesting only.
5. **Status is never color alone.** Every status shows an icon + a word + a color, with a tinted border. Overdue is burnt orange, never red. Red is only for system errors and destructive actions.
6. **Words beside icons.** Buttons and navigation always show a label. Icon-only controls get an accessible label and a ≥ 48 hit area.
7. **Big targets.** Buttons and inputs are 56 tall; anything tappable is ≥ 48.

## 2. Color (light)

| Token | Value | Use |
|---|---|---|
| `paper` | `#F4F5F7` | Page background (the tray) |
| `surface` | `#FFFFFF` | Cards, inputs, secondary buttons |
| `surfaceSunken` | `#ECEEF1` | Table header row, inset blocks, hover |
| `line` | `#DFE2E6` | Card borders, dividers |
| `lineStrong` | `#8B9099` | Input and secondary-button borders (≥ 3:1 on white) |
| `ink` | `#16181D` | Titles, values, body |
| `inkMuted` | `#4B5059` | Labels, helper text (≈ 8:1 on white) |
| `inverse` / `onInverse` | `#16181D` / `#FFFFFF` | Active nav, selected chip |
| `brand` | `#1F4FD8` | Primary action, links, focus (white text ≈ 6:1) |
| `brandStrong` | `#173DAB` | Pressed primary |
| `brandSoft` | `#EAF0FF` | Pressed secondary, selection tint |
| `coin` | = `brand` | The "+ فاتورة" action (kept as a name so call sites don't change) |
| `coinSoft` | `#FFF5D6` | Note highlight (customer notes) |

### Statuses: text / fill / border

| Tone | Text | Fill | Border | Icon |
|---|---|---|---|---|
| paid (مدفوع، خلّص) | `#11653C` | `#E6F5EC` | `#B9E2C8` | Check |
| partial (جزئي) | `#1F4FD8` | `#EAF0FF` | `#C6D4FA` | Contrast |
| due (مستحق) | `#7A4A00` | `#FFF3DC` | `#F3D9A4` | Clock |
| overdue (متأخر) | `#A33A08` | `#FFEDE3` | `#F6C6AB` | CalendarX |
| unknown | `#4B5059` | `#ECEEF1` | `#D3D7DD` | CircleHelp |
| error | `#B42318` | `#FDECEA` | `#F5C2BC` | Ban |

All status text is ≥ 4.5:1 on its fill.

## 3. Type

The family is IBM Plex Sans Arabic: real Arabic letterforms with open counters, legible at small sizes. V1's Poppins has no Arabic, so it is not used.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| `title1` | 30 / 42 | Bold | Rare page hero |
| `title2` | 24 / 36 | Bold | Page title |
| `title3` | 20 / 30 | SemiBold | Section / card title |
| `body` | 17 / 30 | Regular | Everything readable |
| `bodyStrong` | 17 / 30 | SemiBold | Names, key values |
| `label` | 17 / 26 | SemiBold | Field labels, button text |
| `helper` | 16 / 26 | Regular | Helper text, table headers |
| `chip` | 15 / 22 | SemiBold | Status chips (always with an icon) |
| `displayMoney` | 40 / 52 | Bold | The one big number |
| `moneyLg` | 24 / 32 | Bold | Tile values |
| `moneyMd` | 20 / 30 | SemiBold | Row amounts |

The floor is 15px (chips only); everything else is ≥ 16. Money is always `1,234.50 ج.م` with Latin digits.

## 4. Space, shape, depth

- **Spacing:** 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48. Page padding is 16 on the phone and 32 on the computer.
- **Radius:**
  - `sm` 6 (chips)
  - `md` 10 (buttons, inputs, nav items)
  - `lg` 12 (cards)
  - `xl` 16 (sheets)
  - `pill` for avatars and the round + button
- **Borders:** 1px `line` on cards; 1.5px `lineStrong` on inputs and secondary buttons; 2px `brand` on focus.
- **Shadows:** `card` is a faint 0 1 2 lift. `fab` is a soft 0 6 16, used only for the round + button.

## 5. Components

- **Button**
  - **primary:** blue fill, white label.
  - **secondary:** white fill, 1.5px `lineStrong` border, `ink` label, `surfaceSunken` when pressed.
  - **danger:** red fill.
  - Every variant is 56 tall with `md` radius.
- **Field:** 17px label above, 8px gap, 56 tall box with a 1.5px `lineStrong` border. Focus is a 2px `brand` border; error is a 2px `error` border plus an icon and text.
- **StatusChip:** `sm` radius, tinted fill, 1px tinted border, a 16px icon and a 15px word.
- **FilterChips / Chip:** 48 tall pills. Unselected is white with a `line` border; selected is a black fill with white text (rule 3).
- **Tile:** a white card with a colored dot, a 16px `inkMuted` label and a 24px value. Only overdue values are tinted.
- **DataTable:**
  - A white card with a gray header row (16px SemiBold `inkMuted`).
  - Rows are ≥ 56 tall with hairline dividers. V1 drops the dividers; we keep them because they help the eye track a wide row.
  - Hover (web) fills the row with `surfaceSunken`; pressed fills it with `brandSoft`.
- **Sidebar (computer):**
  - Brand row: a black rounded mark with a white "ن" and the black word "نوتة".
  - "+ فاتورة جديدة" is the primary blue button.
  - Nav items are 48 tall with an icon and a 17px label. The active item is a black pill with white text.
- **Tab bar (phone):** the active item is `ink`, inactive items are `inkMuted`, and the center + is a blue circle.
- **Screen:** a gray page. The title is `title2`. The back control is a chevron plus the word "رجوع" in `brand`.

## 6. From V1: taken and left out

**Taken:**
- neutral palette with one blue action
- black active nav
- gray trays with white cards
- hairline borders and faint shadows
- tinted status pills
- toolbar with filters on one side and actions on the other
- title with subtitle

**Changed for older users:** sizes (14 → 17 body, 40 → 56 controls), contrast (lighter grays → `#4B5059`), status colors (darker text), and words beside icons.

**Left out:**
- Poppins
- left-to-right layout
- kanban boards
- avatars
- the rich-text editor
- the upsell card
- hover-only affordances
- 10–13px text
- 28px icon buttons
