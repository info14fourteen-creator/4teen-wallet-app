import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from './model.ts';

test('formats token units without rounding away small balances or large integers', () => {
  assert.equal(model.formatUnits('245000'), '0.245');
  assert.equal(model.formatUnits('0'), '0');
  assert.equal(model.formatUnits('1'), '0.000001');
  assert.equal(model.formatUnits('9007199254740993000001'), '9007199254740993.000001');
  for (const missing of [undefined, null, '', 'NaN', '-1']) {
    assert.equal(model.formatUnits(missing), '—');
  }
});

test('received history excludes other wallets and invalid events, preserving separate logs', () => {
  const wallet = 'T-my-public-wallet';
  const event = {transaction_id:'a'.repeat(64), block_timestamp:1000, event_index:0, result:{to:wallet,amount:'1000000'}};
  const rows = model.historyRows('airdrop', wallet, [event, event, {...event,event_index:1}, {...event,result:{to:'other',amount:'5'}}, {...event,transaction_id:'bad'}], value=>value);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, '1');
  assert.equal(rows[0].timestamp, 1000);
});

test('unlock timestamps derive from confirmed purchase events with 14-day lock', () => {
  const rows = model.historyRows('unlock', 'wallet', [{transaction_id:'b'.repeat(64),block_timestamp:1000,result:{buyer:'wallet',amountTokens:'1234567'}}], value=>value);
  assert.equal(rows[0].amount, '1.234567');
  assert.equal(rows[0].unlockAt, 1209601000);
});
