import { getFullVersionString } from '../config/app-version';
import { getFourteenApiBaseUrls } from '../config/tron';
import { getLanguageLocaleTag } from '../i18n';
import { getActiveWallet } from './wallet/storage';

export type AppFeedbackType = 'issue' | 'confusing' | 'slow' | 'idea' | 'praise';

type SubmitAppFeedbackInput = {
  type: AppFeedbackType;
  title: string;
  message: string;
  sourceScreen?: string;
  details?: Record<string, unknown>;
};

class AppFeedbackApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AppFeedbackApiError';
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

async function postFeedbackJson<T>(baseUrl: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/ops/feedback/app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);

  if (!response.ok || payload?.ok === false) {
    throw new AppFeedbackApiError(
      payload?.error || `Feedback request failed with status ${response.status}`,
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
      return await postFeedbackJson<T>(baseUrl, body);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Feedback request failed');
}

export async function submitAppFeedback(input: SubmitAppFeedbackInput) {
  const activeWallet = await getActiveWallet().catch(() => null);
  const title = sanitizeText(input.title, 120);
  const message = sanitizeText(input.message, 500);
  const sourceScreen = sanitizeText(input.sourceScreen, 80);

  const payload = {
    type: input.type,
      title: title || 'Wallet feedback',
      message: message || 'User submitted feedback from the wallet.',
      sourceScreen: sourceScreen || 'unknown',
      appVersion: getFullVersionString(),
      walletAddressMasked: maskAddress(activeWallet?.address || ''),
      details: {
      locale: getLanguageLocaleTag(),
        walletKind: activeWallet?.kind || null,
        ...((input.details && typeof input.details === 'object') ? input.details : {}),
      },
  };

  return postAcrossApiOrigins<{ ok?: boolean; result?: unknown }>(payload);
}
