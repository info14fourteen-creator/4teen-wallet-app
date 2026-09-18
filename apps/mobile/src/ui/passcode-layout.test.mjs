import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPasscodeContentInsets,
  getPasscodeLayoutMode,
} from './passcode-layout.ts';

test('uses regular spacing for tall phone and tablet portrait viewports', () => {
  assert.equal(getPasscodeLayoutMode(834, 1194), 'regular');
  assert.equal(getPasscodeLayoutMode(390, 844), 'regular');
});

test('uses compact spacing for phone and tablet landscape viewports', () => {
  assert.equal(getPasscodeLayoutMode(1194, 834), 'compact');
  assert.equal(getPasscodeLayoutMode(844, 390), 'compact');
});

test('uses compact spacing on short portrait viewports', () => {
  assert.equal(getPasscodeLayoutMode(600, 700), 'compact');
});

test('uses only safe-area spacing on chrome-hidden passcode routes', () => {
  assert.deepEqual(getPasscodeContentInsets(24, 20, 'regular'), {
    contentPaddingTop: 38,
    actionPaddingBottom: 36,
  });
  assert.deepEqual(getPasscodeContentInsets(24, 20, 'compact'), {
    contentPaddingTop: 32,
    actionPaddingBottom: 28,
  });
});
