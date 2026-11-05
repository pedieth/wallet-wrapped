# Wallet Wrapped

Spotify Wrapped, but for your wallet. Paste an address (or an ENS name), pick Ethereum or Base, and flip through your 2026 on-chain year: transactions, gas burned, busiest day and month, the tokens you moved most, the contract you kept going back to, and a persona. The last slide is a share card you can download or post.

Site: https://pedieth.github.io/wallet-wrapped/ (once Pages is enabled)

It's a static page. No backend, no wallet connect, no API keys.

## How it works

Everything runs in the browser against the public [Blockscout](https://www.blockscout.com/) v2 API (`eth.blockscout.com`, `base.blockscout.com`):

- `/addresses/{addr}/transactions?filter=from` — txs you sent. Gas, busiest day/month, top counterparty and first tx come from these.
- `/addresses/{addr}/transactions` — everything that touched the address, for the total count.
- `/addresses/{addr}/token-transfers?filter=from` — tokens you sent, for the top-tokens slide. Using only outgoing transfers keeps airdrop spam out.
- `/search?q=name.eth` — ENS lookup.

Lists are walked newest to oldest until they cross Jan 1 2026 (UTC) or hit a page cap (20 pages for sent txs, 10 for the others, 50 items each). Requests are spaced out and 429s back off and retry. If a cap is hit before Jan 1, the recap says so: counts get a `+`, gas gets a `>`, and the first-tx stat is dropped instead of guessed. Slides with nothing to show are skipped.

All the number crunching lives in `docs/js/stats.js` as pure functions, so it's easy to test and reuse.

Persona rules (first match wins): Ghost (no sent txs) → Degen (500+ sent, or 200+ with 15+ tokens) → Gas Guzzler (≥0.25 ETH gas) → Explorer (25+ distinct counterparties) → Diamond Hands (≤10 sent) → Token Collector (8+ tokens) → Steady Stacker.

Shareable links: `?address=0x…&chain=eth` (or `chain=base`, or an ENS name as the address).

## Run locally

```sh
npx serve docs
# or
python3 -m http.server -d docs 8000
```

Tests (Node 18+):

```sh
node --test
```

Print a recap in the terminal with the same code:

```sh
node scripts/recap.mjs vitalik.eth eth
```

## Layout

```
docs/            the site (GitHub Pages serves this)
  index.html
  css/style.css
  js/stats.js    pure stats + persona logic
  js/api.js      Blockscout client, pagination, retries
  js/card.js     share card canvas
  js/app.js      UI and slides
tests/           node:test specs for stats.js
scripts/         CLI recap
```

## Deploy

Push to `main`. `.github/workflows/pages.yml` runs the tests and publishes `docs/` to Pages (set Settings → Pages → Source to "GitHub Actions"). Or skip the workflow and point Pages at the `/docs` folder on `main`.

## Caveats

- Very active wallets won't be fully covered by the page caps; the recap shows how far back it got.
- Gas is the fee field Blockscout reports for txs the address sent. Sponsored/relayed txs where someone else paid don't count.
- Base's Blockscout sits behind Cloudflare, which occasionally challenges requests. If that happens, try again later.

## Credits

Data from [Blockscout](https://www.blockscout.com/). Built by [pedieth](https://github.com/pedieth) · [@Pedi_eth](https://x.com/Pedi_eth).

MIT
