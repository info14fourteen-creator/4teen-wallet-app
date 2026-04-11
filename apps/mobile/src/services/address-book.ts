import * as SecureStore from 'expo-secure-store';

export type SavedContact = {
  id: string;
  name: string;
  address: string;
};

const STORAGE_KEY = 'fourteen_wallet_address_book_v3';

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

export async function listSavedContacts(): Promise<SavedContact[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SavedContact[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.address === 'string'
    );
  } catch (error) {
    console.error('Failed to load saved contacts:', error);
    return [];
  }
}

export async function getAddressBookMap(): Promise<Record<string, string>> {
  const contacts = await listSavedContacts();

  return contacts.reduce<Record<string, string>>((acc, item) => {
    const key = normalizeAddress(item.address);

    if (key) {
      acc[key] = item.name.trim();
    }

    return acc;
  }, {});
}
