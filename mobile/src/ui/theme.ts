// Neutral placeholder tokens; brand identity comes later.
export const colors = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  border: '#D9DDE3',
  text: '#16191D',
  muted: '#5F6B7A',
  primary: '#1F5FBF',
  primaryText: '#FFFFFF',
  danger: '#B3261E',
  dangerBg: '#FCEBEA',
  success: '#1B7A43',
  successBg: '#E5F4EB',
  warning: '#8A5A00',
  warningBg: '#FFF2D6',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 6, md: 10 } as const;

export const font = { body: 16, small: 13, title: 22, heading: 18 } as const;
