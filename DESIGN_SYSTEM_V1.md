# DESIGN_SYSTEM.md

> A visual design system reverse-engineered from five screenshots of a B2B CRM web app: a contacts table view, a contacts kanban view, an empty "create record" form, a filled "create record" form, and an "edit record" form with a success banner.
>
> **How to read this document**
> - **Observed** = directly visible in the screenshots.
> - **Estimated** = measured or color-picked from compressed screenshots. Expect ±2px and ±1–3% in color.
> - **Recommended** = an inference or extension that is not shown in the reference.
>
> All pixel values assume the app frame is rendered at about 1:1. The frame is about 1354px wide inside a presentation canvas.

---

## 1. Design System Overview

| Aspect | Summary |
|---|---|
| Product type | Desktop SaaS dashboard (CRM / records management) |
| Style family | Neutral, monochrome-first, "soft utility" UI with one saturated accent |
| Density | Medium. Data rows are about 52px tall; forms have comfortable spacing |
| Color strategy | ~90% grayscale, one electric-blue action color, and a set of pastel semantic status pills |
| Shape language | Small, consistent radii (6–12px), hairline 1px borders, nearly flat surfaces |
| Depth strategy | Layered grays (white over light gray over lighter gray) instead of shadows; shadows are faint |
| Typography | One geometric sans-serif family, mostly Regular and Medium weights, small sizes (12–16px) |
| Iconography | Outline icons with a thin, consistent stroke (≈1.5px), 16–20px |
| Signature elements | Black gradient pill for the active nav item, black rounded-square logo mark, pastel bordered status pills with a leading dot, and gray "tray" containers holding white cards |

The system rests on four rules:
1. **Black means navigation identity, blue means action.** Black is used for the logo and the active nav item. Blue is used only for primary CTAs and links.
2. **Gray trays hold white cards.** Grouped content sits in white cards inside a light-gray container.
3. **Every interactive control is a 1px-bordered white box** with a small radius, except the primary button.
4. **Status is shown with color.** Semantic color appears almost only in status pills, banners, destructive icons and notification dots.

---

## 2. Visual Identity & Art Direction

### 2.1 Character
- **Calm and professional.** Large white areas, low-contrast borders and no decorative illustration let the data dominate.
- **Precise and engineered.** Strict alignment, uniform control heights (40px toolbar and inputs, 44px header actions) and repeated components.
- **Approachable.** A rounded geometric typeface, soft radii and pastel status colors keep it friendly instead of austere.
- **Premium-minimal.** The only "rich" surfaces are the black active nav pill (a subtle vertical gradient) and the saturated blue CTA.

