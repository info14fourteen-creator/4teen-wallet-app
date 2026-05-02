import { Platform } from 'react-native';

import { getVersionString } from '../config/app-version';
import { FOURTEEN_API_BASE_URL, getFourteenApiBaseUrls } from '../config/tron';

type AppReleasePayload = {
  ok?: boolean;
  latestVersion?: string | null;
  minSupportedVersion?: string | null;
  updateUrl?: string | null;
  ios?: {
    latestVersion?: string | null;
    minSupportedVersion?: string | null;
    updateUrl?: string | null;
  } | null;
  android?: {
    latestVersion?: string | null;
    minSupportedVersion?: string | null;
    updateUrl?: string | null;
  } | null;
};

export type AppReleaseCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  updateUrl: string;
  hasUpdate: boolean;
  isBelowMinimum: boolean;
};

function normalizeVersion(value: string | null | undefined) {
  const next = String(value || '').trim();
  return next || null;
}

function normalizeUrl(value: string | null | undefined) {
  const next = String(value || '').trim();
  return next || FOURTEEN_API_BASE_URL.replace(/^https:\/\/api\./, 'https://');
}

function parseVersionParts(version: string) {
  const match = String(version || '')
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function compareVersions(left: string, right: string) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);

  if (!a || !b) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }

  return 0;
}

function pickPlatformPayload(payload: AppReleasePayload) {
  if (Platform.OS === 'ios') {
    return payload.ios || payload;
  }

  if (Platform.OS === 'android') {
    return payload.android || payload;
  }

  return payload;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Version check failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function checkForAppUpdate(): Promise<AppReleaseCheckResult> {
  const currentVersion = getVersionString();
  const urls = getFourteenApiBaseUrls().map((baseUrl) => `${baseUrl}/app-version`);

  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const payload = await fetchJson<AppReleasePayload>(url);
      const platformPayload = pickPlatformPayload(payload);
      const latestVersion = normalizeVersion(platformPayload.latestVersion || payload.latestVersion);
      const minSupportedVersion = normalizeVersion(
        platformPayload.minSupportedVersion || payload.minSupportedVersion || latestVersion
      );
      const updateUrl = normalizeUrl(platformPayload.updateUrl || payload.updateUrl);

      return {
        currentVersion,
        latestVersion,
        minSupportedVersion,
        updateUrl,
        hasUpdate: latestVersion ? compareVersions(currentVersion, latestVersion) < 0 : false,
        isBelowMinimum: minSupportedVersion ? compareVersions(currentVersion, minSupportedVersion) < 0 : false,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Version check failed');
    }
  }

  throw lastError || new Error('Version check failed');
}
