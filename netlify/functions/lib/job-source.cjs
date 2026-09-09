'use strict';
// Shared source admission and share identities. No rendering, native canvas, or module-time I/O.
const {readFileSync}=require('node:fs');
const SUJobIdentity=require('../../../js/job-identity.js');
const SHEET = '1DRfkDn_OIVlnx06xFaNpNbusXl49jvM26oJsl-qq2nU';
const CSV = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&headers=1&gid=2134483974&_=${Date.now()}`;
// deterministic short slug from the apply link — MUST match app.js suSlug()
function slugOf(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
function parseCSV(text) {
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

function rowsToJobs(rows) {
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
function shareEntries(job) {
  return [...new Set(job._aliases || [job.link])].map(link => ({ link, slug: slugOf(link) }));
}

async function loadJobs(csvPath, fetcher = fetch) {
  let text;
  if (csvPath) text = readFileSync(csvPath, 'utf8');
  else {
    const response = await fetcher(CSV, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Jobs CSV request failed: HTTP ' + response.status);
    text = await response.text();
  }
  return rowsToJobs(parseCSV(text));
}

module.exports={parseCSV,rowsToJobs,shareEntries,slugOf,loadJobs};
