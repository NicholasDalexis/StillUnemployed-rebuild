// Pre-generate a static share page + Post-it OG image per active job, PER THEME.
// Output: /j/<theme>/<slug>.html (Open Graph stub -> redirects to the board)
//         /j/og/<theme>/<slug>.png (the Post-it card, themed to match the board look)
// Themes rendered: original, poker (Casino), girly — the 3 live "Change Look?" looks.
// The shared link the app hands out already carries the viewer's current theme, so the
// iMessage/preview thumbnail matches the exact card they were looking at (color + pay tier).
// Run: node scripts/gen-share.mjs [localCsvPath]
// Cost model: pure static files on Netlify (no serverless functions, no per-share cost).
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
const CSV = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&headers=1&_=${Date.now()}`;
// Base URL: on a Netlify branch/preview deploy use that deploy's own domain so the
// OG image/URL resolve there; fall back to production.
const SITE = process.env.DEPLOY_PRIME_URL || process.env.URL || 'https://stillunemployed.com';

// ---- Fonts: use the real board faces so the card reads handmade, not like a plain box.
// Registered from @fontsource woff2 (bundled in node_modules). Graceful if missing.
function reg(p, fam) { try { GlobalFonts.registerFromPath(join(ROOT, p), fam); } catch (e) {} }
reg('node_modules/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2', 'SUBlack');
reg('node_modules/@fontsource/indie-flower/files/indie-flower-latin-400-normal.woff2', 'SUHand');
reg('node_modules/@fontsource/archivo/files/archivo-latin-400-normal.woff2', 'SUBody');
reg('node_modules/@fontsource/archivo/files/archivo-latin-500-normal.woff2', 'SUBody');
reg('node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2', 'SUBody');
const F_BLACK = "'SUBlack', Archivo, sans-serif";
const F_HAND = "'SUHand', 'Comic Sans MS', cursive";
const F_BODY = "'SUBody', Archivo, sans-serif";

// ---- Theme palettes (per pay tier), copied to match app.js render() exactly.
// Tiers: high = $100K+ (or no pay), mid = $80-99K, low = <$80K.
const DEF_LOW = ['#ECDEC6', '#E0D0B2'];
const DEF_MID = ['#E0CBA2', '#D3BB8C'];
const THEMES = {
  original: {
    back: '#E6DCC6',
    high: { bg: ['#F6E85F', '#EFDB3D'], ink: '#2A2118', apply: '#B23A1E', stamp: '#3A2A1B' },
    mid:  { bg: DEF_MID, ink: '#3A2A1B', apply: '#C0432A', stamp: '#3A2A1B' },
    low:  { bg: DEF_LOW, ink: '#3A2A1B', apply: '#C0432A', stamp: '#3A2A1B' }
  },
  poker: {
    back: '#123D26',
    high: { bg: ['#26262B', '#101014'], ink: '#E9D9A6', apply: '#D4AF37', stamp: '#D4AF37' },
    mid:  { bg: ['#1F6B3A', '#155229'], ink: '#EAF6E4', apply: '#FFD98A', stamp: '#F2E7C8' },
    low:  { bg: ['#FFFFFF', '#F1ECDE'], ink: '#23242C', apply: '#C0303A', stamp: '#23242C' }
  },
  girly: {
    back: '#F7D9EC',
    high: { bg: ['#FF77BC', '#F23E98'], ink: '#3A0E26', apply: '#3A0E26', stamp: '#3A0E26' },
    mid:  { bg: DEF_MID, ink: '#3A2A1B', apply: '#C0432A', stamp: '#3A2A1B' },
    low:  { bg: DEF_LOW, ink: '#3A2A1B', apply: '#C0432A', stamp: '#3A2A1B' }
  }
};
const THEME_KEYS = Object.keys(THEMES);

function payTier(pay) {
  if (!pay) return 'high';
  const nums = (String(pay).match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return 'high';
  const top = Math.max.apply(null, nums);
  if (top >= 100) return 'high';
  if (top >= 80) return 'mid';
  return 'low';
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw one job as a themed Post-it note (1200x630 for OG).
function drawCard(job, themeKey) {
  const T = THEMES[themeKey] || THEMES.original;
  const P = T[payTier(job.pay)];
  const W = 1200, H = 630, cv = createCanvas(W, H), ctx = cv.getContext('2d');

  // 1) Surface behind the note (felt / corkboard / paper) with a soft vignette.
  ctx.fillStyle = T.back; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // 2) The note, tilted a touch like it was stuck on by hand.
  const x = 120, y = 74, w = W - 240, h = H - 148, r = 16;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(-0.017); ctx.translate(-W / 2, -H / 2);

  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(20,14,8,0.34)'; ctx.shadowBlur = 46; ctx.shadowOffsetY = 24;
  ctx.fillStyle = P.bg[1];
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();

  // paper gradient (lighter top -> base bottom) for a real note, not a flat box
  const pg = ctx.createLinearGradient(0, y, 0, y + h);
  pg.addColorStop(0, P.bg[0]); pg.addColorStop(1, P.bg[1]);
  ctx.fillStyle = pg;
  roundRect(ctx, x, y, w, h, r); ctx.fill();

  // subtle top sheen + bottom "peel" shading so it lifts off the surface
  const sheen = ctx.createLinearGradient(0, y, 0, y + 90);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; roundRect(ctx, x, y, w, h, r); ctx.fill();
  const peel = ctx.createLinearGradient(0, y + h - 120, 0, y + h);
  peel.addColorStop(0, 'rgba(0,0,0,0)'); peel.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = peel; roundRect(ctx, x, y, w, h, r); ctx.fill();

  // lifted bottom-right corner curl
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x + w - 66, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - 66); ctx.closePath();
  ctx.shadowColor = 'rgba(20,14,8,0.30)'; ctx.shadowBlur = 18; ctx.shadowOffsetX = -6; ctx.shadowOffsetY = -6;
  const curl = ctx.createLinearGradient(x + w - 66, y + h, x + w, y + h - 66);
  curl.addColorStop(0, hexToRgba(P.bg[1], 0.9)); curl.addColorStop(1, P.bg[0]);
  ctx.fillStyle = curl; ctx.fill();
  ctx.restore();

  // 3) A strip of tape across the top-center.
  ctx.save();
  ctx.translate(W / 2, y - 2); ctx.rotate(-0.05);
  ctx.fillStyle = 'rgba(240,236,222,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  roundRect(ctx, -118, -26, 236, 52, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; roundRect(ctx, -118, -26, 236, 16, 4); ctx.fill();
  ctx.restore();

  // 4) Text.
  const px = x + 62;
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.ink;
  ctx.font = `64px ${F_BLACK}`; ctx.fillText(String(job.co || '').slice(0, 22), px, y + 64);
  ctx.font = `34px ${F_BODY}`; ctx.fillStyle = hexToRgba(P.ink, 0.88);
  ctx.fillText(String(job.role || '').slice(0, 42), px, y + 148);
  if (job.pay) { ctx.font = `64px ${F_BLACK}`; ctx.fillStyle = P.ink; ctx.fillText(String(job.pay), px, y + 214); }
  ctx.font = `30px ${F_BODY}`; ctx.fillStyle = hexToRgba(P.ink, 0.78);
  ctx.fillText([job.loc, job.style, job.exp].filter(Boolean).join('   ·   ').slice(0, 52), px, y + 306);

  // footer brand line, handwritten (star glyph omitted — not in the handmade font)
  ctx.fillStyle = P.apply;
  ctx.font = `44px ${F_HAND}`; ctx.fillText('stillunemployed.com', px, y + h - 124);
  ctx.font = `30px ${F_HAND}`; ctx.fillStyle = hexToRgba(P.ink, 0.72);
  ctx.fillText("roles I'd actually apply to", px, y + h - 68);

  ctx.restore();
  return cv.toBuffer('image/png');
}

function stub(job, slug, themeKey) {
  const url = `/jobs.html?job=${b64(job.link)}`;
  const img = `${SITE}/j/og/${themeKey}/${slug}.png`;
  const title = `${job.role || 'A role'} at ${job.co || 'a great company'}`;
  const desc = [job.pay, job.loc].filter(Boolean).join(' · ') + " — thought you'd want to see this one.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} — StillUnemployed.com</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="StillUnemployed.com">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${SITE}/j/${themeKey}/${slug}.html">
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

// Output root: defaults to <repo>/j; SHARE_OUT lets a local test render elsewhere.
const OUT = process.env.SHARE_OUT || join(ROOT, 'j');
const outHtmlRoot = OUT, outImgRoot = join(OUT, 'og');
if (existsSync(outHtmlRoot)) rmSync(outHtmlRoot, { recursive: true, force: true });
for (const th of THEME_KEYS) { mkdirSync(join(outHtmlRoot, th), { recursive: true }); mkdirSync(join(outImgRoot, th), { recursive: true }); }

let n = 0;
for (let i = 1; i < rows.length; i++) {
  const c = rows[i]; if (!c) continue;
  const g = (k) => (k >= 0 && c[k] != null) ? String(c[k]).trim() : '';
  const co = g(iCo), role = g(iRole), link = g(iLink);
  if ((!co && !role) || !link) continue;
  if (g(iAct).toLowerCase().includes('dead')) continue;
  const job = { co, role, link, loc: g(iLoc), style: g(iType), pay: g(iPay), exp: g(iExp) };
  const slug = slugOf(link);
  for (const th of THEME_KEYS) {
    writeFileSync(join(outImgRoot, th, slug + '.png'), drawCard(job, th));
    writeFileSync(join(outHtmlRoot, th, slug + '.html'), stub(job, slug, th));
  }
  n++;
}
console.log('generated', n, 'jobs x', THEME_KEYS.length, 'themes =', n * THEME_KEYS.length, 'share pages + images into /j');
