import { getFullVersionString } from '../config/app-version';
import { getFourteenApiBaseUrls } from '../config/tron';
import { getLanguageLocaleTag } from '../i18n';
import { getActiveWallet } from './wallet/storage';

type ReportAppRuntimeErrorInput = {
  source: 'boundary' | 'global' | 'unhandledrejection';
  fatal: boolean;
  title: string;
  message: string;
  currentPath?: string;
  lastStablePath?: string;
  recentPaths?: string[];
  fingerprint?: string;
  details?: Record<string, unknown>;
  stack?: string | null;
  componentStack?: string | null;
};

class AppRuntimeApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AppRuntimeApiError';
    this.status = status;
  }
}

function normalizeValue(value: unknown) {
  return String(value || '').trim();
}

function sanitizeText(value: unknown, maxLength: number) {
  return normalizeValue(value)
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function maskAddress(address: string) {
  const safe = normalizeValue(address);

  if (!safe) {
    return '';
  }

  if (safe.length <= 14) {
    return safe;
  }

  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postRuntimeErrorJson<T>(baseUrl: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/ops/errors/app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await readJson(response);

  if (!response.ok || payload?.ok === false) {
    throw new AppRuntimeApiError(
      payload?.error || `App error request failed with status ${response.status}`,
      response.status
    );
  }

  return payload as T;
}

async function postAcrossApiOrigins<T>(body: Record<string, unknown>): Promise<T> {
  const origins = getFourteenApiBaseUrls();
  let lastError: unknown = null;

  for (const baseUrl of origins) {
    try {
      return await postRuntimeErrorJson<T>(baseUrl, body);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('App error request failed');
}

export async function reportAppRuntimeError(input: ReportAppRuntimeErrorInput) {
  const activeWallet = await getActiveWallet().catch(() => null);
  const title = sanitizeText(input.title, 120) || 'App runtime error';
  const message = sanitizeText(input.message, 500) || 'Unknown runtime error';
  const currentPath = sanitizeText(input.currentPath, 120) || 'unknown';
  const lastStablePath = sanitizeText(input.lastStablePath, 120) || 'unknown';
  const recentPaths = Array.isArray(input.recentPaths)
    ? input.recentPaths.map((item) => sanitizeText(item, 120)).filter(Boolean).slice(-6)
    : [];

  const payload = {
    source: input.source,
    fatal: input.fatal === true,
    title,
    message,
    currentPath,
    lastStablePath,
    recentPaths,
    appVersion: getFullVersionString(),
    walletAddressMasked: maskAddress(activeWallet?.address || ''),
    fingerprint:
      sanitizeText(input.fingerprint, 200) ||
      `${input.source}:${currentPath}:${title}:${message}`.slice(0, 200),
    details: {
      locale: getLanguageLocaleTag(),
      walletKind: activeWallet?.kind || null,
      stack: sanitizeText(input.stack, 4000) || null,
      componentStack: sanitizeText(input.componentStack, 4000) || null,
      ...((input.details && typeof input.details === 'object') ? input.details : {}),
    },
  };

  return postAcrossApiOrigins<{ ok?: boolean; result?: unknown }>(payload);
}
