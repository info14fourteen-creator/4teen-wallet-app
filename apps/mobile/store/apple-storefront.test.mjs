import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE_CONFIG_PATH = resolve(MOBILE_ROOT, 'store.config.json');
const storeConfig = JSON.parse(readFileSync(STORE_CONFIG_PATH, 'utf8'));
const appleInfo = storeConfig.apple.info['en-US'];

test('keeps public iOS storefront copy accurate for wallet and read-only records', () => {
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

test('uses wallet and read-only record screenshots for the iOS storefront', () => {
  const screenshots = appleInfo.screenshots.APP_IPHONE_67;

  assert.equal(screenshots.length, 10);
  assert.ok(screenshots.some(screenshot => screenshot.endsWith('09-unlock-records.png')));
  assert.ok(screenshots.some(screenshot => screenshot.endsWith('10-ambassador-records.png')));

  for (const screenshot of screenshots) {
    assert.doesNotMatch(
      screenshot,
      /(?:direct[ -]?buy|swap|claim|withdraw|register)/i
    );
    assert.equal(existsSync(resolve(MOBILE_ROOT, screenshot)), true, screenshot);
  }
});

test('provides multiple in-app iPad screenshots for App Review', () => {
  const screenshots = appleInfo.screenshots.APP_IPAD_PRO_3GEN_129;

  assert.equal(screenshots.length, 9);
  for (const screenshot of screenshots) {
    assert.doesNotMatch(
      screenshot,
      /(?:direct[ -]?buy|swap|claim|withdraw|register)/i
    );
    assert.equal(existsSync(resolve(MOBILE_ROOT, screenshot)), true, screenshot);
  }
});

test('gives App Review an explicit iOS no-exchange statement', () => {
  const reviewNotes = storeConfig.apple.review.notes;

  assert.match(reviewNotes, /does not provide cryptocurrency exchange services/i);
  assert.match(reviewNotes, /token purchase or token issuance/i);
  assert.match(reviewNotes, /generic browser does not inject a wallet provider/i);
  assert.match(reviewNotes, /read-only/i);
  assert.match(reviewNotes, /ambassador/i);
  assert.doesNotMatch(reviewNotes, /features are absent from navigation/i);
  assert.doesNotMatch(reviewNotes, /10102022/);
});

test('preserves the approved unrestricted browser rating and matches the release version', () => {
  assert.equal(storeConfig.apple.advisory.unrestrictedWebAccess, true);
  const app = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'app.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf8'));
  assert.equal(storeConfig.apple.version, '1.0.6');
  assert.equal(app.expo.version, storeConfig.apple.version);
  assert.equal(pkg.version, storeConfig.apple.version);
});
