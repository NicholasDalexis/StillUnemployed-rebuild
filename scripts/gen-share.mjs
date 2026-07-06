// Pre-generate a static share page + Post-it OG image per active job.
// Output: /j/<slug>.html (Open Graph stub → redirects to the board) and /j/og/<slug>.png.
// Run: node scripts/gen-share.mjs   (regenerate whenever the board changes)
// Cost model: pure static files on Netlify (no serverless functions).
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
const CSV = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&headers=1&_=${Date.now()}`;
// Base URL: on a Netlify branch/preview deploy use that deploy's own domain so the
// OG image/URL resolve there; fall back to production.
const SITE = process.env.DEPLOY_PRIME_URL || process.env.URL || 'https://stillunemployed.com';

// deterministic short slug from the apply link — MUST match app.js suSlug()
function slugOf(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
const b64 = (s) => Buffer.from(unescape(encodeURIComponent(s)), 'binary').toString('base64');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
  if (f.length || row.length) { row.push(f); rows.push(row); } return rows;
}

function drawCard(job) {
  const W = 1200, H = 630, cv = createCanvas(W, H), ctx = cv.getContext('2d');
  ctx.fillStyle = '#EDE6D4'; ctx.fillRect(0, 0, W, H);
  // post-it
  const x = 120, y = 70, w = W - 240, h = H - 140, r = 22;
  ctx.save(); ctx.translate(W/2, H/2); ctx.rotate(-0.015); ctx.translate(-W/2, -H/2);
  ctx.shadowColor = 'rgba(44,33,24,0.28)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#F6E24B';
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#2C2118'; ctx.textBaseline = 'top';
  const px = x + 60;
  ctx.font = '900 62px sans-serif'; ctx.fillText(String(job.co || '').slice(0, 24), px, y + 56);
  ctx.font = '600 34px sans-serif'; ctx.fillStyle = '#3A2E20'; ctx.fillText(String(job.role || '').slice(0, 42), px, y + 140);
  ctx.font = '900 64px sans-serif'; ctx.fillStyle = '#2C2118'; if (job.pay) ctx.fillText(String(job.pay), px, y + 210);
  ctx.font = '500 30px sans-serif'; ctx.fillStyle = '#4A3B28'; ctx.fillText([job.loc, job.style, job.exp].filter(Boolean).join('   ·   ').slice(0, 52), px, y + 300);
  ctx.font = 'italic 700 38px serif'; ctx.fillStyle = '#B23A1E'; ctx.fillText('★ stillunemployed.com', px, y + h - 118);
  ctx.font = 'italic 500 26px serif'; ctx.fillStyle = '#6F5E45'; ctx.fillText("roles I'd actually apply to", px, y + h - 66);
  ctx.restore();
  return cv.toBuffer('image/png');
}

function stub(job, slug) {
  const url = `/jobs.html?job=${b64(job.link)}`;
  const img = `${SITE}/j/og/${slug}.png`;
  const title = `${job.role || 'A role'} at ${job.co || 'a great company'}`;
  const desc = [job.pay, job.loc].filter(Boolean).join(' · ') + ' — found on StillUnemployed.com';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} — StillUnemployed.com</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="StillUnemployed.com">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${SITE}/j/${slug}.html">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${url}">
<script>location.replace(${JSON.stringify(url)});</script>
</head><body style="font-family:sans-serif;padding:40px;color:#2C2118;">Taking you to the job on StillUnemployed.com…</body></html>`;
}

// Sheet data: from a local CSV path arg (sandbox can't reach Google), else fetch live.
// Never fail the whole deploy if the sheet is briefly unreachable.
let text;
try { text = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await fetch(CSV).then(r => r.text()); }
catch (e) { console.error('gen-share: could not load sheet, skipping share-page build (', e.message, ')'); process.exit(0); }
const rows = parseCSV(text);
const head = rows[0].map(s => s.trim().toLowerCase());
const col = (n) => head.indexOf(n);
const iCo = col('company'), iRole = col('job title'), iLink = col('link'), iLoc = col('location'),
      iType = col('type'), iPay = col('salary'), iExp = col('years of experience'), iAct = col('active/dead');

const outHtml = join(ROOT, 'j'), outImg = join(ROOT, 'j', 'og');
if (existsSync(outHtml)) rmSync(outHtml, { recursive: true, force: true });
mkdirSync(outImg, { recursive: true });

let n = 0;
for (let i = 1; i < rows.length; i++) {
  const c = rows[i]; if (!c) continue;
  const g = (k) => (k >= 0 && c[k] != null) ? String(c[k]).trim() : '';
  const co = g(iCo), role = g(iRole), link = g(iLink);
  if ((!co && !role) || !link) continue;
  if (g(iAct).toLowerCase().includes('dead')) continue;
  const job = { co, role, link, loc: g(iLoc), style: g(iType), pay: g(iPay), exp: g(iExp) };
  const slug = slugOf(link);
  writeFileSync(join(outImg, slug + '.png'), drawCard(job));
  writeFileSync(join(outHtml, slug + '.html'), stub(job, slug));
  n++;
}
console.log('generated', n, 'share pages + images into /j');
