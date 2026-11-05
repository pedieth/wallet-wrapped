import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRecap, persona, formatEth, addressLabel, isAddress, inYear, shareText,
} from '../docs/js/stats.js';

const ME = '0x1111111111111111111111111111111111111111';
const UNI = '0x2222222222222222222222222222222222222222';
const BOB = '0x3333333333333333333333333333333333333333';

const tx = (hash, ts, to, fee = '1000000000000000', from = ME, extra = {}) => ({
  hash, timestamp: ts, fee: { type: 'actual', value: fee },
  from: { hash: from }, to: { hash: to, ...extra },
});

test('isAddress / inYear', () => {
  assert.ok(isAddress(ME));
  assert.ok(!isAddress('0x123'));
  assert.ok(!isAddress('vitalik.eth'));
  assert.ok(inYear('2026-01-01T00:00:00.000000Z'));
  assert.ok(!inYear('2025-12-31T23:59:59.000000Z'));
});

test('formatEth', () => {
  assert.equal(formatEth('1000000000000000000'), '1');
  assert.equal(formatEth('1500000000000000000'), '1.5');
  assert.equal(formatEth('123456789000000000'), '0.1234');
  assert.equal(formatEth('0'), '0');
  assert.equal(formatEth('10'), '<0.0001');
});

test('addressLabel prefers name, then name tag, then ENS', () => {
  assert.equal(addressLabel({ name: 'UniswapV2Router02' }), 'UniswapV2Router02');
  assert.equal(addressLabel({ metadata: { tags: [{ tagType: 'generic', name: 'x' }, { tagType: 'name', name: 'Uniswap' }] } }), 'Uniswap');
  assert.equal(addressLabel({ ens_domain_name: 'bob.eth' }), 'bob.eth');
  assert.equal(addressLabel({ hash: BOB }), null);
});

test('computeRecap counts only this year and only fees the wallet paid', () => {
  const sent = [
    tx('0xa', '2026-03-02T10:00:00.000000Z', UNI, '0', ME, { name: 'Router', is_contract: true }),
    tx('0xb', '2026-03-02T12:00:00.000000Z', UNI),
    tx('0xc', '2026-03-09T12:00:00.000000Z', UNI),
    tx('0xd', '2026-07-01T12:00:00.000000Z', BOB),
    tx('0xe', '2025-12-31T23:00:00.000000Z', BOB), // last year, ignored
  ];
  sent[0].fee.value = '2000000000000000';
  const incoming = tx('0xf', '2026-04-01T00:00:00.000000Z', ME, '999000000000000000', BOB);
  const transfers = [
    { timestamp: '2026-03-02T10:00:00Z', token: { address_hash: '0xT1', symbol: 'USDC' } },
    { timestamp: '2026-03-02T11:00:00Z', token: { address_hash: '0xT1', symbol: 'USDC' } },
    { timestamp: '2026-05-02T11:00:00Z', token: { address_hash: '0xT2', symbol: 'WETH' } },
    { timestamp: '2025-05-02T11:00:00Z', token: { address_hash: '0xT3', symbol: 'OLD' } },
  ];
  const r = computeRecap({
    address: ME, sentTxs: sent, allTxs: [...sent, incoming], allComplete: true, sentComplete: true, transfers,
  });
  assert.equal(r.sentCount, 4);
  assert.equal(r.totalCount, 5);
  assert.equal(r.gasWei, '5000000000000000'); // incoming tx fee excluded
  assert.equal(r.gasEth, '0.005');
  assert.deepEqual(r.busiestDay, { date: '2026-03-02', count: 2 });
  assert.equal(r.busiestMonth.name, 'March');
  assert.equal(r.topCounterparty.label, 'Router');
  assert.equal(r.topCounterparty.count, 3);
  assert.deepEqual(r.topTokens.map((t) => t.symbol), ['USDC', 'WETH']);
  assert.equal(r.firstTx, '2026-03-02T10:00:00.000000Z');
  assert.equal(r.coveredFrom, null);
});

test('partial data: no first tx, coverage date, "+" counts', () => {
  const sent = [tx('0xa', '2026-09-02T10:00:00Z', UNI), tx('0xb', '2026-10-02T10:00:00Z', UNI)];
  const r = computeRecap({ address: ME, sentTxs: sent, allTxs: [], sentComplete: false, allComplete: false });
  assert.equal(r.firstTx, null);
  assert.equal(r.coveredFrom, '2026-09-02');
  assert.equal(r.totalCount, 2); // union with sent, never below sent
  assert.equal(r.totalComplete, false);
  const text = shareText(r, 'Ethereum', 'https://pedieth.github.io/wallet-wrapped/');
  assert.match(text, /2\+ transactions/);
  assert.match(text, />0\.002 ETH/);
});

test('empty wallet is a Ghost and hides stats', () => {
  const r = computeRecap({ address: ME, sentComplete: true, allComplete: true });
  assert.equal(r.persona.label, 'Ghost');
  assert.equal(r.busiestDay, null);
  assert.equal(r.topCounterparty, null);
  assert.deepEqual(r.topTokens, []);
});

test('persona rules are deterministic and ordered', () => {
  const base = { gasWei: '0', distinctTokens: 0, distinctCounterparties: 0 };
  assert.equal(persona({ ...base, sentCount: 600 }).label, 'Degen');
  assert.equal(persona({ ...base, sentCount: 250, distinctTokens: 20 }).label, 'Degen');
  assert.equal(persona({ ...base, sentCount: 50, gasWei: '300000000000000000' }).label, 'Gas Guzzler');
  assert.equal(persona({ ...base, sentCount: 50, distinctCounterparties: 30 }).label, 'Explorer');
  assert.equal(persona({ ...base, sentCount: 3 }).label, 'Diamond Hands');
  assert.equal(persona({ ...base, sentCount: 40, distinctTokens: 9 }).label, 'Token Collector');
  assert.equal(persona({ ...base, sentCount: 40 }).label, 'Steady Stacker');
});
