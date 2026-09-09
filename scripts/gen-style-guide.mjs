// Generate the guide's public theme catalog from the board's source of truth.
// Run --write after theme changes; --check is read-only and suitable for CI/builds.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'js/style-guide-themes.js';

function block(source, marker, opening = '{', closing = '}') {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error('Theme source marker missing: ' + marker);
  const start = source.indexOf(opening, markerAt + marker.length);
  if (start < 0) throw new Error('Theme source block missing: ' + marker);
  let depth = 0, quote = '', comment = '';
  for (let i = start; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === 'line') { if (c === '\n') comment = '';continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = '';i++; }continue; }
    if (quote) { if (c === '\\') i++;else if (c === quote) quote = '';continue; }
    if (c === '/' && next === '/') { comment = 'line';i++;continue; }
    if (c === '/' && next === '*') { comment = 'block';i++;continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c;continue; }
    if (c === opening) depth++;
    if (c === closing) { depth--;if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error('Unterminated theme source block: ' + marker);
}

function evaluate(code, context = {}) {
  return vm.runInNewContext(code, context, { timeout:200, contextCodeGeneration:{ strings:false, wasm:false } });
}
function object(source, marker) { return JSON.parse(JSON.stringify(evaluate('(' + block(source, marker) + ')'))); }
function attributes(source) {
  const values = Object.create(null);
  const remaining = source.replace(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g, (_all, key, _quote, value) => {
    if (Object.hasOwn(values, key)) throw new Error('Duplicate Original SVG attribute');
    values[key] = value;return '';
  });
  if (remaining.trim()) throw new Error('Unrecognized Original SVG attribute');
  return Object.fromEntries(Object.entries(values).sort(([a],[b]) => a.localeCompare(b)));
}
function validateOriginalArt(app, icons) {
  const poses = evaluate('(' + block(app, 'POSES:', '[', ']') + ')');
  const indices = [0,10,13];
  if (icons.length !== indices.length) throw new Error('Original needs legacy pose specimens 0, 10 and 13');
  icons.forEach((icon, index) => {
    const poseIndex = indices[index], pose = poses[poseIndex];
    const fail = () => { throw new Error('Original artwork differs from legacy POSES[' + poseIndex + ']'); };
    if (!pose || icon.id !== 'original-legacy-' + poseIndex) fail();
    const svg = icon.svg.match(/^<svg\s+([^>]+)>\s*<g\s+([^>]+)>([\s\S]*)<\/g>\s*<\/svg>$/);
    if (!svg) fail();
    const outer = attributes(svg[1]), paint = attributes(svg[2]);
    if (outer.viewBox !== '0 0 64 90' || outer.width !== '64' || outer.height !== '90' || outer['aria-hidden'] !== 'true' || outer.focusable !== 'false' || Object.keys(outer).some(key => !['xmlns','viewBox','width','height','aria-hidden','focusable'].includes(key)) || (outer.xmlns && outer.xmlns !== 'http://www.w3.org/2000/svg')) fail();
    const expectedPaint = {fill:'none',stroke:'#2A2118','stroke-width':'3','stroke-linecap':'round','stroke-linejoin':'round'};
    if (Number(paint.opacity) !== 0.78 || Object.keys(paint).length !== 6 || Object.entries(expectedPaint).some(([key,value]) => paint[key] !== value)) fail();
    const parts = [];
    const remaining = svg[3].replace(/<(circle|path)\b([^>]*?)(?:\/>|>\s*<\/\1>)/g, (_all, tag, raw) => {
      parts.push({tag,attrs:attributes(raw)});return '';
    });
    const expected = pose.parts.map(part => {
      const attrs = part[0] === 'c' ? {cx:String(part[1]),cy:String(part[2]),r:String(part[3])} : {d:part[1],...(part[2] ? {stroke:'#C2552F'} : {})};
      return {tag:part[0] === 'c' ? 'circle' : 'path',attrs:Object.fromEntries(Object.entries(attrs).sort(([a],[b]) => a.localeCompare(b)))};
    });
    if (remaining.trim() || JSON.stringify(parts) !== JSON.stringify(expected)) fail();
  });
}
function declarations(source) {
  return Object.fromEntries(source.replace(/\/\*[\s\S]*?\*\//g, '').split(';').map(part => {
    const colon = part.indexOf(':');return colon < 0 ? [] : [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
  }).filter(pair => pair.length && pair[0]));
}

