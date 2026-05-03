type RuntimeRouteContext = {
  currentPath: string;
  lastStablePath: string;
  recentPaths: string[];
  hasWallet: boolean;
  activeWalletKind: string | null;
};

export type RuntimeRecoveryEvent = {
  source: 'boundary' | 'global';
  fatal: boolean;
  currentPath: string;
  lastStablePath: string;
  recentPaths: string[];
  targetPath: string;
  name: string;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  triggeredAtIso: string;
};

const DEFAULT_ROUTE_CONTEXT: RuntimeRouteContext = {
  currentPath: '/',
  lastStablePath: '/',
  recentPaths: ['/'],
  hasWallet: false,
  activeWalletKind: null,
};

let routeContext: RuntimeRouteContext = { ...DEFAULT_ROUTE_CONTEXT };
const listeners = new Set<(event: RuntimeRecoveryEvent) => void>();

function normalizePath(value: unknown) {
  const safe = String(value || '').trim();
  return safe || '/';
}

function normalizeRecentPaths(paths: unknown, fallback: string[]) {
  if (!Array.isArray(paths)) {
    return fallback;
  }

  const next = paths
    .map((item) => normalizePath(item))
    .filter(Boolean)
    .slice(-6);

  return next.length > 0 ? next : fallback;
}

export function getRuntimeRouteContext() {
  return routeContext;
}

export function updateRuntimeRouteContext(next: Partial<RuntimeRouteContext>) {
  routeContext = {
    ...routeContext,
    ...next,
    currentPath: normalizePath(next.currentPath ?? routeContext.currentPath),
    lastStablePath: normalizePath(next.lastStablePath ?? routeContext.lastStablePath),
    recentPaths: normalizeRecentPaths(next.recentPaths ?? routeContext.recentPaths, routeContext.recentPaths),
    hasWallet: typeof next.hasWallet === 'boolean' ? next.hasWallet : routeContext.hasWallet,
    activeWalletKind:
      next.activeWalletKind === undefined ? routeContext.activeWalletKind : next.activeWalletKind,
  };
}

export function pushRuntimePath(path: string) {
  const nextPath = normalizePath(path);
  const previous = routeContext.recentPaths.filter((item) => item !== nextPath);
  updateRuntimeRouteContext({
    currentPath: nextPath,
    recentPaths: [...previous, nextPath].slice(-6),
  });
}

export function resolveRecoveryPath(context = routeContext) {
  const currentPath = normalizePath(context.currentPath);
  const lastStablePath = normalizePath(context.lastStablePath);

  if (lastStablePath && lastStablePath !== currentPath && lastStablePath !== '/unlock') {
    return lastStablePath;
  }

  if (!context.hasWallet) {
    return '/wallet-access';
  }

  return '/wallet';
}

export function subscribeRuntimeRecovery(listener: (event: RuntimeRecoveryEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRuntimeRecovery(
  input: Omit<RuntimeRecoveryEvent, 'targetPath'> & { targetPath?: string }
) {
  const event: RuntimeRecoveryEvent = {
    ...input,
    targetPath: normalizePath(input.targetPath || resolveRecoveryPath()),
    currentPath: normalizePath(input.currentPath),
    lastStablePath: normalizePath(input.lastStablePath),
    recentPaths: normalizeRecentPaths(input.recentPaths, routeContext.recentPaths),
  };

  for (const listener of listeners) {
    listener(event);
  }
}
