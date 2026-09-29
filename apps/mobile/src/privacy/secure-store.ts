import * as NativeStore from 'expo-secure-store';
import { guardedWrite } from './deletion-barrier';
export { getItemAsync } from 'expo-secure-store';

export function setItemAsync(key: string, value: string, options?: NativeStore.SecureStoreOptions) {
  return guardedWrite(() => NativeStore.setItemAsync(key, value, options));
}

export function deleteItemAsync(key: string, options?: NativeStore.SecureStoreOptions) {
  return guardedWrite(() => NativeStore.deleteItemAsync(key, options));
}
