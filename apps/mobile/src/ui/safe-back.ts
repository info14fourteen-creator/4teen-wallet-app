type RouterLike = {
  back: () => void;
  replace: (href: any) => void;
  canGoBack?: () => boolean;
};

const PATH_FALLBACKS: Record<string, string> = {
  '/add-custom-token': '/manage-crypto',
  '/address-book': '/send',
  '/ambassador-confirm': '/ambassador-program',
  '/ambassador-program': '/wallet',
  '/ambassador-withdraw-confirm': '/ambassador-program',
  '/appearance': '/settings',
  '/authentication-method': '/settings',
  '/backup-private-key': '/wallet',
  '/browser': '/wallet',
  '/buy': '/wallet',
  '/buy-4teen': '/wallet',
  '/buy-confirm': '/buy',
  '/connections': '/wallet',
  '/create-wallet': '/wallet-access',
  '/currency': '/settings',
  '/earn': '/wallet',
  '/home': '/wallet',
  '/import-private-key': '/import-wallet',
  '/import-seed': '/import-wallet',
  '/import-wallet': '/wallet-access',
  '/import-watch-only': '/import-wallet',
  '/language': '/settings',
  '/liquidity-confirm': '/liquidity-controller',
  '/liquidity-controller': '/wallet',
  '/manage-crypto': '/wallet',
  '/multisig-transactions': '/wallet',
  '/scan': '/wallet',
  '/select-wallet': '/wallet',
  '/send': '/wallet',
  '/send-confirm': '/send',
  '/settings': '/wallet',
  '/swap': '/wallet',
  '/swap-confirm': '/swap',
  '/terms': '/about',
  '/token-details': '/wallet',
  '/unlock-timeline': '/wallet',
  '/wallet-manager': '/wallet',
  '/wallets': '/wallet',
  '/whitepaper': '/about',
};

function normalizePathname(pathname?: string | null) {
  if (!pathname) return '/';
  return pathname === '' ? '/' : pathname;
}

export function resolveBackFallback(pathname?: string | null, fallback?: string) {
  if (fallback) return fallback;
  return PATH_FALLBACKS[normalizePathname(pathname)] || '/wallet';
}

export function goBackOrReplace(
  router: RouterLike,
  options?: { pathname?: string | null; fallback?: string }
) {
  if (typeof router.canGoBack === 'function' && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(resolveBackFallback(options?.pathname, options?.fallback) as any);
}
