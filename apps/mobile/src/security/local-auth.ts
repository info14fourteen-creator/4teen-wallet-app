import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

export const PASSCODE_KEY = 'fourteen_wallet_local_passcode_v1';
export const BIOMETRICS_KEY = 'fourteen_wallet_biometrics_enabled_v1';
export const AUTO_LOCK_MODE_KEY = 'fourteen_wallet_auto_lock_mode_v1';
export const DEFAULT_AUTO_LOCK_MODE = '1m';

export type AutoLockMode = 'disabled' | '15s' | '1m' | '5m' | 'never';

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
  const mode = await getAutoLockMode();

  if (mode === 'disabled') {
    await setAutoLockMode(DEFAULT_AUTO_LOCK_MODE);
  }
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

export async function removePasscode(): Promise<void> {
  await SecureStore.deleteItemAsync(PASSCODE_KEY);
}

export async function setAutoLockMode(value: AutoLockMode): Promise<void> {
  await SecureStore.setItemAsync(AUTO_LOCK_MODE_KEY, value);
}

export async function getAutoLockMode(): Promise<AutoLockMode> {
  const stored = await SecureStore.getItemAsync(AUTO_LOCK_MODE_KEY);

  if (
    stored === 'disabled' ||
    stored === '15s' ||
    stored === '1m' ||
    stored === '5m' ||
    stored === 'never'
  ) {
    return stored;
  }

  return DEFAULT_AUTO_LOCK_MODE;
}

export function getAutoLockModeLabel(mode: AutoLockMode): string {
  switch (mode) {
    case 'disabled':
      return 'Off';
    case '15s':
      return '15 sec';
    case '1m':
      return '1 min';
    case '5m':
      return '5 min';
    case 'never':
      return 'Never';
    default:
      return '1 min';
  }
}

export function getAutoLockDelayMs(mode: AutoLockMode): number | null {
  switch (mode) {
    case '15s':
      return 15_000;
    case '1m':
      return 60_000;
    case '5m':
      return 300_000;
    case 'disabled':
    case 'never':
    default:
      return null;
  }
}

export async function disableWalletProtection(): Promise<void> {
  await Promise.all([
    removePasscode(),
    setBiometricsEnabled(false),
    setAutoLockMode('disabled'),
  ]);
}

export type BiometricsStatus = {
  enabled: boolean;
  compatible: boolean;
  enrolled: boolean;
  available: boolean;
  label: string;
};

export async function getBiometricsStatus(): Promise<BiometricsStatus> {
  const [enabled, compatible, enrolled, supported] = await Promise.all([
    getBiometricsEnabled(),
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  let label = 'Biometrics';

  if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    label = 'Face ID';
  } else if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    label = 'Fingerprint';
  }

  return {
    enabled,
    compatible,
    enrolled,
    available: compatible && enrolled,
    label,
  };
}
