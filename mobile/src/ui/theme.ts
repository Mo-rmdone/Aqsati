// Notah brand tokens — source of truth: docs/brand/design-system/tokens.json.
// Rules (docs/brand/design-system/CLAUDE.md): no hand-written hex/px outside this file;
// tap targets ≥ 48, buttons/inputs 56, text ≥ 16 (chips 14 with an icon); Lucide icons;
// overdue is terracotta, red is for errors only.

const light = {
  paper: '#FBF7EC',
  surface: '#FFFFFF',
  surfaceSunken: '#F3EDDC',
  line: '#E4DBC4',
  lineStrong: '#857D5F',
  ink: '#1C2521',
  inkMuted: '#4F5A54',
  brand: '#0B5D4B',
  brandStrong: '#084537',
  brandSoft: '#DDEFE7',
  onBrand: '#FFFFFF',
  coin: '#F2B134',
  onCoin: '#2A1C00',
  coinSoft: '#FCEFCB',
  paid: '#11694B',
  paidBg: '#DFF1E8',
  partial: '#274F93',
  partialBg: '#E1EAF8',
  due: '#7A5200',
  dueBg: '#FCEFCB',
  overdue: '#A2400F',
  overdueBg: '#FBE4D6',
  unknown: '#4F5A54',
  unknownBg: '#E9E6DB',
  error: '#B3261E',
  errorBg: '#FBE3E1',
  onError: '#FFFFFF',
  focus: '#0B5D4B',
  scrim: 'rgba(14, 21, 18, 0.55)',
} as const;

export const colorsDark = {
  paper: '#121C18',
  surface: '#1A2822',
  surfaceSunken: '#0E1512',
  line: '#2C3D36',
  lineStrong: '#7E9389',
  ink: '#F3EFE4',
  inkMuted: '#B9C6BF',
  brand: '#5CCBA8',
  brandStrong: '#7FDABB',
  brandSoft: '#1D3A31',
  onBrand: '#06251D',
  coin: '#F2B134',
  onCoin: '#2A1C00',
  coinSoft: '#3A2E10',
  paid: '#6FD7A9',
  paidBg: '#1B3A2E',
  partial: '#9BBDF2',
  partialBg: '#1F3050',
  due: '#F2C260',
  dueBg: '#3A2E10',
  overdue: '#F4A982',
  overdueBg: '#46281A',
  unknown: '#B9C6BF',
  unknownBg: '#26332E',
  error: '#FF9C94',
  errorBg: '#4A201D',
  onError: '#3A0B08',
  focus: '#5CCBA8',
  scrim: 'rgba(0, 0, 0, 0.6)',
} as const;

// Light theme is the only one wired up for now; colorsDark is ready for a theme switch.
export const colors = {
  ...light,
  // Aliases kept so existing screens map onto the brand without a rewrite.
  bg: light.paper,
  text: light.ink,
  muted: light.inkMuted,
  border: light.line,
  primary: light.brand,
  primaryText: light.onBrand,
  danger: light.error,
  dangerBg: light.errorBg,
  success: light.paid,
  successBg: light.paidBg,
  warning: light.due,
  warningBg: light.dueBg,
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const spacing = { xs: space[1], sm: space[2], md: space[4], lg: space[6], xl: space[8] } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const border = { hairline: 1, strong: 1.5 } as const;
export const size = { tapMin: 48, tapLg: 56, iconMd: 24, iconSm: 20, columnMax: 480, gutter: 16, contentMax: 1200, settingsMax: 720, sideColumn: 340, sidebar: 248, logo: 40, logoLg: 64, dot: 10 } as const;
export const breakpoint = { desktop: 1024 } as const;

export const fontFamily = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

export const type = {
  title1: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 40 },
  wordmark: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 36 },
  title2: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 34 },
  title3: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 30 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 28 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 28 },
  label: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 24 },
  helper: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 24 },
  chip: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 20 },
  displayMoney: { fontFamily: fontFamily.bold, fontSize: 40, lineHeight: 52 },
  moneyLg: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 30 },
  moneyMd: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 28 },
} as const;

// Legacy size aliases (small is the 15px helper floor, never lower).
export const font = { body: 16, small: 15, heading: 18, title: 22 } as const;

export const shadow = {
  card: {
    shadowColor: '#3C3014',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  fab: {
    shadowColor: '#785000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
