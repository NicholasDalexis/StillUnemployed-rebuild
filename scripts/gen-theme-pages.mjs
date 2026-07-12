/**
 * gen-theme-pages.mjs — per-theme board share pages (2026-07-12)
 *
 * WHY: social crawlers (iMessage, Instagram, LinkedIn, X) fetch the raw HTML and do NOT run JS.
 * The board is ONE file (jobs.html) served at every /jobs/<theme> URL via the netlify.toml rewrite,
 * so a client-side theme switch can never change the share preview. Every theme URL would show the
 * same image.
 *
 * FIX: emit a REAL page per theme at /jobs/<slug>/index.html, each with its own og:image.
 * Netlify serves a matching FILE before applying a (non-forced) redirect, so these win over the
 * /jobs/* rewrite, and any unknown slug still falls through to jobs.html.
 *
 * Each page is a copy of jobs.html with only the og/twitter tags swapped, so it can never drift
 * from the real board. jobs.html's own pre-paint script reads location.pathname and applies the
 * theme, so no extra JS is needed here.
 *
 * Deliberately standalone: gen-share.mjs exits early if the Google Sheet is unreachable, and these
 * pages have nothing to do with the sheet. They must never be collateral damage.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.DEPLOY_PRIME_URL || process.env.URL || 'https://stillunemployed.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// slug -> share title. The slug must match jobs.html's SLUG2LOOK pre-paint map.
const THEMES = {
  casino:   'Casino',
  girlies:  'For the girlies',
  mermaid:  'Mermaidcore',
  bratt:    'bratt',
  blackcat: 'Black Cat',
  beauty:   'Beauty',
  chess:    'Chess',
};

const DESC = 'Opened and checked by a human (me). Every role has a real salary. No AI slop.';
const board = readFileSync(join(ROOT, 'jobs.html'), 'utf8');

let made = 0;
for (const [slug, label] of Object.entries(THEMES)) {
  const img = `${SITE}/assets/og/${slug}.png`;
  const url = `${SITE}/jobs/${slug}`;
  const title = `Roles I'd actually apply to — ${label}`;

  const html = board
    .replace(/<title>[^<]*<\/title>/,            `<title>${esc(title)} — StillUnemployed.com</title>`)
    .replace(/<meta property="og:title"[^>]*>/,  `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:url"[^>]*>/,    `<meta property="og:url" content="${url}">`)
    .replace(/<meta property="og:image"[^>]*>/,  `<meta property="og:image" content="${img}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${img}">`);

  // Fail LOUD rather than ship a page whose preview silently points at the wrong theme.
  if (!html.includes(img) || !html.includes(esc(title))) {
    console.error(`gen-theme-pages: og swap FAILED for "${slug}" — did jobs.html's og tags change?`);
    process.exitCode = 1;
    continue;
  }

  mkdirSync(join(ROOT, 'jobs', slug), { recursive: true });
  writeFileSync(join(ROOT, 'jobs', slug, 'index.html'), html);
  made++;
}
console.log(`gen-theme-pages: wrote ${made}/${Object.keys(THEMES).length} theme board pages into /jobs/<theme>/index.html`);

// ---------------------------------------------------------------------------
// Point the STATIC pages' og tags at THIS deploy's origin.
// index.html and jobs.html hardcode https://stillunemployed.com/... as a sane default, but on a
// BRANCH/PREVIEW deploy that would make the share preview fetch the image from PRODUCTION — which
// 404s until the branch is merged. So the preview would look broken even though the code is right.
// Netlify sets DEPLOY_PRIME_URL per deploy, so rewrite the absolute origin to match wherever we are.
// Source files are untouched; this only rewrites the build output (Netlify builds a fresh checkout).
// ---------------------------------------------------------------------------
if (SITE !== 'https://stillunemployed.com') {
  for (const f of ['index.html', 'jobs.html']) {
    const p = join(ROOT, f);
    const before = readFileSync(p, 'utf8');
    const after = before.replaceAll('https://stillunemployed.com/', `${SITE}/`);
    if (after !== before) {
      writeFileSync(p, after);
      console.log(`gen-theme-pages: repointed og tags in ${f} -> ${SITE}`);
    }
  }
}