### 2.2 Contrast and hierarchy
- The strongest contrast is **black (#111) on white**, used for the logo, active nav, page title and the "days left" badge.
- The second strongest is the **blue CTA (#2B5BFF approx.)**, and there is exactly one primary CTA per view (or a primary plus a secondary pair).
- Body data text is dark gray on white. Column headers and helper text are mid-gray. That gives three clear text levels.
- Whitespace separates rows. Table rows have **no visible divider lines**; rhythm and alignment do the separating.

### 2.3 Distinctive, recognizable elements
1. Active sidebar item rendered as a **black, slightly glossy pill** with white icon and text.
2. **Status pills** with a fixed width, pastel fill, matching 1px border, colored text and a leading 5px dot.
3. **Kanban cards with a gray top band** and a circular avatar that overlaps the band edge.
4. **Right-rail association panel**: a gray tray with stacked white cards, each having an icon chip, a title, a divider, content and a full-width "+ Create …" button.
5. **"Owner" chip rows**: a light-gray strip with an avatar and name, plus a white bordered tag on the right.
6. **Overlapping avatar stack** in the header, finished with a white circular "+" button with a soft shadow.

---

## 3. Color Palette

All values are **approximate** and sampled from compressed screenshots.

### 3.1 Brand & action

| Token | HEX | RGB | Role | Usage |
|---|---|---|---|---|
| `--color-primary` | `#2B5BFF` | 43, 91, 255 | Primary action | Primary buttons ("Add", "Create now", "Save change"), focus accents |
| `--color-primary-hover` | `#2049E0` | 32, 73, 224 | Hover/pressed (recommended) | Not observed; derived ~8% darker |
| `--color-primary-subtle` | `#EDF1FF` | 237, 241, 255 | Tint | Blue status pill background |
| `--color-primary-border` | `#C9D5FF` | 201, 213, 255 | Tint border | Blue status pill border |
| `--color-link` | `#2B5BFF` | 43, 91, 255 | Hyperlink | Underlined URLs in cards |
| `--color-brand-ink` | `#111111` | 17, 17, 17 | Brand mark / nav identity | Logo tile, active nav pill, dark badge |
| `--color-brand-ink-gradient` | `#2E2E2E → #0B0B0B` | — | Active nav pill fill | Subtle top-to-bottom gradient (visible as a slight sheen) |

### 3.2 Backgrounds & surfaces

| Token | HEX | RGB | Role | Usage |
|---|---|---|---|---|
| `--color-background` | `#FFFFFF` | 255, 255, 255 | App canvas | Sidebar, header, main content |
| `--color-surface` | `#FFFFFF` | 255, 255, 255 | Cards, inputs, secondary buttons | Default control and card fill |
| `--color-surface-muted` | `#F5F5F5` | 245, 245, 245 | Tray / header row | Table header row, right-rail tray, kanban column tray |
| `--color-surface-sunken` | `#F2F2F2` | 242, 242, 242 | Inset block | Upload block, rich-text toolbar strip, owner chip row |
| `--color-surface-band` | `#EBEBEB` | 235, 235, 235 | Card header band | Top band of kanban cards |
| `--color-surface-inverse` | `#111111` | 17, 17, 17 | Inverse | Active nav, dark badge |
| `--color-presentation-bg` | `#D9DADE` | 217, 218, 222 | Not part of UI | Mockup canvas only; do not use in product |

### 3.3 Text

| Token | HEX | RGB | Role | Usage |
|---|---|---|---|---|
| `--color-text-primary` | `#141414` | 20, 20, 20 | Headings and key data | Page title, names, form labels, input values |
| `--color-text-body` | `#2B2B2B` | 43, 43, 43 | Table cell data | Job title, email, phone cells |
| `--color-text-secondary` | `#6B6B6B` | 107, 107, 107 | Supporting | Column headers, subtitles, card meta, helper text |
| `--color-text-placeholder` | `#7A7A7A` | 122, 122, 122 | Placeholder | Input and select placeholders |
| `--color-text-muted` | `#9A9A9A` | 154, 154, 154 | Tertiary | Section labels ("MAIN MENU" style), disabled-looking chips |
| `--color-text-inverse` | `#FFFFFF` | 255, 255, 255 | On dark/blue | Active nav label, primary button label |

### 3.4 Borders & dividers

| Token | HEX | RGB | Role | Usage |
|---|---|---|---|---|
| `--color-border` | `#E5E5E5` | 229, 229, 229 | Default control border | Inputs, secondary buttons, cards, pagination |
| `--color-border-subtle` | `#EDEDED` | 237, 237, 237 | Layout divider | Sidebar/content split, header bottom line, card internal dividers |
| `--color-border-strong` | `#D6D6D6` | 214, 214, 214 | Emphasis border | Checkboxes, neutral "Lead"-type pill border |
| `--color-border-focus` | `#2B5BFF` | 43, 91, 255 | Focus ring (recommended) | Not observed; recommended for accessibility |

### 3.5 Status colors (observed in pills, banner and icons)

Each status uses a **text/dot color**, a **pastel fill**, and a **tinted 1px border**.

| Token set | Text / dot | Fill | Border | Observed meaning |
|---|---|---|---|---|
| `--status-success-*` | `#1FA45A` (31,164,90) | `#EAF8EF` (234,248,239) | `#BFE8CE` | Positive / active-state pill |
| `--status-info-*` | `#2B5BFF` (43,91,255) | `#EDF1FF` | `#C9D5FF` | Alternate positive pill (blue variant) |
| `--status-warning-*` | `#F2782F` (242,120,47) | `#FFF3EB` (255,243,235) | `#FFD5BA` | Lapsed / churned-type pill |
| `--status-danger-*` | `#E5383B` (229,56,59) | `#FDECEC` (253,236,236) | `#F7C4C5` | Negative / adversarial pill; delete icons |
| `--status-accent-*` | `#A47BEA` (164,123,234) | `#F5EFFF` (245,239,255) | `#E2D3FA` | Qualified / progressed pill |
| `--status-accent-soft-*` | `#B4B4EE` (180,180,238) | `#F6F6FE` | `#E4E4FA` | Early pipeline pill (very low contrast) |
| `--status-neutral-*` | `#5C5C5C` (92,92,92) | `#EFEFEF` (239,239,239) | `#D9D9D9` | Default / new pill |

Other semantic uses:

| Token | HEX | Usage |
|---|---|---|
| `--color-success-banner-bg` | `#EAF7EE` | Full-width success notice strip |
| `--color-success-icon` | `#22C55E` | Filled checkbox-style icon in the banner |
| `--color-notification-dot` | `#F04438` | Unread dot on the bell icon |
| `--color-danger-icon` | `#E5484D` | Outline delete/remove icons in cards |

### 3.6 Gradients
- **Observed:** a subtle vertical gradient on the active nav pill (charcoal to near black). The primary blue button may have a faint top highlight; it is too subtle to confirm.
- **Not observed:** decorative or background gradients. Do not add them.

---

## 4. Typography System

### 4.1 Typeface
- **Observed characteristics:** a geometric sans with near-circular bowls, a double-story "a", wide proportions, a large x-height, generous default tracking and round dots.
- **Likely candidate (unconfirmed):** *Poppins* or a close geometric relative.
- **Suitable alternatives:** Poppins, Plus Jakarta Sans (slightly narrower), Outfit, or DM Sans (more compact; use with tighter sizes).
- **Mono font:** none observed. Numbers such as phone values use the same sans.

```css
--font-family-base: "Poppins", "Plus Jakarta Sans", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
```

### 4.2 Weights in use
| Weight | Token | Usage |
|---|---|---|
| 400 Regular | `--font-weight-regular` | Body, table cells, inputs, nav labels, wordmark |
| 500 Medium | `--font-weight-medium` | Page title, labels, card titles, button labels, names |
| 600 SemiBold | `--font-weight-semibold` | Emphasized fragments inside sentences (for example, values in the success banner) |

No bold (700+) or light (300) weights were observed.

### 4.3 Type scale (estimated)

| Token | Size / Line height | Weight | Tracking | Usage |
|---|---|---|---|---|
| `--text-display` | 28px / 36px | 400 | -0.01em | Wordmark next to the logo mark |
| `--text-title` | 20px / 28px | 500 | 0 | Page title / breadcrumb in header |
| `--text-heading` | 16px / 24px | 500 | 0 | Card section titles, kanban card name, upload block title (≈17px) |
| `--text-nav` | 16px / 24px | 400 | 0 | Sidebar nav items |
| `--text-body` | 14px / 20px | 400 | 0 | Table cells, inputs, button labels, form labels (labels use 500) |
| `--text-body-sm` | 13px / 18px | 400 | 0 | Column headers, sub-headings under section titles, card meta |
| `--text-caption` | 12px / 16px | 400 | 0 | Kanban field labels, owner chip names, user email |
| `--text-overline` | 11px / 16px | 400–500 | +0.02em, UPPERCASE | Sidebar group labels |
| `--text-micro` | 10–11px / 14px | 400 | 0 | Upsell card body copy |

### 4.4 Hierarchy rules (observed)
- **Breadcrumb:** the parent crumb is `--color-text-secondary` and the current crumb is `--color-text-primary`, at the same size and weight, separated by "/".
- **Section header pattern:** a 15–16px Medium title with a 12–13px Regular secondary subtitle directly below and 2–4px of spacing.
- **Form label:** 14px Medium primary color, 8px above the control.
- **Capitalization:** sentence case for buttons, labels and titles. Uppercase appears only on the sidebar overline labels.
- **Alignment:** everything is left-aligned except centered full-width card buttons and centered "Owner" tags.

---

## 5. Layout & Grid Architecture

### 5.1 App shell (observed)

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ Logo + toggle│ Page title / breadcrumb          [help][⌕][🔔][avatars+]│  ← header ≈ 90px
├──────────────┼──────────────────────────────────────────────────────┤
│ Overline     │ [Optional full-width banner]                          │
│  Nav items   │ Section header / Toolbar          [secondary][primary]│
│ ──────────── │                                                      │
│ Overline     │  Main content (table | kanban | form + right rail)   │
│  Nav items   │                                                      │
│ ──────────── │                                                      │
│ Overline     │                                                      │
│  Nav items   │                                                      │
│              │                                                      │
│ Upsell card  │                                                      │
│ User card    │  Footer controls (page size / pagination)            │
└──────────────┴──────────────────────────────────────────────────────┘
```

| Region | Measurement (estimated) | Notes |
|---|---|---|
| Sidebar width | ≈ 262px | Fixed. White, 1px right border `--color-border-subtle` |
| Sidebar inner padding | 22–24px horizontal | Nav items span the full inner width (≈ 218px) |
| Header height | ≈ 90px | Spans sidebar and content; a 1px bottom divider runs across both |
| Content horizontal padding | ≈ 23–24px | Same on left and right |
| Content top padding (below header) | ≈ 22–24px | |
| Main content width at this frame | ≈ 1045px | Fluid; fills the remaining width |

### 5.2 Content layouts (observed patterns)

**A. Data list (table) view**
- A toolbar row (40px controls), then a 24px gap, then a full-width table, then pagination about 24px below the table.
- Toolbar: filter controls are left-grouped with 8px gaps. Data actions are right-grouped with a secondary button followed by a primary button.

**B. Board (kanban) view**
- The same toolbar.
- Columns are fixed at about **296px** wide with about **15px** gaps. Overflow scrolls horizontally, with a thin horizontal scrollbar at the bottom of the viewport.
- Each column is a gray tray with about 8px padding: a white header card, then stacked white record cards with about 8px gaps.

**C. Form + association rail**
- Section header row: title and subtitle on the left, button group on the right.
- A two-column body: the **main form card ≈ 734px** and a **right rail ≈ 296px**, with a **≈ 16px gap** (about a 71/29 split).
- Inside the form card, a **2-column field grid** has 16px column gaps and about 16–20px vertical gaps between field groups. Full-width fields (address, note, rich text) span both columns.

### 5.3 Grid recommendation
- Use a **12-column fluid grid** in the content area, with a 16px gutter and 24px outer padding.
  - Form + rail ≈ 8.5 / 3.5 columns. A fixed rail of 296px with a fluid main area is simpler.
  - Field grid = 6 / 6.
- The kanban layout uses fixed-width columns (not grid-based) plus horizontal scroll.

### 5.4 Vertical rhythm
- Base unit: **4px**. Most observed gaps are 8, 12, 16 or 24px.
- Header to first content: 24px. Toolbar to table: 24px. Field label to control: 8px. Field group to field group: 16–20px. Card section to card section in the rail: 16px.

---

## 6. Spacing System

| Token | Value | Observed use |
|---|---|---|
| `--space-0-5` | 2px | Title-to-subtitle gap (tight) |
| `--space-1` | 4px | Icon-to-dot, dot-to-text inside pills |
| `--space-2` | 8px | Toolbar control gaps, label-to-input, icon-to-label in buttons, kanban card gaps |
| `--space-3` | 12px | Input horizontal padding, nav item horizontal padding, row avatar-to-name |
| `--space-4` | 16px | Card padding, form column gap, rail card gap |
| `--space-5` | 20px | Field group vertical gap (upper end) |
| `--space-6` | 24px | Page padding, section gaps |
| `--space-8` | 32px | Gap between sidebar nav groups (divider placed in the middle) |

**Internal component padding (estimated)**

| Component | Padding |
|---|---|
| Secondary / primary button (40px) | 0 14px |
| Header action button (44px) | 0 16px |
| Input / select | 0 12px |
| Table cell | 0 12px; row height ≈ 52px |
| Kanban record card | 12–14px |
| Rail section card | 12px |
| Upload block | 16px |
| Status pill | 0 10px; height ≈ 26px |

---

## 7. Shapes, Borders & Effects

### 7.1 Radius scale

| Token | Value | Applied to |
|---|---|---|
| `--radius-xs` | 4px | Checkboxes, banner check icon, toolbar format buttons inside groups |
| `--radius-sm` | 6px | Status pills, small icon buttons ("…"), "Owner" tags, chips |
| `--radius-md` | 8px | Buttons, inputs, selects, nav items, table header row, logo mark |
| `--radius-lg` | 10px | Kanban cards, rail cards, header action buttons, upsell card, user card |
| `--radius-xl` | 12px | Large trays (form card, right rail tray, kanban column tray) |
| `--radius-full` | 9999px | Avatars, avatar "+" button, count badges in column headers |

### 7.2 Borders
- **Weight:** always 1px. No 2px borders except the kanban column header's **left accent bar** (≈ 2px, blue, inset and vertically centered, about 60% of the header height).
- Controls and cards: `--color-border`.
- Layout splits: `--color-border-subtle`.
- **Avatar ring:** the uploaded profile avatar in the form has a 2px `--color-primary` ring with a 2px white gap. Header avatar stacks use a 2px white ring so the avatars separate visually.

### 7.3 Shadows / elevation

| Token | Value (estimated) | Usage |
|---|---|---|
| `--shadow-none` | none | Most surfaces, which rely on borders |
| `--shadow-xs` | `0 1px 2px rgba(16, 24, 40, 0.04)` | Buttons, inputs, pills: a barely perceptible lift |
| `--shadow-sm` | `0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16,24,40,0.04)` | Cards inside trays, "Owner" tag, "…" buttons |
| `--shadow-md` | `0 6px 16px rgba(16, 24, 40, 0.08)` | Floating "+" circle in the avatar stack |
| `--shadow-inset-highlight` | `inset 0 1px 0 rgba(255,255,255,0.15)` | Active nav pill, primary button sheen (uncertain) |

The large blurred shadow around the whole app frame belongs to the presentation mockup. **It is not a UI token.**

### 7.4 Other effects
- **Blur / glass:** none observed.
- **Overlays / modals:** none observed.
- **Background patterns or textures:** none.
- **Dividers:** 1px horizontal lines separating sidebar groups (inset to the content width), separating rail-card headers from bodies, and under the app header.

---

## 8. Component Library

> Specs combine observed and estimated values. "Variants" lists only what is visible.

### 8.1 Sidebar (primary navigation)
| Property | Spec |
|---|---|
| Purpose | Persistent global navigation, grouped by domain |
| Structure | Brand row (logo mark, wordmark, collapse toggle) → groups (overline label + nav items) separated by dividers → bottom stack (upsell card, user card) |
| Background | `--color-background`, with a 1px right border |
| Overline label | 11px uppercase, `--color-text-secondary`, 12px above the first item |
| Nav item | 38–40px tall, `--radius-md`, 20px outline icon + 16px Regular label, 12px icon–label gap, 12px left padding |
| Active state | `--color-surface-inverse` fill with a subtle gradient, white icon and text, inset highlight |
| Default state | Transparent, `--color-text-primary` icon and label |
| Hover (recommended) | `--color-surface-muted` fill |
| Item spacing | ≈ 8–9px between items |
| Reuse | Keep at most about 5 items per group; collapse toggle top-right of the brand row |

### 8.2 Brand mark
- A 36px black rounded square (`--radius-md`) with a white glyph, followed by a 28px Regular wordmark with a 8px gap. Vertically centered in the 90px header band.

### 8.3 App header
| Property | Spec |
|---|---|
| Height | ≈ 90px, with a bottom divider |
| Left | Page title or breadcrumb (`--text-title`) |
| Right cluster (8px gaps) | Text+icon help button (44px tall, `--radius-lg`, bordered) → square icon buttons 44×44 (search, notifications with red dot) → collaborator avatar stack |
| Avatar stack | 40px avatars overlapping by about 12px with 2px white rings, ending in a 44px white circular "+" button with `--shadow-md` |

### 8.4 Buttons

| Variant | Fill | Text | Border | Height | Radius | Notes |
|---|---|---|---|---|---|---|
| Primary | `--color-primary` | white, 14px Medium | none (possibly a 1px darker-blue edge) | 40px | 8px | Leading "+" icon optional. One per view |
| Secondary | white | `--color-text-primary`, 14px | `--color-border` | 40px | 8px | Optional leading icon and trailing chevron (dropdown) |
| Header action | white | 16px | `--color-border` | 44px | 10px | Larger scale for the header only |
| Icon button | white | icon 18–20px | `--color-border` | 44×44 / 28×28 | 10px / 6px | 28px "…" overflow variant sits on cards and gray bands |
| Full-width card button | white | 14px, centered, leading icon | `--color-border` | 30–32px | 8px | "+ Create …", "Send …", "View …" |
| Dark badge-button | `--color-surface-inverse` | white, 12px Medium, leading icon | none | 32px | 8px | Upsell timer pill |

Button rules:
- The icon sits left of the label with 8px spacing. Dropdown chevrons sit right.
- A header pair is ordered **secondary, then primary**, right-aligned with an 8px gap.

### 8.5 Toolbar / filter bar
- Left group: search field (≈ 140–155px, magnifier icon, 14px placeholder) → "Sort" dropdown → "Filter" button → view switcher dropdown (list/board). Each is 40px tall and bordered.
- Right group: import/export dropdown (secondary) and primary create button.
- The view switcher changes its icon and label with the active view (list icon or board icon).

### 8.6 Data table
| Property | Spec |
|---|---|
| Header row | `--color-surface-muted` fill, `--radius-md`, ≈ 44px tall, 13–14px `--color-text-secondary` labels, no sort icons visible |
| Body rows | ≈ 52px tall, white, **no row dividers**, 14px `--color-text-body` |
| Columns | Checkbox (≈ 14px box, `--radius-xs`, `--color-border-strong`) → identity cell (20px avatar + name) → text columns → person cell (avatar + name) → status pill → "…" overflow |
| Column widths | Content-driven; left-aligned; about 12px horizontal padding |
| Hover (recommended) | `--color-surface-muted` row fill |
| Selected (recommended) | `--color-primary-subtle` row fill and a checked blue checkbox |

### 8.7 Status pill (badge)
| Property | Spec |
|---|---|
| Size | Fixed width ≈ 122px (all pills in the column are the same width), height ≈ 26px |
| Shape | `--radius-sm`, 1px tinted border, `--shadow-xs` |
| Content | 5px dot (same color as text), 6px gap, then a 14px Regular label, centered |
| Variants | success-green, info-blue, warning-orange, danger-red, accent-purple, accent-soft-lavender, neutral-gray |
| Rule | Pair each status with one color only. The reference shows the same status in both green and blue, which is an inconsistency (see §15) |

### 8.8 Pagination & page size
- **Page size:** the label "Show items" (14px) plus a compact bordered select (≈ 60×32px, `--radius-md`).
- **Pagination:** separate bordered square prev/next buttons (32px) on either side of a gray pill tray holding page numbers. The active page is a white, bordered, slightly elevated 28px square. Inactive pages are plain text. An ellipsis marks truncation.

### 8.9 Kanban column
| Property | Spec |
|---|---|
| Tray | `--color-surface-muted`, `--radius-xl`, ≈ 8px padding, ≈ 296px wide |
| Header card | White, `--radius-lg`, ≈ 52px tall. Left blue accent bar (2px), title 15px Regular, count badge (20px circle, `--color-surface-muted` fill, 1px border, 11px numerals), and a bordered 28px "+" button on the right |
| Card stack | 8px gaps; the column grows vertically |

### 8.10 Kanban record card
| Property | Spec |
|---|---|
| Shell | White, `--radius-lg`, 1px border, `--shadow-sm` |
| Top band | ≈ 44px `--color-surface-band` strip across the full width, with a 28px "…" button top-right |
| Avatar | 52px circle overlapping the band's bottom edge, left-aligned with the content padding |
| Identity | Name in 16px Medium, then the role in 12px `--color-text-secondary` |
| Field list | Two-column key/value rows: 14px icon + 12px label (secondary) on the left, value (12px body) at a fixed indent. ≈ 22px row height |
| Owner strip | `--color-surface-sunken` row, `--radius-md`. 20px avatar + 12px name; a white bordered "Owner" tag (`--radius-sm`, 13px) aligned right |
| Footer action | Full-width secondary button with a leading icon |

### 8.11 Form field (input / select / textarea)
| Property | Spec |
|---|---|
| Label | 14px Medium, `--color-text-primary`, 8px gap to the control |
| Control | 40px tall, white, 1px `--color-border`, `--radius-md`, 12px horizontal padding, 14px text |
| Placeholder | `--color-text-placeholder`. Format hints use an "Ex: …" prefix |
| Select | A trailing chevron-down at 16px. Selects can embed a leading 18px avatar (person picker) |
| Phone input | A leading country flag (16px) + dial code + small caret, then the number field, all inside one control |
| Textarea | Same styling, about 54px minimum height, with a native resize handle |
| States observed | Empty (placeholder) and filled. Focus, error and disabled states are **not observed** (see §13 recommendations) |

### 8.12 Rich-text editor
- Toolbar strip: `--color-surface-sunken`, top radius `--radius-lg`, 12px padding.
- Controls appear in **segmented groups**: white bordered groups with `--radius-md`. Inside a group, buttons are 32–38px square and separated by 1px internal dividers. Groups are: text style dropdown | B/I/U | 4 alignment options | 3 list types | link / image / attachment.
- Editor body: white, 14px text, placeholder in secondary gray.

### 8.13 Upload block
- An inset `--color-surface-sunken` panel with 1px border and `--radius-lg`, 16px padding.
- Left: a 64px circular placeholder (light gray with an outline person icon) **or** the uploaded image with a blue ring.
- Middle: 17px Medium title and two 12px secondary helper lines (formats and minimum size).
- Right: a white bordered secondary button.

### 8.14 Association rail (right column)
| Property | Spec |
|---|---|
| Tray | `--color-surface-muted`, `--radius-xl`, 12–14px padding, 16px gap between section cards |
| Section card | White, `--radius-lg` |
| Section header | 28px bordered icon chip (`--radius-sm`) + 16px Medium title, then a 1px divider |
| Empty state | Select control + full-width "+ Create …" button |
| Filled state | Bordered entity card (logo/avatar 36px, title 14px Medium, subtitle 12px, red outline delete icon top-right, icon+text meta rows at 12px, owner strip) + full-width "+ Create …" button |
| Meta footer (deal variant) | A row of small icon+count pairs at 12px secondary |

### 8.15 Success banner (inline notice)
- Full content width, placed directly under the header, ≈ 50px tall.
- `--color-success-banner-bg` fill, no border.
- Leading 18px filled green check square (`--radius-xs`). Message in 14px Regular secondary, with key values in 14px Medium primary. Trailing 16px close "×" right-aligned.

### 8.16 Upsell card (sidebar)
- White, 1px border, `--radius-lg`, 12px padding.
- Dark badge-button (icon + countdown), dismiss "×" top-right, 10–11px secondary copy (2 lines), full-width secondary button.

### 8.17 User account card (sidebar footer)
- White, 1px border, `--radius-lg`, ≈ 62px tall.
- 36px avatar, name (14px Medium), email (12px secondary), and an up/down chevron (account switcher).

### 8.18 Avatar
| Size | Usage |
|---|---|
| 20px | Table cells, owner strips |
| 36px | User card, entity logos |
| 40px | Header collaborator stack |
| 52px | Kanban card identity |
| 64px | Upload block |

All avatars are circular photographic crops. Stacks use a 2px white ring. A selected or uploaded avatar uses a 2px blue ring with a white gap.

### 8.19 Checkbox
- 14–16px square, `--radius-xs`, 1px `--color-border-strong`, white fill.
- The filled green variant (in the banner) suggests the checked state is a solid color square with a white check.

---

## 9. Imagery & Graphic Language

| Aspect | Observation |
|---|---|
| Photography | Only **people avatars**: realistic head-and-shoulders portraits in varied lighting, cropped to circles. Several sit on a plain studio or colored backdrop |
| Aspect ratio | 1:1 crops displayed in circles |
| Illustration | None |
| Background imagery | None. All backgrounds are flat neutrals |
| Decorative shapes | None beyond the kanban card's gray top band, which works as a "cover" placeholder area |
| Logos | Third-party entity logos are shown as small circular marks (black circle with a white glyph) |
| Icons | Outline, rounded line caps and joins, ≈ 1.5px stroke, 16px (inline meta), 18–20px (buttons, nav), monochrome in the current text color. Red is reserved for delete; white for inverse states |
| Icon containers | Bordered 28px rounded squares in section headers; bordered 44px squares in the header |

**Reusable graphic rules**
- Treat imagery as identity, not decoration: avatars and logos only.
- If a record has no photo, use a neutral `--color-surface-muted` circle with an outline person icon (observed in the upload block).
- The gray card band can later hold a cover image. Keep it at about 44px and fill it with `--color-surface-band` by default.

---

## 10. Responsive Design Guidelines

> Only desktop screenshots (≈ 1354px frame) were provided. **Everything in this section is a recommendation**, not an observation.

| Breakpoint (recommended) | Behavior |
|---|---|
| ≥ 1280px | Layout as observed: 262px sidebar, form plus a 296px rail |
| 1024–1279px | Sidebar collapses to an icon rail (≈ 72px) using the existing collapse toggle; the rail stays |
| 768–1023px | The rail moves **below** the form (single column); the field grid stays 2-column; kanban keeps horizontal scroll |
| < 768px | Sidebar becomes an off-canvas drawer opened from the header; the field grid becomes 1-column; the toolbar wraps (search full width, other controls in a scrollable row); the table turns into stacked row cards (reuse kanban card anatomy) or scrolls horizontally with the first column sticky; header avatars collapse to a "+N" chip; page padding drops to 16px |

Rules to preserve:
- Keep control heights (40px) and radii unchanged across breakpoints. Scale layout, not components.
- Keep at least 44px touch targets on touch devices (header icon buttons already comply; 28px "…" buttons need a larger hit area).
- Typography can stay the same size; at most, reduce `--text-title` to 18px on mobile.

---

## 11. Design Principles (DO & DON'T)

### DO
- **Use blue only for the primary action** and inline links. Pair it with one bordered white secondary button.
- **Use black for identity and selection in navigation.** Keep exactly one black element per navigation context (the active item).
- **Group related content in a gray tray with white cards inside.** Use one level of nesting only.
- **Separate with whitespace first, then 1px light borders.** Avoid divider lines between table rows.
- **Give every status a dot, a pastel fill, a tinted border and a fixed width**, so pill columns align.
- **Keep every control at 40px with an 8px radius** in toolbars and forms, and repeat the same button anatomy everywhere.
- **Use the title + subtitle pair** at the top of every section, with actions aligned to the right on the same row.
- **Build forms as a 2-column grid** and span long-text fields across both columns.
- **Use "+ Create …" full-width buttons** at the bottom of association cards for inline creation.
- **Keep icons outline-only** at one stroke weight, colored with the adjacent text color.

### DON'T
- Don't introduce a second saturated brand color, or use blue for decorative fills, headers or backgrounds.
- Don't put heavy drop shadows on cards. The system's depth comes from gray layering.
- Don't nest cards more than two levels deep (tray → card → inner entity card is the maximum observed).
- Don't use bold (700) headings or large display type inside the app. The scale tops out at about 20px for page titles.
- Don't mix filled and outline icons, or icon stroke weights.
- Don't give the same status two different colors.
- Don't use low-contrast pastel text (like the lavender pill) for information users must read. Darken it to reach 4.5:1 (see §15).
- Don't use the presentation gray canvas (`#D9DADE`) or the frame shadow inside the product.
- Don't add gradients beyond the subtle nav sheen.

---

## 12. Design Tokens & CSS Variables

```css
:root {
  /* ───────── Color: brand & action ───────── */
  --color-primary: #2B5BFF;
  --color-primary-hover: #2049E0;          /* recommended */
  --color-primary-active: #1A3CC0;         /* recommended */
  --color-primary-subtle: #EDF1FF;
  --color-primary-border: #C9D5FF;
  --color-link: var(--color-primary);
  --color-brand-ink: #111111;
  --gradient-nav-active: linear-gradient(180deg, #2E2E2E 0%, #0B0B0B 100%);

  /* ───────── Color: surfaces ───────── */
  --color-background: #FFFFFF;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F5F5F5;
  --color-surface-sunken: #F2F2F2;
  --color-surface-band: #EBEBEB;
  --color-surface-inverse: #111111;

  /* ───────── Color: text ───────── */
  --color-text-primary: #141414;
  --color-text-body: #2B2B2B;
  --color-text-secondary: #6B6B6B;
  --color-text-placeholder: #7A7A7A;
  --color-text-muted: #9A9A9A;
  --color-text-inverse: #FFFFFF;

  /* ───────── Color: borders ───────── */
  --color-border: #E5E5E5;
  --color-border-subtle: #EDEDED;
  --color-border-strong: #D6D6D6;
  --color-border-focus: var(--color-primary);  /* recommended */

  /* ───────── Color: status (text / bg / border) ───────── */
  --status-success-fg: #1FA45A;  --status-success-bg: #EAF8EF;  --status-success-border: #BFE8CE;
  --status-info-fg: #2B5BFF;     --status-info-bg: #EDF1FF;     --status-info-border: #C9D5FF;
  --status-warning-fg: #F2782F;  --status-warning-bg: #FFF3EB;  --status-warning-border: #FFD5BA;
  --status-danger-fg: #E5383B;   --status-danger-bg: #FDECEC;   --status-danger-border: #F7C4C5;
  --status-accent-fg: #A47BEA;   --status-accent-bg: #F5EFFF;   --status-accent-border: #E2D3FA;
  --status-accent-soft-fg: #8C8CE0; /* darkened from observed #B4B4EE for contrast */
  --status-accent-soft-bg: #F6F6FE; --status-accent-soft-border: #E4E4FA;
  --status-neutral-fg: #5C5C5C;  --status-neutral-bg: #EFEFEF;  --status-neutral-border: #D9D9D9;

  --color-success-banner-bg: #EAF7EE;
  --color-success-icon: #22C55E;
  --color-notification-dot: #F04438;
  --color-danger-icon: #E5484D;

  /* ───────── Typography ───────── */
  --font-family-base: "Poppins", "Plus Jakarta Sans", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  --text-display: 28px;   --leading-display: 36px;
  --text-title: 20px;     --leading-title: 28px;
  --text-heading: 16px;   --leading-heading: 24px;
  --text-nav: 16px;       --leading-nav: 24px;
  --text-body: 14px;      --leading-body: 20px;
  --text-body-sm: 13px;   --leading-body-sm: 18px;
  --text-caption: 12px;   --leading-caption: 16px;
  --text-overline: 11px;  --leading-overline: 16px;  --tracking-overline: 0.02em;
  --text-micro: 10.5px;   --leading-micro: 14px;

  /* ───────── Spacing (4px base) ───────── */
  --space-0-5: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* ───────── Radius ───────── */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* ───────── Elevation ───────── */
  --shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.04);
  --shadow-sm: 0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04);
  --shadow-md: 0 6px 16px rgba(16, 24, 40, 0.08);
  --shadow-inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.15);
  --focus-ring: 0 0 0 3px rgba(43, 91, 255, 0.20);   /* recommended */

  /* ───────── Layout ───────── */
  --sidebar-width: 262px;
  --sidebar-width-collapsed: 72px;      /* recommended */
  --header-height: 90px;
  --page-padding-x: 24px;
  --page-padding-top: 24px;
  --rail-width: 296px;
  --kanban-column-width: 296px;
  --kanban-column-gap: 16px;
  --grid-columns: 12;
  --grid-gutter: 16px;
  --form-column-gap: 16px;
  --form-row-gap: 20px;

  /* ───────── Component sizing ───────── */
  --control-height: 40px;
  --control-height-lg: 44px;
  --control-height-sm: 32px;
  --icon-button-sm: 28px;
  --nav-item-height: 40px;
  --table-header-height: 44px;
  --table-row-height: 52px;
  --pill-height: 26px;
  --pill-width: 122px;
  --pill-dot: 5px;
  --checkbox-size: 16px;
  --icon-sm: 16px;
  --icon-md: 20px;
  --avatar-xs: 20px;
  --avatar-sm: 36px;
  --avatar-md: 40px;
  --avatar-lg: 52px;
  --avatar-xl: 64px;

  /* ───────── Motion (recommended — none observable in static screenshots) ───────── */
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

---

## 13. Implementation Guidelines

### 13.1 Build order
1. **Tokens.** Copy §12 into a single `tokens.css` (or map it to your Tailwind theme).
2. **Primitives.** Button (5 variants), Input / Select / Textarea, Checkbox, Avatar (+ Stack), Status pill, Icon button.
3. **Composites.** Toolbar, Data table, Pagination, Kanban column and card, Rail section card, Upload block, Rich-text toolbar, Banner.
4. **Shell.** Sidebar, Header, and the three page templates (List, Board, Form + Rail).

### 13.2 State recommendations (not observed, but needed)

| State | Recommendation consistent with the system |
|---|---|
| Hover, secondary control | Fill `--color-surface-muted`, border unchanged |
| Hover, primary | `--color-primary-hover` |
| Focus-visible | Border `--color-border-focus` + `--focus-ring` |
| Error (input) | Border `--status-danger-fg`, 12px helper text in danger color below the control |
| Disabled | Fill `--color-surface-muted`, text `--color-text-muted`, no shadow |
| Selected row | `--color-primary-subtle` fill, primary-colored checkbox |
| Loading | Skeleton blocks in `--color-surface-band` with `--radius-sm` |

### 13.3 Accessibility notes
- `--color-text-secondary` (#6B6B6B) on white is about 5.3:1, which passes AA for body text.
- Pastel pill text: green, orange, purple and especially the lavender variant fall **below 4.5:1** on their fills. Either accept them as large and non-essential, or darken the foreground about 15–25% (an adjusted lavender is already in the tokens).
- Primary blue `#2B5BFF` with white text is about 4.9:1, which passes AA.
- Never rely on pill color alone; the label text must carry the meaning (it does in the reference).

### 13.4 Adapting to a new brand
- Swap `--color-primary` (and its tints) and `--color-brand-ink`. Leave the neutral scale and status sets as they are.
- Keep radius, spacing and control heights. Most of the system's character lives in those values and in the gray-tray/white-card layering, more than in the hue.

---

## 14. Screenshot Analysis & Evidence

| # | Screen (described generically) | Evidence it contributes |
|---|---|---|
| 1 | Record list: table view | Shell, sidebar, header, toolbar, table anatomy, full status pill set, pagination, page-size select |
| 2 | Record list: board view | View switcher variant, kanban column/card anatomy, card top band, owner strip, horizontal overflow |
| 3 | Create form: empty | Two-button header actions (secondary + primary), field grid, placeholders, phone input, rich-text toolbar, empty association rail |
| 4 | Edit form: with success banner | Success banner, single primary action, filled inputs, avatar-in-select, filled rail cards, delete icons, link style |
| 5 | Create form: filled | Confirms filled states and uploaded-avatar ring treatment; same rail as #4 |

Rules confirmed across **all five** screens (high confidence): sidebar dimensions and active style, header layout, 24px page padding, 1px light borders, 8px control radius, blue primary button, and the type family.

Rules seen on **one or two screens** (medium confidence): pagination styling, kanban card anatomy, banner styling, rich-text toolbar grouping.

---

## 15. Assumptions, Estimates & Uncertainties

| Item | Status | Reason |
|---|---|---|
| Typeface (Poppins) | Uncertain | Inferred from letterforms only; no source access |
| All HEX values | Approximate (±1–3%) | Screenshots are compressed WebP with antialiasing; pastels shift the most |
| Pixel dimensions | Estimated (±2px) | Assumes a 1:1 frame scale; the mockup may be downscaled |
| Primary button gradient / sheen | Uncertain | Possible faint highlight, not resolvable at this resolution |
| Shadow values | Estimated | Shadows are faint; values are reconstructed to match the visual weight |
| Hover / focus / error / disabled states | Not observed | Recommendations only (§13.2) |
| Responsive behavior | Not observed | Desktop only; §10 is entirely inferred |
| Motion / transitions | Not observed | Tokens in §12 are recommendations |
| Same status shown in green and in blue | Observed inconsistency | Likely a mockup error. Normalize to one color per status |
| Lavender "early pipeline" pill | Observed, low contrast | It may be an intentional "muted" variant or a disabled look. Treat it as a variant and darken the text |
| Search placeholder differs between list and board views | Observed inconsistency | Treat as content, not a system rule |
| Label typos and placeholder copy in the reference | Observed | Not part of the system; do not reuse the reference's copy or business data |
| Header-only sticky behavior and scroll containers | Not determinable | Static images give no scroll evidence except kanban horizontal overflow |
