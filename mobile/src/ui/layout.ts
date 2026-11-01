import { useWindowDimensions } from 'react-native';

import { breakpoint } from './theme';

export function isDesktopWidth(width: number): boolean {
  return width >= breakpoint.desktop;
}

export function useIsDesktop(): boolean {
  return isDesktopWidth(useWindowDimensions().width);
}
