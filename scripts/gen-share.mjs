// Pre-generate a static share page + Post-it OG image per active job, PER THEME.
// Output: /j/<theme>/<slug>.html (Open Graph stub -> redirects to the board)
//         /j/og/<theme>/<slug>.png (the Post-it card, themed to match the board look)
// Themes rendered: original, poker (Casino), girly — the 3 live "Change Look?" looks.
// The shared link the app hands out already carries the viewer's current theme, so the
// iMessage/preview thumbnail matches the exact card they were looking at (color + pay tier).
// Run: node scripts/gen-share.mjs [localCsvPath]
// Cost model: pure static files on Netlify (no serverless functions, no per-share cost).
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import SUJobIdentity from '../js/job-identity.js';
import SUStates from '../js/us-states.js';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
const CSV = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&headers=1&gid=2134483974&_=${Date.now()}`;
// Production must use the canonical custom domain, even when Netlify also sets
// DEPLOY_PRIME_URL to the main branch subdomain. Keep gen-theme-pages in agreement.
export function siteOrigin(env = process.env) {
  const canonical = env.URL || 'https://stillunemployed.com';
  return (env.CONTEXT === 'production' ? canonical : (env.DEPLOY_PRIME_URL || canonical)).replace(/\/+$/, '');
}
const SITE = siteOrigin();
let createCanvas, GlobalFonts, canvasReady;

// ---- Fonts: use the real board faces so the card reads handmade, not like a plain box.
// Registered from @fontsource woff2 (bundled in node_modules). Graceful if missing.
function reg(p, fam) { try { GlobalFonts.registerFromPath(join(ROOT, p), fam); } catch (e) {} }
function registerFonts() {
  reg('node_modules/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2', 'SUBlack');
  reg('node_modules/@fontsource/indie-flower/files/indie-flower-latin-400-normal.woff2', 'SUHand');
  reg('node_modules/@fontsource/archivo/files/archivo-latin-400-normal.woff2', 'SUBody');
  reg('node_modules/@fontsource/archivo/files/archivo-latin-500-normal.woff2', 'SUBody');
  reg('node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2', 'SUBody');
  reg('node_modules/@fontsource/archivo/files/archivo-latin-700-normal.woff2', 'SUBody');
}
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
  },
  // --- Added 2026-07-12. These 5 themes existed on the board but NOT here, so /j/<theme>/<slug>.html
  // was never generated for them and every share silently fell back to the yellow original card.
  // `high` is the one that matters: the share card ALWAYS renders the theme's $100K+ colors
  // regardless of the job's real pay tier (Nic's rule — the top card is the attention-grabber).
  mermaid: {
    back: '#6FC7DE',
    high: { bg: ['#177287', '#0E4A5C'], ink: '#F2FBFA', apply: '#FFC7B8', stamp: '#EAF7F4' },
    mid:  { bg: ['#FDFEFF', '#DFF2F1'], ink: '#0E4A5C', apply: '#D9553C', stamp: '#0E4A5C' },
    low:  { bg: ['#FFFFFF', '#EAF6F6'], ink: '#0E4A5C', apply: '#D9553C', stamp: '#0E4A5C' }
  },
  bratt: {
    back: '#EEF6D6',
    high: { bg: ['#96DB0A', '#8ACE00'], ink: '#0A1400', apply: '#0A1400', stamp: '#0A1400' },
    mid:  { bg: ['#EAF7C4', '#DCEF9E'], ink: '#1A2A0A', apply: '#3A7A00', stamp: '#1A2A0A' },
    low:  { bg: ['#FFFFFF', '#F4FBE4'], ink: '#1A2A0A', apply: '#3A7A00', stamp: '#1A2A0A' }
  },
  noir: {                              // "Black Cat"
    back: '#F0EEE8',
    high: { bg: ['#161618', '#050506'], ink: '#ECECEE', apply: '#ECECEE', stamp: '#C6C6C8' },
    mid:  { bg: ['#2E2E31', '#232326'], ink: '#ECECEE', apply: '#ECECEE', stamp: '#C6C6C8' },
    low:  { bg: ['#4E4E52', '#3E3E42'], ink: '#ECECEE', apply: '#ECECEE', stamp: '#C6C6C8' }
  },
  beauty: {
    back: '#EFE7DC',
    high: { bg: ['#7E1728', '#5A0F1C'], ink: '#F3D9B8', apply: '#F3D9B8', stamp: '#F3D9B8' },
    mid:  { bg: ['#F5D3DA', '#EAB4C0'], ink: '#5A2230', apply: '#A83048', stamp: '#5A2230' },
    low:  { bg: ['#FBEFF1', '#F3C9D2'], ink: '#5A2230', apply: '#A83048', stamp: '#5A2230' }
  },
  chess: {
    back: '#E9E7DF',
    high: { bg: ['#20211F', '#0C0C0C'], ink: '#F4F4F4', apply: '#F4F4F4', stamp: '#D4D4D4' },
    mid:  { bg: ['#FBFAF6', '#F0EEE5'], ink: '#161616', apply: '#161616', stamp: '#3A3A3A' },
    low:  { bg: ['#EDEEEA', '#DBDDD6'], ink: '#161616', apply: '#161616', stamp: '#3A3A3A' }
  }
};
const THEME_KEYS = Object.keys(THEMES);

// ---------------------------------------------------------------------------
// DRIFT GUARD (2026-07-12). This file and js/app.js each hold their own list of themes. When five
// themes were added to app.js and NOT here, every share from those themes silently fell back to the
// yellow original card — for weeks, with no error anywhere. "Two files holding two different
// definitions of the same concept" is exactly the failure class in
// [[2026-07-11-New-Routes-Fragment-Analytics-And-Share-Dead-Ends]].
// So: read app.js, pull its real theme keys, and FAIL THE BUILD if any of them is missing here.
// A new theme now breaks the build loudly instead of shipping a broken share card quietly.
// ---------------------------------------------------------------------------
function checkThemeDrift() {
  const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
  const block = appSrc.slice(appSrc.indexOf('THEMES: {'), appSrc.indexOf('payTier:'));
  const appThemes = [...block.matchAll(/^\s{6}(\w+):\s*\{\s*acc:/gm)].map(m => m[1])
    .filter(k => k !== 'cod');                     // cod (WW2) is archived: no picker entry, no shares
  const missing = appThemes.filter(k => !THEME_KEYS.includes(k));
  if (missing.length) {
    console.error('\n*** gen-share: THEME DRIFT ***');
    console.error('js/app.js has themes with no share-card definition here:', missing.join(', '));
    console.error('Add them to THEMES above (at minimum a `high` block = that theme\'s $100K+ card),');
    console.error('or every share from those themes falls back to the yellow original card.\n');
    throw new Error('board themes are missing share-card definitions');
  }
  console.log('gen-share: theme drift check OK —', appThemes.length, 'board themes all have share cards');
}

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

export function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false, closed = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQ = false; closed = true; }
      } else field += c;
    } else if (c === ',') { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; closed = false;
    } else if (c === '"') {
      if (field || closed) throw new Error('Malformed jobs CSV: unexpected quote');
      inQ = true;
    } else {
      if (closed) throw new Error('Malformed jobs CSV: text after closing quote');
      field += c;
    }
  }
  if (inQ) throw new Error('Malformed jobs CSV: unterminated quoted field');
  if (field.length || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}

export function rowsToJobs(rows) {
  if (!rows.length) throw new Error('Jobs CSV has no header');
  const head = rows[0].map(s => s.trim().toLowerCase());
  for (const name of ['company', 'job title', 'link', 'salary', 'active/dead']) {
    if (head.indexOf(name) < 0 || head.indexOf(name) !== head.lastIndexOf(name)) {
      throw new Error('Jobs CSV requires one ' + name + ' column');
    }
  }
  const jobs = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every(s => !s.trim())) continue;
    if (cells.length !== head.length) throw new Error('Malformed jobs CSV: column count on row ' + (i + 1));
    const get = name => (cells[head.indexOf(name)] || '').trim();
    const co = get('company'), role = get('job title'), link = get('link'), pay = get('salary');
    const act = get('active/dead').toLowerCase();
    if (!co || !role || act.includes('dead') || act === 'inactive' || act === 'no') continue;
    try { const url = new URL(link); if (!/^https?:\/\//i.test(link) || !/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) continue; }
    catch (e) { continue; }
    if (!/\d/.test(pay)) continue;
    if (/\/\s*(?:h|hr|hour)\b|\bper\s*hour\b|\bhourly\b/i.test(pay)) {
      const rates = (pay.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
      if (!rates.length || Math.max(...rates) < 25) continue;
    }
    jobs.push({ co, role, link, pay, ind: get('category'), loc: get('location'), style: get('type'), exp: get('years of experience') });
  }
  return SUJobIdentity.groupJobs(jobs).map(group => ({ ...group.job, _aliases: group.aliases }));
}

// Keep every previously shareable raw-URL hash. Alias pages use the same
// representative listing, so a saved old share still reaches the visible card.
export function shareEntries(job) {
  return [...new Set(job._aliases || [job.link])].map(link => ({ link, slug: slugOf(link) }));
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

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Keep a complete line whenever its actual font fits. Character-count caps cut
// short narrow titles and still overflow on wide company names. If space really
// runs out, show an omission marker and prefer the last complete word. Segment
// graphemes so a long unbroken name cannot leave half an emoji or accent behind.
export function fitCanvasText(ctx, value, maxWidth) {
  const text = String(value ?? '');
  if (!text || !Number.isFinite(maxWidth) || maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const marker = '…';
  if (ctx.measureText(marker).width > maxWidth) return '';
  const parts = Array.from(graphemes.segment(text), part => part.segment);
  let low = 0, high = parts.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = parts.slice(0, middle).join('').trimEnd() + marker;
    if (ctx.measureText(candidate).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  const prefix = parts.slice(0, low).join('');
  let fitted = prefix.trimEnd();
  if (!/\s$/u.test(prefix) && !/^\s/u.test(parts[low] || '')) {
    const boundary = fitted.search(/\s+\S*$/u);
    if (boundary > 0) fitted = fitted.slice(0, boundary).trimEnd();
  }
  return fitted + marker;
}

// Draw one job to look EXACTLY like the board card (flat, same fonts/colors),
// just scaled up for the 1200x630 OG frame. No tape / peel / curl / sheen /
// vignette — the board card doesn't have those, and Nic didn't want them.
function drawCard(job, themeKey, cv) {
  const T = THEMES[themeKey] || THEMES.original;
  // Shared cards ALWAYS use the theme's $100K+ card color (the attention-grabber:
  // original = yellow, casino = black, girly = pink), regardless of the job's real
  // pay tier. Per Nic — a shared card should always look premium.
  const P = T.high;
  const W = 1200, H = 630, ctx = cv.getContext('2d');
  // Reset pixels and drawing state between images, reusing one native surface.
  ctx.reset();

  // thin surface behind the card (barely shows — the card nearly fills the frame)
  ctx.fillStyle = T.back; ctx.fillRect(0, 0, W, H);

  // the card fills most of the frame -> little empty space, like the real card
  const x = 34, y = 32, w = W - 68, h = H - 64, r = 14;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(-0.012); ctx.translate(-W / 2, -H / 2);

  // soft drop shadow (like a card sitting on a surface)
  ctx.save();
  ctx.shadowColor = 'rgba(20,14,8,0.26)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 16;
  ctx.fillStyle = P.bg[1];
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();

  // card fill = the SAME subtle two-tone gradient the board card uses (160deg),
  // nothing layered on top.
  const g = ctx.createLinearGradient(x + w * 0.5, y, x + w * 0.4, y + h);
  g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r); ctx.fill();

  // text — same faces + weights as the board card, tightly packed
  const px = x + 64;
  const textWidth = w - 128;
  ctx.textBaseline = 'top';
  ctx.fillStyle = P.ink;
  ctx.font = `900 66px ${F_BLACK}`; ctx.fillText(fitCanvasText(ctx, job.co, textWidth), px, y + 66);
  ctx.font = `600 36px ${F_BODY}`; ctx.fillStyle = hexToRgba(P.ink, 0.92);
  ctx.fillText(fitCanvasText(ctx, job.role, textWidth), px, y + 156);
  if (job.pay) { ctx.font = `800 66px ${F_BODY}`; ctx.fillStyle = P.ink; ctx.fillText(String(job.pay), px, y + 262); }
  ctx.font = `30px ${F_BODY}`; ctx.fillStyle = hexToRgba(P.ink, 0.85);
  ctx.fillText(fitCanvasText(ctx, [SUStates.cardLocation(job.loc), job.style, job.exp].filter(Boolean).join('  ·  '), textWidth), px, y + 350);

  // Draw the footer star rather than relying on a host font's symbol coverage.
  // Netlify's Linux fonts may render a missing-glyph box for the Unicode star.
  const by = y + h - 128;
  ctx.fillStyle = P.apply;
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 ? 6 : 15;
    const sx = px + 15 + Math.cos(angle) * radius;
    const sy = by + 24 + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.closePath(); ctx.fill();
  const sw = 29.41; // Preserve existing footer spacing without host font metrics.
  ctx.font = `46px ${F_HAND}`; ctx.fillText('stillunemployed.com', px + sw + 14, by);
  ctx.font = `30px ${F_HAND}`; ctx.fillStyle = hexToRgba(P.ink, 0.72);
  ctx.fillText("roles I'd actually apply to", px, by + 58);

  ctx.restore();
  return cv.toBuffer('image/png');
}

// Native canvas memory is larger than its JavaScript wrapper. Allocating a new
// canvas thousands of times in one synchronous turn can exhaust a build worker
// before native finalizers run. Keep one surface for this sequential renderer.
export async function createCardRenderer() {
  if (!canvasReady) canvasReady = (async () => {
    ({ createCanvas, GlobalFonts } = await import('@napi-rs/canvas'));
    registerFonts();
  })();
  await canvasReady;
  const canvas = createCanvas(1200, 630);
  return (job, themeKey) => drawCard(job, themeKey, canvas);
}

export function stub(job, slug, themeKey, site = SITE) {
  const url = `/jobs.html?job=${encodeURIComponent(b64(job.link))}&theme=${encodeURIComponent(themeKey)}`;
  const img = `${site}/j/og/${themeKey}/${slug}.png`;
  const title = `Job at ${job.co || 'a great company'}`;
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
<meta property="og:url" content="${site}/j/${themeKey}/${slug}.html">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${esc(url)}">
<script>location.replace(${JSON.stringify(url)});</script>
</head><body style="font-family:sans-serif;padding:40px;color:#2C2118;">Taking you to the job on StillUnemployed.com…</body></html>`;
}

