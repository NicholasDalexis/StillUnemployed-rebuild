/* Private aggregates only. No visitor IDs, question logging, third-party charts or AI calls. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var COUNT_KEYS = ['events', 'visits', 'visitors', 'signups', 'logins', 'job_opens', 'saves', 'apply_clicks', 'reported_applied', 'tracker_users'];
  function count(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null; }
  function format(value) { var n = count(value); return n === null ? 'N/A' : n.toLocaleString('en-US'); }
  function percent(value, maximum) { var n = count(value), max = count(maximum); return n === null || !max ? 0 : Math.min(100, 100 * n / max); }
  function duration(value) {
    if (value === null || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'N/A';
    var n = Math.round(value); return n < 60 ? n + ' sec' : Math.floor(n / 60) + ' min' + (n % 60 ? ' ' + n % 60 + ' sec' : '');
  }
  function list(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 150).filter(function (x) { return x && typeof x.label === 'string'; }).map(function (x) {
      return { label: x.label.slice(0, 160), count: count(x.count) };
    }).sort(function (a, b) { return (b.count || 0) - (a.count || 0) || a.label.localeCompare(b.label); });
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.totals || !Array.isArray(raw.daily) || raw.tracking !== 'consent-only') throw new Error('invalid-response');
    var totals = {}; COUNT_KEYS.forEach(function (key) { totals[key] = count(raw.totals[key]); });
    var timing = raw.timing || {}, privacy = raw.privacy || {};
    return {
      windowDays: [7, 30, 90].indexOf(raw.windowDays) >= 0 ? raw.windowDays : null,
      generatedAt: typeof raw.generatedAt === 'string' && Number.isFinite(Date.parse(raw.generatedAt)) ? raw.generatedAt : null,
      tracking: 'consent-only', totals: totals,
      daily: raw.daily.slice(0, 92).filter(function (d) { return d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(Date.parse(d.date)); }).map(function (d) {
        return { date: d.date, visits: count(d.visits), job_opens: count(d.job_opens), apply_clicks: count(d.apply_clicks) };
      }).sort(function (a, b) { return a.date.localeCompare(b.date); }),
      fields: list(raw.fields), roles: list(raw.roles), themes: list(raw.themes), events: list(raw.events), jobs: list(raw.jobs), companies: list(raw.companies),
      pageTiming: Array.isArray(raw.pageTiming) ? raw.pageTiming.slice(0, 20).filter(function (x) { return x && ['home','board','tracker','privacy','terms','suggest','other'].indexOf(x.label) >= 0; }).map(function (x) { return { label: x.label, count: count(x.count), meanActiveSeconds: count(x.meanActiveSeconds) }; }) : [],
      timing: { returned: count(timing.returned), unknown: count(timing.unknown), capped: count(timing.capped), meanAwaySeconds: count(timing.meanAwaySeconds) },
      privacy: { rawRetentionDays: count(privacy.rawRetentionDays), minimumCohort: count(privacy.minimumCohort) },
      coverage: { complete: raw.coverage ? raw.coverage.complete === true : null }
    };
  }
  function stale(value, now) { return !value || !Number.isFinite(Date.parse(value)) || (now || Date.now()) - Date.parse(value) > 60 * 60 * 1000 || Date.parse(value) > (now || Date.now()) + 5 * 60 * 1000; }
  function answer(question, data) {
    if (!data) return 'Load an authorized analytics window or explicitly preview sample data first.';
    var q = String(question || '').toLowerCase().replace(/[?!.]/g, '').replace(/\s+/g, ' ').trim();
    var period = data.windowDays ? ' in the selected ' + data.windowDays + '-day window' : ' in this window';
    var unsupported = 'I can look up totals, the top field, role, job, company or theme, legal-page active time, and observed away time in this window. I cannot answer demographic questions, compare time windows or link people to specific jobs from these aggregates. Try one of the suggested questions.';
    var dimension;
    if (/^(which|what) (career )?field (is|was) (the )?most popular$|^(top|most popular|popular) field$/.test(q)) dimension = 'fields';
    if (/^(which|what) (job )?role (is|was) (the )?most popular$|^(top|most popular|popular) role$/.test(q)) dimension = 'roles';
    if (/^(which|what) theme (is|was) (the )?most popular$|^(top|most popular|favorite) theme$/.test(q)) dimension = 'themes';
    if (/^(which|what) (job|posting) (is|was) (the )?most popular$|^(top|most popular) (job|posting)$|^which job was opened most$/.test(q)) dimension = 'jobs';
    if (/^(which|what) company (is|was) (the )?most popular$|^(top|most popular) company$/.test(q)) dimension = 'companies';
    if (dimension) {
      var rows = data[dimension].filter(function (r) { return r.count !== null && r.count > 0; });
      if (!rows.length) return 'No reportable ' + dimension + period + '. There may be no recorded activity, or groups may be below the privacy threshold.';
      var top = rows[0], ties = rows.filter(function (r) { return r.count === top.count; });
      return ties.map(function (r) { return r.label; }).join(', ') + (ties.length > 1 ? ' tie at ' : ' leads with ') + format(top.count) + ' recorded ' + (dimension === 'themes' ? 'theme selections' : dimension === 'jobs' || dimension === 'companies' ? 'card opens' : 'card opens') + period + '. Small groups are withheld; counts are actions, not unique people.';
    }
    var key = null, label = '';
    if (/^(how many )?(people |users )?(signed up|signups|sign ups|new accounts)( did we have| were there)?$/.test(q)) { key = 'signups'; label = 'recorded sign-ups'; }
    if (/^(how many )?(people |users )?(use|used|are using) (the )?tracker$|^(tracker users|who uses the tracker)$/.test(q)) { key = 'tracker_users'; label = 'distinct recorded tracker users'; }
    if (/^(how many )?(visits|site visits|sessions)( did we have| were there)?$/.test(q)) { key = 'visits'; label = 'recorded visits'; }
    if (/^(how many )?(visitors|people visited|users visited)( the site)?$/.test(q)) { key = 'visitors'; label = 'distinct recorded visitors'; }
    if (/^(how many )?(job opens|jobs were opened|cards were opened)$/.test(q)) { key = 'job_opens'; label = 'recorded job opens'; }
    if (/^(how many )?(saves|jobs were saved)$/.test(q)) { key = 'saves'; label = 'recorded saves'; }
    if (/^(how many )?(apply clicks|people clicked apply|users clicked apply)$/.test(q)) { key = 'apply_clicks'; label = 'recorded Apply clicks (not a count of people)'; }
    if (/^(how many )?(reported applications|people reported applying|users reported applying)$/.test(q)) { key = 'reported_applied'; label = 'recorded self-reports of applying'; }
    if (/^(how many )?(logins|sign ins|sign-ins)( did we have| were there)?$/.test(q)) { key = 'logins'; label = 'recorded sign-ins'; }
    if (key) return data.totals[key] === null ? 'That measurement is unavailable in this response. N/A is not zero.' : format(data.totals[key]) + ' ' + label + period + '. This includes opted-in activity only.';
    var legal = q.match(/^(?:how long (?:do|did) (?:people|users) (?:spend|stay) (?:on|in)|(?:what is |what's )?(?:the )?(?:average|mean) (?:active )?time (?:on|in)) (?:the )?(privacy(?: policy)?|terms(?: of service)?)(?: page)?$/);
    if (legal) {
      var page = legal[1].indexOf('privacy') === 0 ? 'privacy' : 'terms';
      var observation = data.pageTiming.find(function (r) { return r.label === page; });
      return observation && observation.meanActiveSeconds !== null ? duration(observation.meanActiveSeconds) + ' mean active time per measured ' + page + '-page session' + period + '. Based on ' + format(observation.count) + ' timing events. This is not proof that someone read the page.' : 'No reportable timing for that page in this window. It may be unmeasured or below the privacy threshold; this does not mean zero reading time.';
    }
    if (/^(what is |what's )?(the )?(average|mean) (away time|time away)$|^how long (were|are) people away$/.test(q)) return data.timing.meanAwaySeconds === null ? 'No average away time is available. A missing return cannot be treated as zero time away.' : duration(data.timing.meanAwaySeconds) + ' mean observed time away after an Apply click' + period + '. Observations are limited to 15 minutes. This does not measure activity on another website.';
    return unsupported;
  }
  function fixture(days) {
    var daily = Array.from({ length: days }, function (_, i) { return { date: new Date(Date.UTC(2026, 7, 31 - days + i)).toISOString().slice(0, 10), visits: 36 + (i * 17 % 43), job_opens: 52 + (i * 23 % 97), apply_clicks: 13 + (i * 13 % 29) }; });
    function sum(k) { return daily.reduce(function (s, d) { return s + d[k]; }, 0); }
    return normalize({ jobs: [{label: 'Social Media Coordinator at Sample Studio', count: 89}, {label: 'Associate Product Designer at Example Company', count: 73}, {label: 'Assistant Fashion Designer at Sample House', count: 64}], companies: [{label: 'Sample Studio', count: 142}, {label: 'Example Company', count: 119}, {label: 'Sample House', count: 86}], pageTiming: [{label: 'board', count: 684, meanActiveSeconds: 172}, {label: 'tracker', count: 247, meanActiveSeconds: 136}, {label: 'privacy', count: 62, meanActiveSeconds: 38}, {label: 'terms', count: 41, meanActiveSeconds: 27}], windowDays: days, generatedAt: new Date().toISOString(), tracking: 'consent-only', totals: { events: sum('job_opens') * 3, visits: sum('visits'), visitors: 842, signups: 126, logins: 313, job_opens: sum('job_opens'), saves: 397, apply_clicks: sum('apply_clicks'), reported_applied: 214, tracker_users: 168 }, daily: daily, fields: [{ label: 'Marketing', count: 1218 }, { label: 'UX / UI Design', count: 642 }, { label: 'Fashion Design', count: 388 }, { label: 'Photography', count: 241 }, { label: 'Creative Technology', count: 173 }], roles: [{ label: 'Social & Community', count: 684 }, { label: 'Brand Marketing', count: 532 }, { label: 'Product Design', count: 407 }, { label: 'Content & Copy', count: 294 }, { label: 'Apparel Design', count: 227 }], themes: [{ label: 'Original', count: 320 }, { label: 'Casino', count: 197 }, { label: 'Beauty', count: 134 }, { label: 'Chess', count: 98 }], events: [{ label: 'job_open', count: sum('job_opens') }, { label: 'apply_click', count: sum('apply_clicks') }, { label: 'save', count: 397 }, { label: 'privacy_open', count: 62 }, { label: 'theme_change', count: 749 }], timing: { returned: 326, unknown: 82, capped: 48, meanAwaySeconds: 242 }, privacy: { rawRetentionDays: 90, minimumCohort: 5 }, coverage: { complete: true } });
  }
  function mount(win) {
    var doc = win.document, data = null, demo = false, request = 0, controller = null;
    function el(id) { return doc.getElementById(id); }
    if (!el('dashboard-data')) return;
    function node(tag, text, cls) { var n = doc.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
    function text(id, value) { el(id).textContent = value; }
    function state(kind, title, detail) { el('service-state').hidden = !kind; el('service-state').dataset.state = kind || ''; text('state-title', title || ''); text('state-detail', detail || ''); }
    function cancel() { request += 1; if (controller) controller.abort(); controller = null; }
    function clear() { data = null; el('dashboard-data').hidden = true; el('freshness').hidden = true; ['metrics','daily-chart','daily-axis','daily-table','journey','fields','roles','themes','popular-jobs','companies','page-timing','events','timing-stats','away-average','trend-summary','freshness','cohort-note','retention-note'].forEach(function (id) { el(id).replaceChildren(); }); text('question-answer', 'Try a suggested question to get started.'); el('question').value = ''; }
    function bars(id, rows, empty) {
      var parent = el(id); parent.replaceChildren();
      if (!rows.length) { parent.appendChild(node('li', empty || 'No reportable groups in this window. Empty groups may be below the privacy threshold.', 'empty-chart')); return; }
      var max = rows.reduce(function (n, r) { return Math.max(n, r.count || 0); }, 0);
      rows.forEach(function (row) { var li = node('li'), labels = node('div', undefined, 'bar-labels'), track = node('div', undefined, 'bar-track'), fill = node('div', undefined, 'bar-fill'); labels.append(node('span', row.label), node('strong', format(row.count))); fill.style.setProperty('--bar-size', percent(row.count, max) + '%'); track.setAttribute('aria-hidden', 'true'); track.appendChild(fill); li.append(labels, track); parent.appendChild(li); });
    }
    function drawTrend() {
      if (!data) return;
      var key = el('trend-metric').value, label = { visits: 'visits', job_opens: 'job opens', apply_clicks: 'Apply clicks' }[key], values = data.daily, max = values.reduce(function (n, d) { return Math.max(n, d[key] || 0); }, 0), available = values.filter(function (d) { return d[key] !== null; });
      text('trend-summary', values.length ? available.length + ' days with available ' + label + ' counts. Highest day: ' + format(available.length ? max : null) + '. Daily dates use UTC.' : 'No daily measurements returned for this window.');
      el('daily-chart').replaceChildren(); values.forEach(function (d) { var n = node('span', undefined, 'daily-bar'); n.style.setProperty('--bar-size', percent(d[key], max) + '%'); n.title = d.date + ': ' + format(d[key]); el('daily-chart').appendChild(n); });
      el('daily-axis').replaceChildren(); if (values.length) el('daily-axis').append(node('span', values[0].date), node('span', values[values.length - 1].date));
    }
    function render(next) {
      data = next; el('dashboard-data').hidden = false; el('freshness').hidden = false;
      var isStale = stale(data.generatedAt); el('freshness').dataset.stale = String(!demo && isStale);
      text('freshness', demo ? 'SYNTHETIC PREVIEW · All counts are invented. Dates and windows are illustrative.' : (isStale ? 'STALE OR UNKNOWN REFRESH TIME · ' : '') + (data.generatedAt ? 'Generated ' + new Date(data.generatedAt).toLocaleString() + ' · ' : 'Refresh time unavailable · ') + (data.windowDays ? 'Last ' + data.windowDays + ' days · ' : '') + 'UTC daily buckets · Consented activity only');
      el('metrics').replaceChildren();
      [['visits','Visits','Recorded browsing sessions'], ['visitors','Visitors','Distinct analytics visitors'], ['job_opens','Job opens','Cards explored'], ['signups','Sign-ups','New accounts with analytics consent'], ['tracker_users','Tracker users','Distinct analytics visitors']].forEach(function (m) { var card = node('div', undefined, 'metric'); card.append(node('p', m[1], 'metric-label'), node('strong', format(data.totals[m[0]]), 'metric-value'), node('p', m[2], 'metric-note')); el('metrics').appendChild(card); });
      ['fields','roles','themes','events'].forEach(function (id) { bars(id, data[id]); });
      bars('popular-jobs', data.jobs.slice(0, 10)); bars('companies', data.companies.slice(0, 10));
      el('page-timing').replaceChildren(); var pageNames = { home: 'Home', board: 'Jobs board', tracker: 'Tracker', privacy: 'Privacy Policy', terms: 'Terms of Service', suggest: 'Suggest a job', other: 'Other pages' };
      var pageMax = data.pageTiming.reduce(function (n, r) { return Math.max(n, r.meanActiveSeconds || 0); }, 0);
      if (!data.pageTiming.length) el('page-timing').appendChild(node('li', 'No reportable page timing in this window. This may reflect missing measurements or small groups being withheld.', 'empty-chart'));
      data.pageTiming.forEach(function (r) { var li = node('li'), labels = node('div', undefined, 'bar-labels'), track = node('div', undefined, 'bar-track'), fill = node('div', undefined, 'bar-fill'); labels.append(node('span', pageNames[r.label]), node('strong', duration(r.meanActiveSeconds))); fill.style.setProperty('--bar-size', percent(r.meanActiveSeconds, pageMax) + '%'); track.setAttribute('aria-hidden', 'true'); track.appendChild(fill); li.append(labels, track, node('p', format(r.count) + ' timing events', 'small-note')); el('page-timing').appendChild(li); });
      bars('journey', [['Job opens','job_opens'],['Saves','saves'],['Apply clicks','apply_clicks'],['Reported applied','reported_applied']].map(function (r) { return { label: r[0], count: data.totals[r[1]] }; }));
      el('daily-table').replaceChildren(); data.daily.forEach(function (d) { var tr = node('tr'), th = node('th', d.date); th.scope = 'row'; tr.appendChild(th); ['visits','job_opens','apply_clicks'].forEach(function (key) { tr.appendChild(node('td', format(d[key]))); }); el('daily-table').appendChild(tr); }); drawTrend();
      text('away-average', duration(data.timing.meanAwaySeconds)); el('timing-stats').replaceChildren(); [['Returned','returned'],['No observed return','unknown'],['Reached 15-minute cap','capped']].forEach(function (r) { var div = node('div'); div.append(node('dt', r[0]), node('dd', format(data.timing[r[1]]))); el('timing-stats').appendChild(div); });
      text('cohort-note', data.privacy.minimumCohort !== null ? 'Field, role, theme, job, company and page-timing groups with fewer than ' + data.privacy.minimumCohort + ' distinct visitors are withheld. Visible bars do not show the whole audience.' : 'Small groups are withheld. The reporting threshold was not returned.');
      text('retention-note', data.privacy.rawRetentionDays !== null ? 'Reporting/use window and retention target: up to ' + data.privacy.rawRetentionDays + ' days. Physical deletion depends on the cleanup schedule and may lag.' : 'The reporting/use window and retention target were not returned.');
      text('question-answer', 'Try a suggested question to get started.');
      if (data.coverage.complete === false) state('error', 'This response is incomplete.', 'Some measurements could not be returned. Treat the visible numbers as partial and refresh to try again.');
      else if (!demo && data.totals.events === 0) state('empty', 'No recorded activity in this window.', 'The service returned successfully. Collection may be new, visitors may not have opted in, or instrumentation may need checking.');
      else state(null);
    }
    function signedIn() { return Boolean(win.SUAuth && typeof win.SUAuth.signedIn === 'function' && win.SUAuth.signedIn()); }
    async function load() {
      cancel(); demo = false; el('sample-banner').hidden = true; el('load-sample').disabled = false; clear();
      el('refresh').disabled = false; el('window-days').disabled = false;
      if (!signedIn()) { state('signed-out', 'Sign in to open the notebook.', 'Use the Google sign-in control above. Only an account authorized for this dashboard can view the analytics.'); return; }
      var serial = request, days = el('window-days').value; controller = new AbortController(); var signal = controller.signal;
      var timedOut = false, timer = win.setTimeout(function () { timedOut = true; if (controller && serial === request) controller.abort(); }, 15000);
      state('loading', 'Loading private analytics…', 'Checking your access and reading the selected window.'); el('refresh').disabled = true;
      try {
        var token = await win.SUAuth.getToken(); if (serial !== request || !signedIn()) return;
        if (!token) throw new Error('unauthorized');
        var response = await win.fetch('/.netlify/functions/analytics-admin?days=' + days, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', credentials: 'same-origin', signal: signal });
        if (serial !== request || !signedIn()) return;
        if (response.status === 401) throw new Error('unauthorized');
        if (response.status === 403) throw new Error('forbidden');
        if (!response.ok) throw new Error('unavailable');
        var raw = await response.json(); if (serial !== request || !signedIn()) return;
        var next = normalize(raw); if (next.windowDays !== Number(days)) throw new Error('invalid-window');
        render(next);
      } catch (error) {
        if (serial !== request || (error.name === 'AbortError' && !timedOut)) return;
        clear();
        if (error.message === 'forbidden') state('denied', 'This account does not have dashboard access.', 'Sign in with an authorized owner account. Your job-board account still works normally.');
        else if (error.message === 'unauthorized') state('signed-out', 'Your sign-in needs refreshing.', 'Sign in again, then choose Refresh. No analytics are displayed.');
        else state('error', 'Analytics are unavailable right now.', 'The service could not return a usable response. Check your connection and choose Refresh. No missing data has been replaced with zeros.');
      } finally { win.clearTimeout(timer); if (serial === request) { controller = null; el('refresh').disabled = false; } }
    }
    function ask(value) { el('question').value = value; text('question-answer', (demo ? 'SAMPLE DATA: ' : '') + answer(value, data)); }
    el('refresh').addEventListener('click', load); el('window-days').addEventListener('change', function () { if (demo) render(fixture(Number(el('window-days').value))); else load(); });
    el('trend-metric').addEventListener('change', drawTrend);
    el('load-sample').addEventListener('click', function () { cancel(); demo = true; el('sample-banner').hidden = false; el('load-sample').disabled = true; el('refresh').disabled = false; render(fixture(Number(el('window-days').value))); });
    el('exit-sample').addEventListener('click', load);
    el('question-form').addEventListener('submit', function (event) { event.preventDefault(); ask(el('question').value); });
    doc.querySelectorAll('[data-question]').forEach(function (button) { button.addEventListener('click', function () { ask(button.dataset.question); el('question-answer').scrollIntoView({ block: 'nearest', behavior: 'auto' }); }); });
    win.addEventListener('su:auth-changed', load);
    win.addEventListener('pagehide', function () { cancel(); clear(); });
    win.addEventListener('pageshow', function (event) { if (event.persisted) load(); });
    load();
  }
  return { count: count, format: format, percent: percent, duration: duration, normalize: normalize, stale: stale, answer: answer, fixture: fixture, mount: mount };
});
