import React, { createContext, useContext, useMemo } from 'react';

export type FooterTickerItem = {
  id: string;
  symbol: string;
  balanceLabel: string;
  logoUri?: string;
};

type WalletSessionContextValue = {
  hasWallet: boolean;
  footerTickerItems: FooterTickerItem[];
};

const WalletSessionContext = createContext<WalletSessionContextValue>({
  hasWallet: true,
  footerTickerItems: [],
});

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<WalletSessionContextValue>(() => {
    return {
      hasWallet: true,
      footerTickerItems: [],
    };
  }, []);

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
}

export function useWalletSession() {
  return useContext(WalletSessionContext);
}
