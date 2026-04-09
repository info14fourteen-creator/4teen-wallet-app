import * as SecureStore from 'expo-secure-store';

export const PASSCODE_KEY = 'fourteen_wallet_local_passcode_v1';
export const BIOMETRICS_KEY = 'fourteen_wallet_biometrics_enabled_v1';

let passcodeDraft = '';

export function setPasscodeDraft(value: string) {
  passcodeDraft = value;
}

export function getPasscodeDraft() {
  return passcodeDraft;
}

export function clearPasscodeDraft() {
  passcodeDraft = '';
}

export async function hasPasscode(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PASSCODE_KEY);
  return typeof stored === 'string' && stored.length === 6;
}

export async function savePasscode(value: string): Promise<void> {
  await SecureStore.setItemAsync(PASSCODE_KEY, value);
}

export async function getPasscode(): Promise<string | null> {
  return SecureStore.getItemAsync(PASSCODE_KEY);
}

export async function verifyPasscode(value: string): Promise<boolean> {
  const stored = await getPasscode();
  return stored === value;
}

export async function setBiometricsEnabled(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRICS_KEY, value ? '1' : '0');
}

export async function getBiometricsEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(BIOMETRICS_KEY);
  return stored === '1';
}
