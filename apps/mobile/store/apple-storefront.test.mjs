import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE_CONFIG_PATH = resolve(MOBILE_ROOT, 'store.config.json');
const storeConfig = JSON.parse(readFileSync(STORE_CONFIG_PATH, 'utf8'));
const appleInfo = storeConfig.apple.info['en-US'];

test('keeps public iOS storefront copy wallet-only', () => {
  const publicCopy = [
    appleInfo.title,
    appleInfo.subtitle,
    appleInfo.promoText,
    appleInfo.description,
    ...(appleInfo.keywords ?? []),
  ].join('\n');

  assert.doesNotMatch(
    publicCopy,
    /\b(?:direct[ -]?buy|swap|exchange|dex|liquidity routing|token issuance)\b/i
  );
  assert.match(publicCopy, /self-custody TRON wallet/i);
});

test('uses only wallet screenshots for the iOS storefront', () => {
  const screenshots = appleInfo.screenshots.APP_IPHONE_67;

  assert.equal(screenshots.length, 8);

  for (const screenshot of screenshots) {
    assert.doesNotMatch(
      screenshot,
      /(?:direct[ -]?buy|swap|liquidity|unlock|airdrop|ambassador|protocol)/i
    );
    assert.equal(existsSync(resolve(MOBILE_ROOT, screenshot)), true, screenshot);
  }
});

test('provides multiple in-app iPad screenshots for App Review', () => {
  const screenshots = appleInfo.screenshots.APP_IPAD_PRO_3GEN_129;

  assert.ok(screenshots.length >= 4);
  for (const screenshot of screenshots) {
    assert.doesNotMatch(
      screenshot,
      /(?:direct[ -]?buy|swap|liquidity|unlock|airdrop|ambassador|protocol)/i
    );
    assert.equal(existsSync(resolve(MOBILE_ROOT, screenshot)), true, screenshot);
  }
});

test('gives App Review an explicit iOS no-exchange statement', () => {
  const reviewNotes = storeConfig.apple.review.notes;

  assert.match(reviewNotes, /does not provide cryptocurrency exchange services/i);
  assert.match(reviewNotes, /token purchase or token issuance/i);
  assert.match(reviewNotes, /generic browser does not inject a wallet provider/i);
  assert.match(reviewNotes, /169 countries or regions/i);
});
