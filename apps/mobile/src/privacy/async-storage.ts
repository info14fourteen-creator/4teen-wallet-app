import NativeStorage from '@react-native-async-storage/async-storage';
import { guardedWrite } from './deletion-barrier';

// Reads remain available to deletion verification. Normal writes are suspended
// only after an explicitly confirmed deletion and resume on the final reload.
const storage: typeof NativeStorage = {
  ...NativeStorage,
  setItem: (key, value) => guardedWrite(() => NativeStorage.setItem(key, value)),
  removeItem: key => guardedWrite(() => NativeStorage.removeItem(key)),
  multiSet: pairs => guardedWrite(() => NativeStorage.multiSet(pairs)),
  multiRemove: keys => guardedWrite(() => NativeStorage.multiRemove(keys)),
  mergeItem: (key, value) => guardedWrite(() => NativeStorage.mergeItem(key, value)),
  multiMerge: pairs => guardedWrite(() => NativeStorage.multiMerge(pairs)),
  clear: () => guardedWrite(() => NativeStorage.clear()),
};
export default storage;
