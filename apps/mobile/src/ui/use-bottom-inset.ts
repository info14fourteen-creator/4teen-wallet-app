import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../theme/tokens';
import { FOOTER_NAV_RESERVED_SPACE, FOOTER_NAV_BOTTOM_OFFSET } from './footer-nav';

export function useBottomInset(extra: number = spacing[4]) {
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    return FOOTER_NAV_RESERVED_SPACE + FOOTER_NAV_BOTTOM_OFFSET + Math.max(insets.bottom, 6) + extra - 10;
  }, [extra, insets.bottom]);
}
