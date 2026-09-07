import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBrowserAddressLabel,
  getReadableDomain,
  normalizeBrowserUrl,
  shouldOpenExternally,
} from './browser-url.ts';

test('opens the browser home without loading an external website when no URL is provided', () => {
  assert.equal(normalizeBrowserUrl(undefined), null);
  assert.equal(normalizeBrowserUrl(''), null);
  assert.equal(normalizeBrowserUrl('   '), null);
  assert.equal(getBrowserAddressLabel(null, 'Browser'), 'Browser');
});

test('normalizes typed domains while preserving supported URL schemes', () => {
  assert.equal(normalizeBrowserUrl('tronscan.org'), 'https://tronscan.org');
  assert.equal(normalizeBrowserUrl(['https://4teen.me']), 'https://4teen.me');
  assert.equal(normalizeBrowserUrl('mailto:genesis@4teen.me'), 'mailto:genesis@4teen.me');
  assert.equal(normalizeBrowserUrl('tronlinkoutside://pull.activity'), 'tronlinkoutside://pull.activity');
});

test('keeps external-only schemes out of the embedded webview', () => {
  assert.equal(shouldOpenExternally('mailto:genesis@4teen.me'), true);
  assert.equal(shouldOpenExternally('tel:+998957920287'), true);
  assert.equal(shouldOpenExternally('sms:+998957920287'), true);
  assert.equal(shouldOpenExternally('intent://scan/#Intent;scheme=zxing;end'), true);
  assert.equal(shouldOpenExternally('https://4teen.me'), false);
});

test('formats the address label from the active URL', () => {
  assert.equal(getReadableDomain('https://www.tronscan.org/#/address/TN95', 'Browser'), 'tronscan.org');
  assert.equal(getBrowserAddressLabel('https://4teen.me/support', 'Browser'), '4teen.me');
});