export async function loadJobs(csvPath, fetcher = fetch) {
  let text;
  if (csvPath) text = readFileSync(csvPath, 'utf8');
  else {
    const response = await fetcher(CSV, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Jobs CSV request failed: HTTP ' + response.status);
    text = await response.text();
  }
  return rowsToJobs(parseCSV(text));
}

async function main() {
  checkThemeDrift();
  // Validate the entire feed before replacing output. A failed deployment leaves
  // the previous successful site intact; it must not silently publish missing shares.
  const jobs = await loadJobs(process.argv[2]);
  const renderCard = jobs.length ? await createCardRenderer() : null;

  // Output root: defaults to <repo>/j; SHARE_OUT lets a local test render elsewhere.
  const OUT = process.env.SHARE_OUT || join(ROOT, 'j');
  const outHtmlRoot = OUT, outImgRoot = join(OUT, 'og');
  if (existsSync(outHtmlRoot)) rmSync(outHtmlRoot, { recursive: true, force: true });
  for (const th of THEME_KEYS) { mkdirSync(join(outHtmlRoot, th), { recursive: true }); mkdirSync(join(outImgRoot, th), { recursive: true }); }

  let n = 0;
  for (const job of jobs) {
    for (const th of THEME_KEYS) {
      const image = renderCard(job, th);
      for (const { slug } of shareEntries(job)) {
        writeFileSync(join(outImgRoot, th, slug + '.png'), image);
        writeFileSync(join(outHtmlRoot, th, slug + '.html'), stub(job, slug, th));
      }
    }
    n++;
    // Let completed PNG/native allocations be finalized before the next job.
    // Rendering remains strictly sequential, with at most one canvas in flight.
    await yieldToEventLoop();
  }
  const aliases = jobs.reduce((sum, job) => sum + shareEntries(job).length, 0);
  console.log('generated', n, 'jobs x', THEME_KEYS.length, 'themes;', aliases * THEME_KEYS.length, 'share pages + images including URL aliases into /j');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (e) { console.error('gen-share: build failed:', e.message); process.exitCode = 1; }
}
