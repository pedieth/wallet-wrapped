// Run the real recap from the command line, same code the site uses.
// usage: node scripts/recap.mjs <address|name.eth> [eth|base|arbitrum|optimism|polygon|gnosis]
import { resolveAddress, fetchWalletData, CHAINS } from '../docs/js/api.js';
import { computeRecap } from '../docs/js/stats.js';

const [input = 'vitalik.eth', chain = 'eth'] = process.argv.slice(2);
if (!CHAINS[chain]) throw new Error(`unknown chain ${chain}`);

const address = await resolveAddress(input, chain);
if (!address) throw new Error(`could not resolve ${input}`);
console.error(`${input} -> ${address} on ${CHAINS[chain].name}`);

const data = await fetchWalletData(address, chain, {
  onProgress: (f, label) => process.stderr.write(`\r${label.padEnd(40)} ${Math.round(f * 100)}%`),
});
process.stderr.write('\n');
console.error(`fetched: ${data.sentTxs.length} sent, ${data.allTxs.length} all, ${data.transfers.length} transfers`);

const recap = computeRecap({ address, ...data, symbol: CHAINS[chain].symbol, guzzler: CHAINS[chain].guzzler });
console.log(JSON.stringify(recap, null, 2));
