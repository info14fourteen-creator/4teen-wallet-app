import assert from 'node:assert/strict';
import test from 'node:test';

import { getCameraPermissionCopy } from './camera-permission-copy.ts';

test('uses a neutral continuation action before the iOS camera permission request', () => {
  const requestedKeys = [];
  const translate = (key) => {
    requestedKeys.push(key);
    return `[${key}]`;
  };

  const copy = getCameraPermissionCopy(translate);

  assert.deepEqual(copy, {
    title: '[Camera access required]',
    body: '[Allow camera access to scan wallet addresses and QR codes.]',
    actionLabel: '[Continue]',
  });
  assert.deepEqual(requestedKeys, [
    'Camera access required',
    'Allow camera access to scan wallet addresses and QR codes.',
    'Continue',
  ]);
});
