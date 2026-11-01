import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useRef } from 'react';

import { parseCustomersParams } from './customersParams';

/**
 * Customers tab route params. They are sticky on a mounted tab, so they are cleared with the
 * screen's own navigation (scoped to this route key). router.setParams would hit whichever
 * route is focused at that moment, e.g. the destination after a blur.
 */
export function useCustomersParams() {
  const params = useLocalSearchParams<{ q?: string; pick?: string }>();
  // useNavigation() types params as undefined; this route's params are q/pick.
  const navigation = useNavigation() as unknown as {
    setParams: (p: { q?: string | undefined; pick?: string | undefined }) => void;
  };
  const navRef = useRef(navigation);
  navRef.current = navigation;

  useFocusEffect(
    useCallback(
      () => () => {
        navRef.current.setParams({ pick: undefined, q: undefined });
      },
      [],
    ),
  );

  const clearPick = useCallback(() => navRef.current.setParams({ pick: undefined }), []);
  return { ...parseCustomersParams(params), clearPick };
}
