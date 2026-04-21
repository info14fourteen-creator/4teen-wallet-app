// eslint-disable-next-line import/no-unresolved
import { requireOptionalNativeModule } from 'expo-modules-core';

export type InstallReferrerPayload = {
  referrer: string | null;
  installBeginTimestampSeconds: number | null;
  referrerClickTimestampSeconds: number | null;
};

type NativeInstallReferrerModule = {
  getInstallReferrerAsync(): Promise<InstallReferrerPayload | null>;
};

const nativeModule =
  requireOptionalNativeModule<NativeInstallReferrerModule>('FourteenInstallReferrer');

export async function getInstallReferrerAsync(): Promise<InstallReferrerPayload | null> {
  if (!nativeModule) {
    return null;
  }

  return nativeModule.getInstallReferrerAsync();
}
