import * as SecureStore from 'expo-secure-store';

export type RecentRecipient = {
  id: string;
  name: string;
  address: string;
  lastUsedAt: number;
};

const STORAGE_KEY = 'fourteen_wallet_recent_recipients_v1';
const MAX_RECIPIENTS = 8;

function sanitizeName(value: string) {
  return String(value || '').trim();
}

function sanitizeAddress(value: string) {
  return String(value || '').trim();
}

function normalizeAddress(value: string) {
  return sanitizeAddress(value).toLowerCase();
}

export async function listRecentRecipients(): Promise<RecentRecipient[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RecentRecipient[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.address === 'string' &&
          typeof item.lastUsedAt === 'number'
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch (error) {
    console.error('Failed to load recent recipients:', error);
    return [];
  }
}

export async function rememberRecentRecipient(input: {
  name?: string;
  address: string;
}): Promise<void> {
  const address = sanitizeAddress(input.address);
  if (!address) return;

  try {
    const current = await listRecentRecipients();
    const normalized = normalizeAddress(address);
    const existing = current.find((item) => normalizeAddress(item.address) === normalized);
    const now = Date.now();

    const nextEntry: RecentRecipient = {
      id: existing?.id || `${normalized}_${now}`,
      name: sanitizeName(input.name) || existing?.name || 'Recent recipient',
      address,
      lastUsedAt: now,
    };

    const next = [nextEntry, ...current.filter((item) => normalizeAddress(item.address) !== normalized)]
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_RECIPIENTS);

    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to store recent recipient:', error);
  }
}
