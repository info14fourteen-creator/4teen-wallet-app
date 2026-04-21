import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

import { getInstallReferrerAsync } from '../../modules/install-referrer';

const REFERRAL_QUERY_PARAM = 'r';
const REFERRAL_STORAGE_KEY = 'fourteen_referral_record';
const REFERRAL_DEFERRED_CAPTURE_KEY = 'fourteen_referral_deferred_capture_v1';
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_ATTRIBUTION_URL =
  'https://fourteen-allocation-worker-6e0e920395d8.herokuapp.com/hooks/after-buy';

export type StoredReferralSource = 'query' | 'install-referrer' | 'pasteboard';

export type StoredReferralRecord = {
  slug: string;
  capturedAt: number;
  expiresAt: number;
  source: StoredReferralSource;
};

function normalizeSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
}

function isValidSlug(value: string) {
  return /^[a-z0-9_-]{3,24}$/.test(String(value || ''));
}

function normalizeUrl(input: string) {
  const value = String(input || '').trim();
  if (!value) return '';

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    return value;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return value.replace(':', '://');
  }

  return value;
}

function safeParseRecord(raw: string | null): StoredReferralRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredReferralRecord>;

    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.slug !== 'string') return null;
    if (typeof parsed.capturedAt !== 'number') return null;
    if (typeof parsed.expiresAt !== 'number') return null;
    if (
      parsed.source !== 'query' &&
      parsed.source !== 'install-referrer' &&
      parsed.source !== 'pasteboard'
    ) {
      return null;
    }

    const slug = normalizeSlug(parsed.slug);
    if (!isValidSlug(slug)) return null;

    return {
      slug,
      capturedAt: parsed.capturedAt,
      expiresAt: parsed.expiresAt,
      source: parsed.source,
    };
  } catch {
    return null;
  }
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readReferralSlugFromParams(input: string) {
  const query = String(input || '')
    .trim()
    .replace(/^[?#]/, '');

  if (!query) return null;

  const params = new URLSearchParams(query);
  const slug = normalizeSlug(
    params.get(REFERRAL_QUERY_PARAM) || params.get('ref') || params.get('referral') || ''
  );

  return isValidSlug(slug) ? slug : null;
}

export function readReferralSlugFromText(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const decodedCandidates = [normalized];
  let current = normalized;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = safeDecodeURIComponent(current);
    if (!next || next === current) {
      break;
    }

    decodedCandidates.push(next);
    current = next;
  }

  for (const candidate of decodedCandidates) {
    const directSlug = normalizeSlug(
      candidate
        .replace(/^fourteen-referral:/i, '')
        .replace(/^referral:/i, '')
        .replace(/^r=/i, '')
    );

    if (isValidSlug(directSlug)) {
      return directSlug;
    }

    const fromUrl = readReferralSlugFromUrl(candidate);
    if (fromUrl) {
      return fromUrl;
    }

    const fromParams = readReferralSlugFromParams(candidate);
    if (fromParams) {
      return fromParams;
    }
  }

  return null;
}

export function readReferralSlugFromUrl(url: string) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;

  try {
    const parsed = new URL(normalizedUrl);
    const slug = normalizeSlug(parsed.searchParams.get(REFERRAL_QUERY_PARAM) || '');
    return isValidSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

export async function getStoredReferral(now = Date.now()): Promise<StoredReferralRecord | null> {
  const raw = await AsyncStorage.getItem(REFERRAL_STORAGE_KEY);
  const record = safeParseRecord(raw);

  if (!record) {
    return null;
  }

  if (record.expiresAt <= now) {
    await AsyncStorage.removeItem(REFERRAL_STORAGE_KEY);
    return null;
  }

  return record;
}

export async function clearStoredReferral() {
  await AsyncStorage.multiRemove([REFERRAL_STORAGE_KEY, REFERRAL_DEFERRED_CAPTURE_KEY]);
}

export function formatReferralExpiry(expiresAt: number) {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return '—';
  }

  return new Date(expiresAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatReferralSourceLabel(source: StoredReferralSource) {
  if (source === 'install-referrer') {
    return 'Install Referrer';
  }

  if (source === 'pasteboard') {
    return 'Pasteboard';
  }

  return 'Open Link';
}

async function getDeferredCaptureAttempt() {
  const raw = await AsyncStorage.getItem(REFERRAL_DEFERRED_CAPTURE_KEY);
  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function markDeferredCaptureAttempt(now = Date.now()) {
  await AsyncStorage.setItem(REFERRAL_DEFERRED_CAPTURE_KEY, String(now));
}

export async function saveReferral(
  slug: string,
  now = Date.now(),
  source: StoredReferralSource = 'query'
) {
  const normalizedSlug = normalizeSlug(slug);

  if (!isValidSlug(normalizedSlug)) {
    return null;
  }

  const record: StoredReferralRecord = {
    slug: normalizedSlug,
    capturedAt: now,
    expiresAt: now + REFERRAL_TTL_MS,
    source,
  };

  await AsyncStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export async function captureReferralFromUrl(url: string, now = Date.now()) {
  const foundSlug = readReferralSlugFromUrl(url);

  if (!foundSlug) {
    return {
      foundSlug: null,
      status: null as 'stored' | 'kept-existing' | null,
      activeReferral: await getStoredReferral(now),
    };
  }

  const existing = await getStoredReferral(now);

  if (existing) {
    return {
      foundSlug,
      status: 'kept-existing' as const,
      activeReferral: existing,
    };
  }

  const record = await saveReferral(foundSlug, now, 'query');

  return {
    foundSlug,
    status: 'stored' as const,
    activeReferral: record,
  };
}

export async function captureDeferredReferral(now = Date.now()) {
  const existing = await getStoredReferral(now);

  if (existing) {
    return {
      foundSlug: existing.slug,
      status: 'kept-existing' as const,
      activeReferral: existing,
      attemptedAt: await getDeferredCaptureAttempt(),
    };
  }

  const attemptedAt = await getDeferredCaptureAttempt();
  if (attemptedAt) {
    return {
      foundSlug: null,
      status: 'already-attempted' as const,
      activeReferral: null,
      attemptedAt,
    };
  }

  let storedReferral: StoredReferralRecord | null = null;
  let foundSlug: string | null = null;

  const installReferrer = await getInstallReferrerAsync().catch(() => null);
  const installReferrerSlug = readReferralSlugFromText(installReferrer?.referrer || '');

  if (installReferrerSlug) {
    storedReferral = await saveReferral(installReferrerSlug, now, 'install-referrer');
    foundSlug = installReferrerSlug;
  }

  if (!storedReferral) {
    const clipboardText = await Clipboard.getStringAsync().catch(() => '');
    const clipboardSlug = readReferralSlugFromText(clipboardText);

    if (clipboardSlug) {
      storedReferral = await saveReferral(clipboardSlug, now, 'pasteboard');
      foundSlug = clipboardSlug;
    }
  }

  await markDeferredCaptureAttempt(now);

  return {
    foundSlug,
    status: storedReferral ? ('stored' as const) : ('not-found' as const),
    activeReferral: storedReferral,
    attemptedAt: now,
    platform: Platform.OS,
  };
}

export async function submitReferralAttribution(input: {
  txHash: string;
  buyerWallet: string;
}) {
  const txHash = String(input.txHash || '').trim();
  const buyerWallet = String(input.buyerWallet || '').trim();

  if (!txHash || !buyerWallet) {
    throw new Error('Attribution payload is incomplete.');
  }

  const referral = await getStoredReferral();

  if (!referral) {
    return {
      status: 'skipped-no-referral' as const,
      referralSlug: null,
      response: null,
    };
  }

  const response = await fetch(REFERRAL_ATTRIBUTION_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      txHash,
      buyerWallet,
      slug: referral.slug,
    }),
  });

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string' &&
      (data as { error: string }).error.trim()
        ? (data as { error: string }).error.trim()
        : `Attribution request failed with status ${response.status}`;

    throw new Error(message);
  }

  return {
    status: 'submitted' as const,
    referralSlug: referral.slug,
    response: {
      ok: true,
      status: response.status,
      data,
    },
  };
}
