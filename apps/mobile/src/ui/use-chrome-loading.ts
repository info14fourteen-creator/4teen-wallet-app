import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';

import { useWalletSession } from '../wallet/wallet-session';

export default function useChromeLoading(active: boolean) {
  const isFocused = useIsFocused();
  const { setChromeLoaderVisible } = useWalletSession();

  useEffect(() => {
    const nextVisible = Boolean(active && isFocused);
    setChromeLoaderVisible(nextVisible);

    return () => {
      if (nextVisible) {
        setChromeLoaderVisible(false);
      }
    };
  }, [active, isFocused, setChromeLoaderVisible]);
}