export function buildCatalog(root = ROOT) {
  const app = readFileSync(join(root, 'js/app.js'), 'utf8');
  const css = readFileSync(join(root, 'css/styles.css'), 'utf8');
  const brand = readFileSync(join(root, 'css/brand.css'), 'utf8');
  const html = readFileSync(join(root, 'jobs.html'), 'utf8');
  const share = readFileSync(join(root, 'scripts/gen-theme-pages.mjs'), 'utf8');
  const artSource = readFileSync(join(root, 'js/theme-art.js'), 'utf8');
  const artwork = JSON.parse(JSON.stringify(evaluate(artSource + '\nmodule.exports.themes', { module:{ exports:{} } })));
  const palettes = object(app, 'THEMES:'), pages = object(share, 'const THEMES =');
  const aliases = object(html, 'var SLUG2LOOK ='), enabled = object(html, 'var VALID =');
  const publicThemes = [{ slug:'original', look:'original', label:'Original' }, ...Object.entries(pages).map(([slug, label]) => ({ slug, look:aliases[slug], label }))];
  const publicLooks = publicThemes.map(theme => theme.look);
  if (JSON.stringify(Object.keys(artwork).sort()) !== JSON.stringify([...publicLooks].sort())) throw new Error('Theme artwork and public guide coverage disagree');
  for (const [look, art] of Object.entries(artwork)) {
    if (!art.texture || ['name','description','usage'].some(key => typeof art.texture[key] !== 'string' || !art.texture[key].trim())) throw new Error('Theme texture description is incomplete: ' + look);
    if (!Array.isArray(art.icons) || art.icons.length < 2 || art.icons.length > 3 || new Set(art.icons.map(icon => icon.id)).size !== art.icons.length) throw new Error('Theme needs two or three distinct drawn icons: ' + look);
    for (const icon of art.icons) {
      const viewBox = look === 'original' ? '0 0 64 90' : '0 0 64 64';
      if (!/^[a-z][a-z0-9-]+$/.test(icon.id) || typeof icon.label !== 'string' || !icon.label.trim() || typeof icon.svg !== 'string' || !icon.svg.startsWith('<svg ') || !icon.svg.endsWith('</svg>') || !icon.svg.includes('viewBox="' + viewBox + '"') || !icon.svg.includes('aria-hidden="true"') || !icon.svg.includes('focusable="false"') || /<(?:script|foreignObject|image|use|style|text)\b|\bon\w+\s*=|\bhref\s*=|url\s*\(/i.test(icon.svg)) throw new Error('Theme icon must be a static decorative drawing: ' + look);
      for (const tag of icon.svg.matchAll(/<\/?([\w:-]+)/g)) if (!['svg','g','path','circle','ellipse','line','polyline','polygon','rect'].includes(tag[1])) throw new Error('Theme icon contains a non-static shape: ' + look);
    }
  }
  // Original's guide shows three specimens of the existing 16-pose vocabulary.
  // Rebuilding the catalog must never bless a redraw that drifted from the board.
  validateOriginalArt(app, artwork.original.icons);
  if (new Set(publicLooks).size !== publicLooks.length || publicLooks.some(look => !palettes[look])) throw new Error('Public theme routes and palettes disagree');
  for (const look of Object.keys(enabled)) if (!publicLooks.includes(look)) throw new Error('Public theme lacks guide/share coverage: ' + look);
  for (const look of Object.keys(palettes)) if (look !== 'cod' && !publicLooks.includes(look)) throw new Error('Unclassified theme needs public guide coverage: ' + look);
  for (const look of publicLooks) if (look !== 'original' && !enabled[look]) throw new Error('Guide theme is not publicly enabled: ' + look);
  const pickerContext = { out:'' };
  evaluate(block(app, 'if (this.state.lookOpen)'), pickerContext);
  const actions = Object.fromEntries([...app.matchAll(/case '(pick\w+)': self\.setLook\('([^']+)'\)/g)].map(match => [match[1], match[2]]));
  const picker = [...pickerContext.out.matchAll(/data-act="(pick\w+)"/g)].map((match, index, all) => {
    const card = pickerContext.out.slice(match.index, all[index + 1]?.index || pickerContext.out.length);
    const labels = [...card.matchAll(/<div[^>]*font-family:\s*'Archivo Black'[^>]*>([^<>]+)<\/div>/g)];
    const mini = card.match(/class="su-mini-theme[^"]*"[^>]*><span>([^<>]+)<\/span>/);
    const label = mini ? mini[1] : labels.at(-1)?.[1];
    if (!label || !actions[match[1]]) throw new Error('Theme picker extraction changed');
    return { look:actions[match[1]], label };
  });
  if (picker.length !== publicThemes.length || new Set(picker.map(item => item.look)).size !== picker.length) throw new Error('Theme picker and public guide coverage disagree');
  for (const item of picker) {
    const theme = publicThemes.find(theme => theme.look === item.look);
    if (!theme || (item.label !== theme.label && !(item.look === 'original' && item.label === 'Original version') && !(item.look === 'mermaid' && item.label === 'Mermaid'))) throw new Error('Theme picker label/route mismatch: ' + item.look);
  }
  publicThemes.sort((a,b) => picker.findIndex(item => item.look === a.look) - picker.findIndex(item => item.look === b.look));
  const setAllow = [...block(app, 'setLook: function').matchAll(/look !== '([^']+)'/g)].map(match => match[1]);
  const loadAllow = [...block(app, 'function loadLook()').matchAll(/v === '([^']+)'/g)].map(match => match[1]);
  for (const [name, allowed] of [['setLook',setAllow],['loadLook',loadAllow]]) {
    if (JSON.stringify([...new Set(['original',...allowed])].sort()) !== JSON.stringify([...publicLooks].sort())) throw new Error(name + ' and public theme coverage disagree');
  }
  const fonts = readFileSync(join(root, 'css/fonts.css'), 'utf8');
  const fontFaces = [...new Set([...fonts.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => {
    const rule=declarations(match[1]);
    return JSON.stringify({family:rule['font-family'].replace(/^['"]|['"]$/g,''),style:rule['font-style'],weight:Number(rule['font-weight'])});
  }))].map(item => JSON.parse(item));
  if (!fontFaces.length) throw new Error('Shared font face catalog is empty');
  const routeSlugs=object(app, 'var slug = ');
  for (const theme of publicThemes) if (theme.look !== 'original' && routeSlugs[theme.look] !== theme.slug) throw new Error('App theme route and guide disagree: '+theme.look);
  const tokens = declarations(block(brand, ':root').slice(1, -1));
  function resolveTokens(value) {
    for (let pass = 0; /var\(/.test(value); pass++) {
      if (pass > 8) throw new Error('Unresolved theme token: ' + value);
      value = value.replace(/var\((--[\w-]+)\)/g, (_, key) => {
        if (!tokens[key]) throw new Error('Missing theme token: ' + key);
        return tokens[key];
      });
    }
    return value;
  }
  const bandStart = app.indexOf('var ink = (tier');
  const bandEnd = app.indexOf('var gStamp =', bandStart);
  if (bandStart < 0 || bandEnd < bandStart) throw new Error('Salary rendering source changed; review catalog extraction');
  const bandCode = app.slice(bandStart, bandEnd);
  const stampCode = block(app, 'if (showVerified)');
  const stampColorCode = app.slice(bandEnd, app.indexOf(';', bandEnd) + 1);
  const backgrounds = ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'animation'];
  const themes = publicThemes.map(theme => {
    const P = palettes[theme.look];
    const canvas = declarations(block(css, theme.look === 'original' ? '.board ' : '.board.' + theme.look + ' ').slice(1, -1));
    const inherited = declarations(block(css, '.board ').slice(1, -1));
    const combined = { ...inherited, ...canvas };
    const canvasStyle = Object.fromEntries(backgrounds.filter(key => combined[key]).map(key => [key, combined[key]]));
    if (!canvasStyle['background-color'] || !canvasStyle['background-image']) throw new Error('Theme canvas is incomplete: ' + theme.look);
    if (/url\(/i.test(JSON.stringify(canvasStyle))) throw new Error('Review new external/image canvas assets before cataloging');
    const gutter = theme.look === 'original' ? canvasStyle['background-color'] : declarations(block(css, 'body.theme-' + theme.look).slice(1, -1)).background.replace(/\s*!important$/, '');
    const palette = Object.fromEntries(Object.entries(P).filter(([key]) => !key.startsWith('pick')).map(([key, value]) => [key, resolveTokens(value)]));
    const bands = Object.fromEntries(['low', 'mid', 'high'].map(tier => {
      const context = { P, tier, j:{internship:false}, cod:false, girly:theme.look === 'girly', mermaid:theme.look === 'mermaid', bratt:theme.look === 'bratt', beauty:theme.look === 'beauty', stampClass:'', html:'' };
      const band = evaluate(bandCode + '\n({background:bg,ink:ink,apply:applyColor,stamp:stampColor})', context);
      evaluate(stampColorCode + '\n' + stampCode, context);
      if (context.girly) band.stamp=context.gStamp;
      const stamp = resolveTokens(context.html).replace(/Human[- ]verified/gi, 'Human verified');
      return [tier, { ...Object.fromEntries(Object.entries(band).map(([key, value]) => [key, resolveTokens(value)])), stampHTML:stamp }];
    }));
    return { ...theme, gutter, canvas:canvasStyle, palette, bands, art:artwork[theme.look] };
  });
  let motion = '';
  if (themes.some(theme => theme.canvas.animation)) {
    motion = '@keyframes suGuideMermaidDrift ' + block(css, '@keyframes mermaidDrift');
    themes.forEach(theme => { if (theme.canvas.animation) theme.canvas.animation = theme.canvas.animation.replace('mermaidDrift', 'suGuideMermaidDrift'); });
  }
  return { schemaVersion:1, themes, fontFaces, aliases:Object.fromEntries(Object.entries(aliases).filter(([, look]) => publicLooks.includes(look))), motion };
}

export function renderCatalog(data) {
  return '/* Generated by scripts/gen-style-guide.mjs from current public board themes. */\n' +
    '(function(root){\n  "use strict";\n  function freeze(value){if(value&&typeof value==="object"){Object.keys(value).forEach(function(key){freeze(value[key]);});Object.freeze(value);}return value;}\n' +
    '  var catalog=freeze(' + JSON.stringify(data, null, 2).replace(/</g, '\\u003c') + ');\n' +
    '  if(typeof module!=="undefined"&&module.exports)module.exports=catalog;else root.SUStyleThemes=catalog;\n' +
    '})(typeof window==="undefined"?globalThis:window);\n';
}
export function generate(root = ROOT, write = false) {
  const output = renderCatalog(buildCatalog(root)), path = join(root, OUTPUT);
  if (write) writeFileSync(path, output);
  else if (readFileSync(path, 'utf8') !== output) throw new Error('Style-guide catalog is stale. Run node scripts/gen-style-guide.mjs --write before recording the release.');
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2] || '--check';
    if (!['--write', '--check'].includes(mode) || process.argv.length > 3) throw new Error('Use --write or --check');
    generate(ROOT, mode === '--write');console.log('Style-guide themes ' + (mode === '--write' ? 'generated.' : 'checked.'));
  } catch (error) { console.error(error.message);process.exitCode = 1; }
}
