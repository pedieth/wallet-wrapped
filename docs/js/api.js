// Tiny Blockscout v2 client. Uses global fetch (browser or Node 18+).
import { YEAR, isAddress } from './stats.js?v=5';

export const CHAINS = {
  eth: { name: 'Ethereum', symbol: 'ETH', guzzler: 0.25, base: 'https://eth.blockscout.com', explorer: 'https://eth.blockscout.com' },
  base: { name: 'Base', symbol: 'ETH', guzzler: 0.01, base: 'https://base.blockscout.com', explorer: 'https://base.blockscout.com' },
  arbitrum: { name: 'Arbitrum', symbol: 'ETH', guzzler: 0.01, base: 'https://arbitrum.blockscout.com', explorer: 'https://arbitrum.blockscout.com' },
  optimism: { name: 'Optimism', symbol: 'ETH', guzzler: 0.01, base: 'https://explorer.optimism.io', explorer: 'https://explorer.optimism.io' },
  polygon: { name: 'Polygon', symbol: 'POL', guzzler: 50, base: 'https://polygon.blockscout.com', explorer: 'https://polygon.blockscout.com' },
  robinhood: { name: 'Robinhood Chain', symbol: 'ETH', guzzler: 0.01, base: 'https://robinhoodchain.blockscout.com', explorer: 'https://robinhoodchain.blockscout.com' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimited extends Error {}

// fetch with a deadline; a dropped connection is retried like a 5xx instead of killing the whole recap
async function fetchT(url, ms = 15000, opts = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}

async function getJSON(url, { retries = 4 } = {}) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetchT(url, 15000, { headers: { accept: 'application/json' } });
    } catch (e) {
      if (i >= retries) throw new Error('the explorer did not answer (network error)');
      await sleep(Math.min(1500 * 2 ** i, 15000));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (i >= retries) {
        if (res.status === 429) throw new RateLimited('Blockscout rate limit hit');
        throw new Error(`Blockscout error ${res.status}`);
      }
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** i;
      await sleep(Math.min(wait, 15000));
      continue;
    }
    if (res.status === 404) return null;
    if (res.status === 403) throw new Error('the explorer refused the request (403, likely a Cloudflare bot check)');
    if (!res.ok) throw new Error(`Blockscout error ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('Blockscout returned a non-JSON response (possibly a bot check)');
    return res.json();
  }
}

/** Resolve an ENS name to an address, or validate a 0x address. */
/** Clean what people paste: "@Nick.ETH ", "nick" -> "nick.eth". Any dotted ENS name is allowed (.base.eth, .xyz, subnames). */
export function normalizeName(input) {
  let q = String(input || '').trim().replace(/^@/, '').replace(/\s+/g, '').replace(/[\u3002\uff0e\uff61]/g, '.').toLowerCase();
  if (!q || isAddress(q)) return q;
  if (!q.includes('.')) q += '.eth';
  return /^[^./]+(\.[^./]+)+$/.test(q) ? q : '';
}

async function viaResolver(url, pick) {
  const res = await fetchT(url, 8000, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const a = pick(await res.json());
  if (!isAddress(a)) throw new Error('no address');
  return a;
}

async function isContract(a) {
  try {
    const d = await getJSON(`${CHAINS.eth.base}/api/v2/addresses/${a}`, { retries: 1 });
    return d?.is_contract !== false;
  } catch { return true; } // unsure: safer to say "no wallet" than show someone else's year
}

export async function resolveAddress(input, chain = 'eth') {
  const raw = String(input || '').trim();
  if (isAddress(raw)) return raw;
  const name = normalizeName(raw);
  if (!name) return null;

  // ENS lives on mainnet; resolve there regardless of the selected chain.
  // Two independent resolvers race; the first real address wins (covers offchain names like *.base.eth).
  try {
    return await Promise.any([
      viaResolver(`https://api.ensideas.com/ens/resolve/${encodeURIComponent(name)}`, (d) => d && d.address),
      viaResolver(`https://api.ensdata.net/${encodeURIComponent(name)}`, (d) => d && d.address),
    ]);
  } catch { /* fall through to Blockscout */ }

  // Blockscout's name service (BENS). Names with no address record set still have an owner wallet:
  // use the wrapped owner, then the owner, so "name not found" only happens for names that really don't exist.
  try {
    const d = await getJSON(`https://bens.services.blockscout.com/api/v1/1/domains/${encodeURIComponent(name)}`, { retries: 1 });
    if (isAddress(d?.resolved_address?.hash)) return d.resolved_address.hash;
    // an owner that is a contract (a custody or "graveyard" contract, a vault) is not the person; never show its stats
    for (const a of [d?.wrapped_owner?.hash, d?.owner?.hash]) {
      if (isAddress(a) && !(await isContract(a))) return a;
    }
    return null;
  } catch { /* fall through */ }

  // Fallback: Blockscout search.
  const data = await getJSON(`${CHAINS.eth.base}/api/v2/search?q=${encodeURIComponent(name)}`);
  const hit = (data?.items || []).find((it) => it.type === 'ens_domain' && it.ens_info?.name?.toLowerCase() === name);
  const h = hit?.address_hash || hit?.address;
  return isAddress(h) && !(await isContract(h)) ? h : null;
}

