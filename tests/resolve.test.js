// Guards for ENS input and big-wallet fixes (2026-11-18). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeName } from '../docs/js/api.js';
const api = readFileSync(new URL('../docs/js/api.js', import.meta.url), 'utf8');
test('ENS input is cleaned and any dotted name is allowed', () => {
  assert.equal(normalizeName(' @Nick.ETH '), 'nick.eth');
  assert.equal(normalizeName('brantly'), 'brantly.eth');
  assert.equal(normalizeName('jesse.base.eth'), 'jesse.base.eth');
  assert.equal(normalizeName('name.xyz'), 'name.xyz');
});
test('two ENS resolvers race, then Blockscout', () => {
  assert.match(api, /Promise\.any\(\[/);
  assert.match(api, /api\.ensdata\.net/);
});
test('big wallets keep partial data instead of failing', () => {
  assert.match(api, /if \(items\.length\) return \{ items, complete: false \}/);
  assert.match(api, /function fetchT\(/);
});
test('lists load in parallel', () => assert.match(api, /await Promise\.all\(plan\.map/));
test('names with no address record fall back to the BENS owner (2026-11-20)', () => {
  assert.match(api, /bens\.services\.blockscout\.com\/api\/v1\/1\/domains/);
  assert.match(api, /\[d\?\.wrapped_owner\?\.hash, d\?\.owner\?\.hash\]/);
});
test('Gnosis stays removed, Robinhood stays in (2026-11-20)', () => {
  assert.doesNotMatch(api, /gnosis/i);
  assert.match(api, /robinhoodchain\.blockscout\.com/);
});
test('a contract owner (e.g. ENS Graveyard 0xDa02…B7F6) is never used as the wallet (2026-11-20)', () => {
  assert.match(api, /!\(await isContract\(a\)\)/);
  assert.match(api, /is_contract !== false/);
});
