import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

const files = {
  400: IBMPlexSansArabic_400Regular,
  500: IBMPlexSansArabic_500Medium,
  600: IBMPlexSansArabic_600SemiBold,
  700: IBMPlexSansArabic_700Bold,
} as const;

/**
 * On web, react-native-web gives every Text a system font, and `fontWeight` can't
 * reach a font family registered per weight. Register one "Notah" family with all four
 * weights and make it the default for every element, so plain screen text and
 * fontWeight both render in IBM Plex Sans Arabic. Native uses the per-weight
 * families from theme `type` instead.
 */
function injectWebFontFace() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('notah-fonts')) return;
  const faces = Object.entries(files)
    .map(
      ([weight, mod]) =>
        `@font-face{font-family:'Notah';src:url('${Asset.fromModule(mod).uri}');font-weight:${weight};font-display:swap}`,
    )
    .join('');
  const style = document.createElement('style');
  style.id = 'notah-fonts';
  style.textContent = `${faces}*{font-family:'Notah',system-ui,sans-serif !important}`;
  document.head.appendChild(style);
}

export function useBrandFonts(): boolean {
  injectWebFontFace();
  const [loaded, error] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });
  // Web: never block the first paint — the @font-face above swaps in when ready.
  // Native: wait (fonts are bundled, so it's instant), but never block on a failure.
  return Platform.OS === 'web' || loaded || Boolean(error);
}
