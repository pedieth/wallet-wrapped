import { CHAINS, resolveAddress, fetchWalletData } from './api.js';
import { computeRecap, shareText, shortAddr, isAddress } from './stats.js';
import { drawCard } from './card.js';

const SITE = 'https://pedieth.github.io/wallet-wrapped/';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fmt = (n) => Number(n).toLocaleString('en-US');

function show(id) {
  for (const el of ['#start', '#loading', '#story']) $(el).hidden = el !== id;
}

function fail(msg) {
  show('#start');
  $('#error').textContent = msg;
  $('#error').hidden = false;
}

async function run(input, chain) {
  $('#error').hidden = true;
  show('#loading');
  $('#load-label').textContent = 'Finding wallet…';
  $('#bar-fill').style.width = '0%';
  try {
    const address = await resolveAddress(input, chain);
    if (!address) return fail('That doesn\'t look like a 0x address or an ENS name we could resolve.');
    const name = isAddress(input) ? null : input.trim();

    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('address', name || address);
    url.searchParams.set('chain', chain);
    history.replaceState(null, '', url);

    const data = await fetchWalletData(address, chain, {
      onProgress: (f, label) => {
        $('#load-label').textContent = label;
        $('#bar-fill').style.width = `${Math.round(f * 100)}%`;
      },
    });
    const recap = computeRecap({ address, ...data, symbol: CHAINS[chain].symbol, guzzler: CHAINS[chain].guzzler });
    renderStory(recap, { chain, name, rateLimited: data.rateLimited, shareUrl: url.toString() });
  } catch (e) {
    console.error(e);
    fail(`Couldn't load data from Blockscout: ${e.message}. Give it a minute and try again.`);
  }
}

function slidesFor(r, ctx) {
  const chainName = CHAINS[ctx.chain].name;
  const who = ctx.name || shortAddr(r.address);
  const partial = r.coveredFrom ? `<p class="sub">Big wallet! Based on activity from ${esc(r.coveredFrom)} onward — older ${r.year} history wasn't loaded.</p>` : '';
  const s = [];

  s.push({ a: '#ff3d8b', b: '#8b5cf6', html: `
    <p class="eyebrow">${esc(chainName)} · ${r.year}</p>
    <p class="mid">${esc(who)}</p>
    <p class="hero grad">Your year,<br>wrapped.</p>
    <p class="sub">Tap or swipe →</p>` });

  if (r.totalCount) {
    s.push({ a: '#8b5cf6', b: '#22d3ee', html: `
      <p class="eyebrow">Transactions</p>
      <p class="big">${fmt(r.totalCount)}${r.totalComplete ? '' : '+'}</p>
      <p>transactions touched this wallet in ${r.year}${r.sentCount ? `, ${fmt(r.sentCount)}${r.sentComplete ? '' : '+'} of them sent by you` : ''}.</p>
      ${r.firstTx ? `<p class="sub">Your first move of the year: ${esc(new Date(r.firstTx).toUTCString().slice(0, 16))}.</p>` : ''}
      ${partial}` });
  }

  if (r.sentCount) {
    s.push({ a: '#f59e0b', b: '#ff3d8b', html: `
      <p class="eyebrow">Gas</p>
      <p class="big">${r.sentComplete ? '' : '>'}${esc(r.gasEth)}</p>
      <p>${esc(r.symbol || 'ETH')} burned on fees across ${fmt(r.sentCount)}${r.sentComplete ? '' : '+'} transactions you sent.</p>
      ${partial}` });
  }

  if (r.busiestDay && r.busiestMonth) {
    const day = new Date(`${r.busiestDay.date}T00:00:00Z`).toUTCString().slice(0, 16);
    s.push({ a: '#22d3ee', b: '#10b981', html: `
      <p class="eyebrow">Busiest</p>
      <p class="mid">${esc(r.busiestMonth.name)}</p>
      <p>was your month — ${fmt(r.busiestMonth.count)} transactions sent.</p>
      <p class="mid">${esc(day)}</p>
      <p>was your wildest day: ${fmt(r.busiestDay.count)} txs. Active on ${fmt(r.activeDays)} days total.</p>
      ${partial}` });
  }

  if (r.topTokens.length) {
    s.push({ a: '#10b981', b: '#8b5cf6', html: `
      <p class="eyebrow">Top tokens you moved</p>
      <ul class="list">${r.topTokens.map((t, i) => `<li><b>${i + 1}</b>${esc(t.symbol)}<small>${fmt(t.count)} transfers</small></li>`).join('')}</ul>
      <p class="sub">${fmt(r.distinctTokens)} different tokens sent this year.</p>` });
  }

  if (r.topCounterparty) {
    const cp = r.topCounterparty;
    const link = `${CHAINS[ctx.chain].explorer}/address/${cp.hash}`;
    s.push({ a: '#8b5cf6', b: '#ff3d8b', html: `
      <p class="eyebrow">Your go-to ${cp.isContract ? 'contract' : 'address'}</p>
      <p class="mid"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(cp.label || shortAddr(cp.hash))}</a></p>
      <p>${fmt(cp.count)} transactions sent its way. Out of ${fmt(r.distinctCounterparties)} places you interacted with.</p>` });
  }

  const text = shareText(r, chainName, ctx.shareUrl.startsWith(SITE) ? ctx.shareUrl : SITE);
  s.push({ a: '#ff3d8b', b: '#22d3ee', share: true, html: `
    <p class="eyebrow">Your ${r.year} persona</p>
    <p class="mid grad">${esc(r.persona.label)}</p>
    <p class="sub">${esc(r.persona.blurb)}</p>
    <canvas id="card" width="1080" height="1080"></canvas>
    <div class="actions">
      <button class="btn ghost" id="share" type="button" hidden>Share image</button>
      <a class="btn ghost" id="dl" download="wallet-wrapped-${r.year}.png" href="#">Download PNG</a>
      <a class="btn" id="tweet" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}">Share on X</a>
    </div>
    <a class="hint" href="./">↺ Try another wallet</a>` });
  return s;
}

