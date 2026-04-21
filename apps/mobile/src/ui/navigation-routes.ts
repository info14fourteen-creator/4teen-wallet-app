const ROUTES_WITHOUT_SHARED_NAVIGATION = new Set([
  '/',
  '/index',
  '/unlock',
  '/create-passcode',
  '/confirm-passcode',
  '/modal',
  '/ui-lab',
  '/wallet-access',
]);

const ROUTES_WITH_LOCAL_NAVIGATION = new Set([
  '/ui-shell-lab',
]);

const ROOT_SEGMENTS_WITHOUT_SHARED_NAVIGATION = new Set([
  'browser',
]);

function normalizePathname(pathname?: string | null) {
  if (!pathname) return '/';
  return pathname === '' ? '/' : pathname;
}

export function shouldRenderSharedNavigation(pathname?: string | null, rootSegment?: string | null) {
  const safePathname = normalizePathname(pathname);

  if (ROUTES_WITHOUT_SHARED_NAVIGATION.has(safePathname)) return false;
  if (ROUTES_WITH_LOCAL_NAVIGATION.has(safePathname)) return false;
  if (rootSegment && ROOT_SEGMENTS_WITHOUT_SHARED_NAVIGATION.has(rootSegment)) return false;

  return true;
}

export function shouldRenderLocalNavigation(pathname?: string | null) {
  return ROUTES_WITH_LOCAL_NAVIGATION.has(normalizePathname(pathname));
}

export function shouldHideFooterByRoute(pathname?: string | null) {
  return ROUTES_WITHOUT_SHARED_NAVIGATION.has(normalizePathname(pathname));
}
