// Draws the 1080x1080 share card onto a canvas. Only stats that exist are drawn.
import { shortAddr } from './stats.js';

export function drawCard(canvas, r, { chainName, name } = {}) {
  const S = 1080;
  canvas.width = S; canvas.height = S;
  const c = canvas.getContext('2d');
  const font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  c.fillStyle = '#0b0614';
  c.fillRect(0, 0, S, S);
  const blob = (x, y, rad, color) => {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(11,6,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  };
  blob(180, 160, 620, 'rgba(255,61,139,.55)');
  blob(960, 900, 700, 'rgba(139,92,246,.55)');
  blob(950, 120, 420, 'rgba(34,211,238,.30)');

  const pad = 80;
  c.fillStyle = '#a99cc4';
  c.font = font(600, 30);
  c.fillText(`WALLET WRAPPED ${r.year} · ${chainName.toUpperCase()}`, pad, 120);

  c.fillStyle = '#f6f1ff';
  c.font = font(900, 64);
  c.fillText(name || shortAddr(r.address), pad, 200, S - pad * 2);

  // persona
  const grad = c.createLinearGradient(pad, 0, S - pad, 0);
  grad.addColorStop(0, '#ff3d8b'); grad.addColorStop(.5, '#8b5cf6'); grad.addColorStop(1, '#22d3ee');
  c.fillStyle = grad;
  c.font = font(900, 120);
  c.fillText(r.persona.label, pad, 350, S - pad * 2);

  const stats = [];
  if (r.totalCount) stats.push(['Transactions', `${r.totalCount.toLocaleString('en-US')}${r.totalComplete ? '' : '+'}`]);
  if (r.sentCount) stats.push(['Gas spent', `${r.sentComplete ? '' : '>'}${r.gasEth} ETH`]);
  if (r.busiestMonth) stats.push(['Busiest month', r.busiestMonth.name]);
  if (r.topTokens?.length) stats.push(['Top token', r.topTokens[0].symbol]);
  if (r.topCounterparty) stats.push(['Most used', r.topCounterparty.label || shortAddr(r.topCounterparty.hash)]);
  if (r.busiestDay) stats.push(['Busiest day', r.busiestDay.date]);

  const colW = (S - pad * 2 - 40) / 2;
  stats.slice(0, 6).forEach(([k, v], i) => {
    const x = pad + (i % 2) * (colW + 40);
    const y = 470 + Math.floor(i / 2) * 170;
    c.fillStyle = 'rgba(255,255,255,.06)';
    roundRect(c, x, y, colW, 140, 24); c.fill();
    c.fillStyle = '#a99cc4'; c.font = font(600, 26);
    c.fillText(k.toUpperCase(), x + 28, y + 50);
    c.fillStyle = '#f6f1ff'; c.font = font(850, 46);
    c.fillText(v, x + 28, y + 110, colW - 56);
  });

  c.fillStyle = '#a99cc4';
  c.font = font(600, 28);
  c.fillText('pedieth.github.io/wallet-wrapped', pad, S - 60);
  if (r.coveredFrom) {
    c.textAlign = 'right';
    c.fillText(`since ${r.coveredFrom}`, S - pad, S - 60);
    c.textAlign = 'left';
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
