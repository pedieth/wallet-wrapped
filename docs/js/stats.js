// Pure functions that turn Blockscout API items into recap stats.
// No DOM, no fetch — so they run the same in the browser and under `node --test`.

export const YEAR = 2026;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function isAddress(s) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(s || '').trim());
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

const lc = (s) => String(s || '').toLowerCase();

// "2026-03-14T09:26:59.000000Z" -> "2026-03-14" (UTC)
export function utcDay(ts) {
  return String(ts || '').slice(0, 10);
}

export function inYear(ts, year = YEAR) {
  return utcDay(ts).startsWith(`${year}-`);
}

export function monthName(m) {
  return MONTHS[m - 1] || '';
}

// Best human label Blockscout gives us for an address object.
export function addressLabel(a) {
  if (!a) return null;
  if (a.name) return a.name;
  const tags = a.metadata?.tags || [];
  const named = tags.find((t) => t.tagType === 'name') || tags.find((t) => t.tagType === 'protocol');
  if (named?.name) return named.name;
  if (a.ens_domain_name) return a.ens_domain_name;
  if (a.public_tags?.[0]?.display_name) return a.public_tags[0].display_name;
  if (a.public_tags?.[0]?.label) return a.public_tags[0].label;
  return null;
}

// wei (string|bigint) -> ETH string with up to `dp` decimals
export function formatEth(wei, dp = 4) {
  const w = BigInt(wei || 0);
  const whole = w / 10n ** 18n;
  const frac = (w % 10n ** 18n).toString().padStart(18, '0').slice(0, dp).replace(/0+$/, '');
  if (whole === 0n && !frac && w > 0n) return `<0.${'0'.repeat(dp - 1)}1`;
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

/**
 * Build the recap.
 * @param {object} input
 * @param {string} input.address
 * @param {object[]} input.sentTxs     transactions with from == address (Blockscout v2 items)
 * @param {object[]} input.allTxs      all transactions (in + out), may be partial
 * @param {boolean} input.allComplete  true if allTxs reached Jan 1 (exact count)
 * @param {boolean} input.sentComplete true if sentTxs reached Jan 1
 * @param {object[]} input.transfers   token transfers the wallet initiated
 */
export function computeRecap({ address, sentTxs = [], allTxs = [], allComplete = false,
  sentComplete = false, transfers = [], year = YEAR }) {
  const me = lc(address);
  const sent = sentTxs.filter((t) => inYear(t.timestamp, year) && lc(t.from?.hash) === me);
  // sent txs are a subset of all txs; union by hash so a capped "all" list never undercounts
  const allHashes = new Set();
  for (const t of [...allTxs, ...sent]) if (inYear(t.timestamp, year)) allHashes.add(lc(t.hash));

  // gas: only fees the wallet itself paid
  let gasWei = 0n;
  for (const t of sent) gasWei += BigInt(t.fee?.value || 0);

  const byDay = new Map();
  const byMonth = new Map();
  const counterparties = new Map();
  const labels = new Map();
  for (const t of sent) {
    const d = utcDay(t.timestamp);
    byDay.set(d, (byDay.get(d) || 0) + 1);
    const m = Number(d.slice(5, 7));
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
    const to = t.to?.hash;
    if (to && lc(to) !== me) {
      const k = lc(to);
      counterparties.set(k, (counterparties.get(k) || 0) + 1);
      if (!labels.has(k)) labels.set(k, { hash: to, label: addressLabel(t.to), isContract: !!t.to?.is_contract });
    }
  }

  const tokens = new Map();
  const tokenMeta = new Map();
  for (const tr of transfers) {
    if (!inYear(tr.timestamp, year) || !tr.token) continue;
    const k = lc(tr.token.address_hash || tr.token.address);
    tokens.set(k, (tokens.get(k) || 0) + 1);
    if (!tokenMeta.has(k)) tokenMeta.set(k, { symbol: tr.token.symbol || tr.token.name || shortAddr(k), name: tr.token.name || null });
  }

  const firstTx = sent.length && sentComplete
    ? sent.map((t) => t.timestamp).sort()[0]
    : null;

  const [busiestDay] = topN(byDay, 1);
  const [busiestMonth] = topN(byMonth, 1);
  const [topCp] = topN(counterparties, 1);

  const recap = {
    year,
    address,
    sentCount: sent.length,
    sentComplete,
    totalCount: allHashes.size,
    totalComplete: allComplete && sentComplete,
    // when we stopped paginating before Jan 1, stats only cover this day onward
    coveredFrom: sentComplete || !sent.length ? null : utcDay(sent.map((t) => t.timestamp).sort()[0]),
    gasWei: gasWei.toString(),
    gasEth: formatEth(gasWei),
    activeDays: byDay.size,
    busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    busiestMonth: busiestMonth ? { month: busiestMonth[0], name: monthName(busiestMonth[0]), count: busiestMonth[1] } : null,
    topTokens: topN(tokens, 3).map(([k, count]) => ({ address: k, ...tokenMeta.get(k), count })),
    distinctTokens: tokens.size,
    topCounterparty: topCp ? { ...labels.get(topCp[0]), count: topCp[1] } : null,
    distinctCounterparties: counterparties.size,
    firstTx,
  };
  recap.persona = persona(recap);
  return recap;
}

/**
 * Deterministic persona from the recap. First matching rule wins.
 */
export function persona(r) {
  const gas = Number(formatEth(r.gasWei || 0, 6).replace('<', ''));
  const sent = r.sentCount || 0;
  if (sent === 0) return { label: 'Ghost', blurb: 'Not a single outgoing tx this year. Silent, patient, unbothered.' };
  if (sent >= 500 || (sent >= 200 && r.distinctTokens >= 15)) return { label: 'Degen', blurb: 'You clicked "confirm" more than most people blink.' };
  if (gas >= 0.25) return { label: 'Gas Guzzler', blurb: 'Validators thank you for your service.' };
  if (r.distinctCounterparties >= 25) return { label: 'Explorer', blurb: 'New contract, who dis? You got around.' };
  if (sent <= 10) return { label: 'Diamond Hands', blurb: 'Barely moved. Conviction or a lost seed phrase — we won\'t ask.' };
  if (r.distinctTokens >= 8) return { label: 'Token Collector', blurb: 'A little bit of everything in that bag.' };
  return { label: 'Steady Stacker', blurb: 'Consistent, deliberate, on-chain when it counts.' };
}

// Text for the X intent. Only includes stats that exist.
export function shareText(r, chainName, url) {
  const lines = [`My ${r.year} Wallet Wrapped on ${chainName}:`];
  if (r.totalCount) lines.push(`• ${r.totalCount}${r.totalComplete ? '' : '+'} transactions`);
  if (r.sentCount) lines.push(`• ${r.sentComplete ? '' : '>'}${r.gasEth} ETH spent on gas`);
  if (r.busiestMonth) lines.push(`• Busiest month: ${r.busiestMonth.name}`);
  if (r.topTokens?.length) lines.push(`• Top token: ${r.topTokens[0].symbol}`);
  lines.push(`Persona: ${r.persona.label}`);
  if (r.coveredFrom) lines.push(`(stats since ${r.coveredFrom})`);
  lines.push('', url);
  return lines.join('\n');
}