function renderStory(r, ctx) {
  const slides = slidesFor(r, ctx);
  $('#slides').innerHTML = slides.map((s) =>
    `<article class="slide" style="--a:${s.a};--b:${s.b}">${s.html}</article>`).join('');
  $('#dots').innerHTML = slides.map(() => '<i></i>').join('');
  show('#story');

  const canvas = $('#card');
  drawCard(canvas, r, { chainName: CHAINS[ctx.chain].name, name: ctx.name });
  $('#dl').addEventListener('click', (e) => {
    e.currentTarget.href = canvas.toDataURL('image/png');
  });

  // Native share sheet with the actual image, where the browser supports it.
  const toFile = () => new Promise((res) => canvas.toBlob(
    (b) => res(b && new File([b], `wallet-wrapped-${r.year}.png`, { type: 'image/png' })), 'image/png'));
  const shareBtn = $('#share');
  const probe = typeof File !== 'undefined' && new File([], 'x.png', { type: 'image/png' });
  if (navigator.canShare && probe && navigator.canShare({ files: [probe] })) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', async () => {
      const file = await toFile();
      if (!file) return;
      const url = ctx.shareUrl.startsWith(SITE) ? ctx.shareUrl : SITE;
      try {
        await navigator.share({ files: [file], text: shareText(r, CHAINS[ctx.chain].name, url) });
      } catch { /* user dismissed */ }
    });
  }

  const els = [...document.querySelectorAll('.slide')];
  const dots = [...document.querySelectorAll('#dots i')];
  let i = 0;
  const go = (n) => {
    i = Math.max(0, Math.min(els.length - 1, n));
    els.forEach((el, k) => el.classList.toggle('active', k === i));
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
  };
  go(0);
  window.wrapped = { go, count: els.length, recap: r };

  $('#prev').onclick = () => go(i - 1);
  $('#next').onclick = () => go(i + 1);
  document.onkeydown = (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(i - 1);
  };
  $('#slides').onclick = (e) => {
    if (e.target.closest('a, button, canvas')) return;
    go(e.clientX < window.innerWidth / 3 ? i - 1 : i + 1);
  };
  let x0 = null;
  $('#slides').ontouchstart = (e) => { x0 = e.touches[0].clientX; };
  $('#slides').ontouchend = (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { e.preventDefault(); go(dx < 0 ? i + 1 : i - 1); }
    x0 = null;
  };
}

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  run(fd.get('address'), fd.get('chain'));
});

// shareable links: ?address=0x...&chain=eth
const params = new URLSearchParams(location.search);
const chainParam = CHAINS[params.get('chain')] ? params.get('chain') : 'eth';
document.querySelector(`input[name=chain][value=${chainParam}]`).checked = true;
if (params.get('address')) {
  $('#addr').value = params.get('address');
  run(params.get('address'), chainParam);
}