/**
 * Walk a paginated list endpoint newest -> oldest until items are older than `year`
 * or `maxPages` is reached. Returns { items, complete }.
 */
export async function paginate(url, { year = YEAR, maxPages = 20, delay = 150, onPage } = {}) {
  const items = [];
  let params = null;
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(url);
    if (params) for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
    let data;
    try {
      data = await getJSON(u.toString());
    } catch (e) {
      if (e instanceof RateLimited) return { items, complete: false, rateLimited: true };
      // big wallets: keep what we already have instead of failing the whole recap
      if (items.length) return { items, complete: false };
      throw e;
    }
    const batch = data?.items || [];
    items.push(...batch);
    onPage?.(page + 1);
    const oldest = batch[batch.length - 1]?.timestamp;
    if (!data?.next_page_params || !batch.length) return { items, complete: true };
    if (oldest && oldest < `${year}-01-01`) return { items, complete: true };
    params = data.next_page_params;
    await sleep(delay);
  }
  return { items, complete: false };
}

/** Fetch everything the recap needs. onProgress(fraction, label). */
export async function fetchWalletData(address, chain = 'eth', { onProgress, maxPages = 40 } = {}) {
  const base = `${CHAINS[chain].base}/api/v2/addresses/${address}`;
  const plan = [
    ['sent', `${base}/transactions?filter=from`, maxPages, 'Reading your transactions'],
    ['all', `${base}/transactions`, Math.ceil(maxPages / 2), 'Counting everything that touched you'],
    ['transfers', `${base}/token-transfers?filter=from`, Math.ceil(maxPages / 2), 'Checking your tokens'],
  ];
  const total = plan.reduce((s, p) => s + p[2], 0);
  const seen = {};
  const tick = (key, n, label) => { seen[key] = n; const d = Object.values(seen).reduce((a, b) => a + b, 0); onProgress?.(Math.min(1, d / total), label); };
  onProgress?.(0, plan[0][3]);
  // the three lists come from different endpoints, so they load side by side
  const results = await Promise.all(plan.map(([key, url, pages, label]) =>
    paginate(url, { maxPages: pages, onPage: (n) => tick(key, n, label) }).then((r) => { tick(key, pages, label); return [key, r]; })));
  const out = Object.fromEntries(results);
  return {
    sentTxs: out.sent.items,
    sentComplete: out.sent.complete,
    allTxs: out.all.items,
    allComplete: out.all.complete,
    transfers: out.transfers.items,
    rateLimited: Object.values(out).some((r) => r.rateLimited),
  };
}
