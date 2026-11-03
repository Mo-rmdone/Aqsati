// Notah design tokens (v2, "calm ledger, large print") — source of truth: /DESIGN.md.
// Rules: no hand-written hex/px outside this file; tap targets ≥ 48, buttons/inputs 56,
// text ≥ 16 (status chips 15 with an icon); Lucide icons; one blue action color;
// black marks "where you are"; overdue is burnt orange, red is for errors only.

const light = {
  paper: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceSunken: '#ECEEF1',
  line: '#DFE2E6',
  lineStrong: '#8B9099',
  ink: '#16181D',
  inkMuted: '#4B5059',
  inverse: '#16181D',
  onInverse: '#FFFFFF',
  brand: '#1F4FD8',
  brandStrong: '#173DAB',
  brandSoft: '#EAF0FF',
  onBrand: '#FFFFFF',
  // "coin" names the + invoice action; in v2 it is the action blue.
  coin: '#1F4FD8',
  onCoin: '#FFFFFF',
  coinSoft: '#FFF5D6',
  paid: '#11653C',
  paidBg: '#E6F5EC',
  paidLine: '#B9E2C8',
  partial: '#1F4FD8',
  partialBg: '#EAF0FF',
  partialLine: '#C6D4FA',
  due: '#7A4A00',
  dueBg: '#FFF3DC',
  dueLine: '#F3D9A4',
  overdue: '#A33A08',
  overdueBg: '#FFEDE3',
  overdueLine: '#F6C6AB',
  unknown: '#4B5059',
  unknownBg: '#ECEEF1',
  unknownLine: '#D3D7DD',
  error: '#B42318',
  errorBg: '#FDECEA',
  errorLine: '#F5C2BC',
  onError: '#FFFFFF',
  focus: '#1F4FD8',
  scrim: 'rgba(16, 18, 24, 0.55)',
} as const;

export const colorsDark = {
  paper: '#0F1115',
  surface: '#181B21',
  surfaceSunken: '#0B0D10',
  line: '#2A2F37',
  lineStrong: '#7D8490',
  ink: '#F1F2F4',
  inkMuted: '#B7BCC5',
  inverse: '#F1F2F4',
  onInverse: '#16181D',
  brand: '#7FA2FF',
  brandStrong: '#A3BCFF',
  brandSoft: '#1C2A4D',
  onBrand: '#0B1533',
  coin: '#7FA2FF',
  onCoin: '#0B1533',
  coinSoft: '#3A3216',
  paid: '#6FD7A0',
  paidBg: '#163A27',
  paidLine: '#24573B',
  partial: '#9DB7FF',
  partialBg: '#1C2A4D',
  partialLine: '#2E4378',
  due: '#F2C260',
  dueBg: '#3A2E10',
  dueLine: '#5A4618',
  overdue: '#FFAF85',
  overdueBg: '#46261A',
  overdueLine: '#6A3A26',
  unknown: '#B7BCC5',
  unknownBg: '#232830',
  unknownLine: '#353B45',
  error: '#FF9C94',
  errorBg: '#4A201D',
  errorLine: '#6E2E29',
  onError: '#3A0B08',
  focus: '#7FA2FF',
  scrim: 'rgba(0, 0, 0, 0.6)',
} as const;

// Light theme is the only one wired up for now; colorsDark is ready for a theme switch.
export const colors = {
  ...light,
  // Aliases kept so existing screens map onto the tokens without a rewrite.
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
export const radius = { sm: 6, md: 10, lg: 12, xl: 16, pill: 999 } as const;
export const border = { hairline: 1, strong: 1.5, focus: 2 } as const;
export const size = { tapMin: 48, tapLg: 56, iconMd: 24, iconSm: 20, columnMax: 480, gutter: 16, contentMax: 1200, settingsMax: 720, sideColumn: 340, sidebar: 256, logo: 40, logoLg: 64, dot: 10 } as const;
export const breakpoint = { desktop: 1024 } as const;

export const fontFamily = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

export const type = {
  title1: { fontFamily: fontFamily.bold, fontSize: 30, lineHeight: 42 },
  wordmark: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 36 },
  title2: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 36 },
  title3: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 30 },
  body: { fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 30 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 30 },
  label: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 26 },
  helper: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 26 },
  chip: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22 },
  displayMoney: { fontFamily: fontFamily.bold, fontSize: 40, lineHeight: 52 },
  moneyLg: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 32 },
  moneyMd: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 30 },
} as const;

// Legacy size aliases (small is the 16px helper floor, never lower).
export const font = { body: 17, small: 16, heading: 20, title: 24 } as const;

export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  fab: {
    shadowColor: '#101828',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
