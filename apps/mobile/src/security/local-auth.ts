import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

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
