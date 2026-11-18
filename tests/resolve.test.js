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
