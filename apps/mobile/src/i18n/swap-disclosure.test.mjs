import test from 'node:test';
import assert from 'node:assert/strict';

import { SWAP_DISCLOSURE_SLICES } from './swap-disclosure-slices.ts';

const languages = ['ru', 'uz', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ar', 'hi', 'ja', 'zh-CN', 'ko'];
const keys = [
  'Swap via SUN.io',
  'SUN.io is an independent third-party decentralized protocol.',
  '4TEEN does not operate SUN.io, act as your counterparty, or take custody of your assets.',
  'You review and sign every blockchain transaction with your own wallet.',
  'THIRD-PARTY PROTOCOL',
  'SMART ROUTER',
  'View contract on Tronscan',
  'Protected minimum',
  'Network / resource estimate',
  'Review transaction',
  'Sign transaction',
];

test('SUN.io disclosure has a localized value in every supported non-English language', () => {
  for (const language of languages) {
    const dictionary = SWAP_DISCLOSURE_SLICES[language];
    assert.ok(dictionary, `missing ${language} dictionary`);

    for (const key of keys) {
      assert.ok(dictionary[key], `missing ${language}: ${key}`);
      if (key !== 'Swap via SUN.io') {
        assert.notEqual(dictionary[key], key, `untranslated ${language}: ${key}`);
      }
    }
  }
});
