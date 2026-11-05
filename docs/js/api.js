// Tiny Blockscout v2 client. Uses global fetch (browser or Node 18+).
import { YEAR, isAddress } from './stats.js';

export const CHAINS = {
  eth: { name: 'Ethereum', base: 'https://eth.blockscout.com', explorer: 'https://eth.blockscout.com' },
  base: { name: 'Base', base: 'https://base.blockscout.com', explorer: 'https://base.blockscout.com' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimited extends Error {}

async function getJSON(url, { retries = 4 } = {}) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
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

/** Resolve an ENS name via Blockscout search, or validate a 0x address. */
export async function resolveAddress(input, chain = 'eth') {
  const q = String(input || '').trim();
  if (isAddress(q)) return q;
  if (!/\.eth$/i.test(q)) return null;
  // ENS lives on mainnet; resolve there regardless of the selected chain
  const data = await getJSON(`${CHAINS.eth.base}/api/v2/search?q=${encodeURIComponent(q)}`);
  const hit = (data?.items || []).find((it) => it.type === 'ens_domain' && it.ens_info?.name?.toLowerCase() === q.toLowerCase());
  return hit?.address_hash || hit?.address || null;
}

/**
 * Walk a paginated list endpoint newest -> oldest until items are older than `year`
 * or `maxPages` is reached. Returns { items, complete }.
 */
export async function paginate(url, { year = YEAR, maxPages = 20, delay = 300, onPage } = {}) {
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
export async function fetchWalletData(address, chain = 'eth', { onProgress, maxPages = 20 } = {}) {
  const base = `${CHAINS[chain].base}/api/v2/addresses/${address}`;
  const plan = [
    ['sent', `${base}/transactions?filter=from`, maxPages, 'Reading your transactions'],
    ['all', `${base}/transactions`, Math.ceil(maxPages / 2), 'Counting everything that touched you'],
    ['transfers', `${base}/token-transfers?filter=from`, Math.ceil(maxPages / 2), 'Checking your tokens'],
  ];
  const total = plan.reduce((s, p) => s + p[2], 0);
  let done = 0;
  const out = {};
  for (const [key, url, pages, label] of plan) {
    onProgress?.(done / total, label);
    const r = await paginate(url, {
      maxPages: pages,
      onPage: (n) => onProgress?.((done + n) / total, label),
    });
    done += pages; // count skipped pages as done so the bar ends at 100%
    out[key] = r;
    onProgress?.(done / total, label);
  }
  return {
    sentTxs: out.sent.items,
    sentComplete: out.sent.complete,
    allTxs: out.all.items,
    allComplete: out.all.complete,
    transfers: out.transfers.items,
    rateLimited: Object.values(out).some((r) => r.rateLimited),
  };
}
