import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress } from './address.ts';

test('normalizes Base58, TRON hex and event hex to the same address', () => {
  const wallet = 'TN95o1fsA7mNwJGYGedvf3y7DJZKLH6TCT';
  const hex = '41857fa6ff9cc8f786841596b2e915e78ecdc887e5';
  for (const input of [wallet, hex, hex.toUpperCase(), hex.slice(2), `0x${hex.slice(2)}`]) {
    assert.equal(normalizeAddress(input), wallet);
  }
  assert.equal(normalizeAddress('invalid'), '');
  assert.equal(normalizeAddress('0x123'), '');
});
