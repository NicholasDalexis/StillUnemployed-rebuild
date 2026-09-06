const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const I = require('../../js/internships.js');

// Reuse the real board renderer/event adapter, changing only its fixture URL.
// No shared test file or product implementation is rewritten on disk.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const firstTest = fixtureSource.indexOf('\ntest(');
assert(firstTest > 0);
const fixture = fixtureSource.slice(0, firstTest);
const inlineScripts = [...fs.readFileSync(path.join(__dirname, '../../internships.html'), 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const themeScripts = inlineScripts.map(match => match[1]).filter(script => script.includes('SLUG2LOOK'));
assert.equal(themeScripts.length, 1, 'the actual page owns one theme bootstrap');
const themeBootstrap = themeScripts[0];
const internshipFixture = fixture.replace("pathname:'/jobs.html'", "pathname:'/internships.html'")
  .replace("response,fetchError,", "response,fetchError,hostname='preview--stillunemployed.netlify.app',")
  .replace("hostname:'preview--stillunemployed.netlify.app'", "hostname")
  .replace('vm.runInNewContext(instrumented,context', "document.documentElement=document.createElement('html');vm.runInNewContext(themeBootstrap,context,{filename:'internships.html'});vm.runInNewContext(instrumented,context");
assert.notEqual(internshipFixture, fixture, 'the internship route is set before app.js initializes');
const fixtureModule = { exports:{} };
vm.runInNewContext(internshipFixture + '\nmodule.exports={board};', {
  require:createRequire(fixturePath), module:fixtureModule, __dirname,
  Buffer, URL, URLSearchParams, setImmediate, themeBootstrap
}, { filename:fixturePath });
const { board } = fixtureModule.exports;

test('hosted internships honor the live catalog and never fall back after a status failure', async () => {
  const b = board({fetchError:new Error('status service unavailable')});
  b.window.SUInternships=I;await b.boot();
  assert.equal(b.requests.length,1);
  assert.equal(b.requests[0].url,'/.netlify/functions/internships-catalog');
  assert.equal(b.app.jobs.length,0);assert.equal(b.app._loadError,true);
  assert(b.grid.querySelector('[data-act="retryJobs"]'));
});

test('an explicitly empty reviewed feed has a current empty state, distinct from initial preparation', async () => {
  for(const [status,copy] of [['verified','No internships listed right now.'],['awaiting_verification','The internship notebook is getting ready.']]){
    const b=board({response:{ok:true,json:async()=>({schemaVersion:2,status,jobs:[]})}});
    b.window.SUInternships=I;await b.boot();
    assert.equal(b.app._loadError,undefined);assert(b.grid.textContent.includes(copy));
  }
});

test('localhost previews load only the reviewed local snapshot', async () => {
  const b=board({hostname:'localhost',response:{ok:true,json:async()=>({schemaVersion:2,status:'verified',jobs:[]})}});
  b.window.SUInternships=I;await b.boot();
  assert.equal(b.requests.length,1);assert.equal(b.requests[0].url,'./internships-data.json');
  assert.equal(b.app.jobs.length,0);
});
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function listing(extra = {}) {
  const link = extra.link || 'https://example.com/program/design';
  return { co:'Example Studio', role:'Design Intern', link, loc:'Chicago, IL', state:'IL', style:'Hybrid', ind:'Video & Creative',
    desc:'An employer-reviewed student opportunity.', pay:'$22.50/hour', payStatus:'paid', payBasis:'hour',
    eligibility:'Current college students. Must remain enrolled through the complete program and meet the employer’s location requirements.',
    eligibilityFlags:['current_student'], collegeCredit:'available', benefits:['Transit allowance'], cycle:'Summer program',
    duties:['Assist with production files.', 'Help prepare visual concepts.', 'Present research to the design team.'],
    applicationStatus:'open', timingSourceUrl:link, verification:{ status:'open', checkedAt:new Date().toISOString(), sourceUrl:link, reviewerType:'source_check' },
    ...extra };
}
function upcoming(extra = {}) {
  const link = extra.link || 'https://example.com/program/upcoming';
  return listing({ link, applicationStatus:'upcoming', applicationsOpen:'Applications open in a future cycle', applicationsOpenISO:day(30), timingSourceUrl:link,
    verification:{ status:'upcoming', checkedAt:new Date().toISOString(), sourceUrl:link, reviewerType:'source_check', sourceAnnounced:true, upcomingApproved:true }, ...extra });
}
function ui(rows, options = {}) {
  const b = board(options), events = [];
  b.window.SUInternships = I;
  b.window.SUAnalytics.job = (name, link) => events.push({ name, link });
  const jobs = I.jobs({ schemaVersion:2, status:'verified', jobs:rows });
  assert.equal(jobs.length, rows.length, 'all fixture rows satisfy the public contract');
  b.init(jobs);assert.equal(b.app.internships, true);
  return { ...b, events,
    cards() { return b.grid.querySelectorAll('.note[data-act="openJob"]'); },
    card(link) { const card = this.cards().find(node => node.getAttribute('data-link') === link);assert(card, link);return card; },
    detail(link) { this.card(link).click();const dialog = b.overlay.querySelector('[role="dialog"]');assert(dialog);return dialog; }
  };
}

test('internship cards and details retain exact employer pay without annualizing hourly, weekly or program amounts', () => {
  const values = [
    { pay:'$22.50/hour', payBasis:'hour' }, { pay:'$1,100/week', payBasis:'week' },
    { pay:'$4,500 program stipend', payBasis:'program' },
    { pay:'$120,000/year (annualized)', payBasis:'annualized_year' }
  ];
  for (const look of ['original','poker','beauty','girly','mermaid','bratt','noir','chess']) {
    const rows = values.map((pay, index) => listing({ ...pay, link:'https://example.com/program/pay/' + index }));
    const b = ui(rows, { look }), surfaces = [];
    for (const row of rows) {
      const card = b.card(row.link), label = card.querySelector('.su-internship-pay');assert(label);
      assert(label.textContent.includes(row.pay), look + ' preserves ' + row.pay);
      surfaces.push(card.style.background);
      const detail = b.detail(row.link);assert(detail.textContent.includes(row.pay));
      b.app.setState({ detailOpen:false });
    }
    assert.equal(new Set(surfaces).size, 1, look + ' does not turn internship rates into full-time salary tiers');
    assert(!b.grid.textContent.includes('$46,800'), 'no computed annual equivalent for hourly pay');
  }
});

test('USD amounts keep an explicit currency marker in both the card and detail', () => {
  const row = listing({ pay:'USD 23.75/hour' }), b = ui([row]);
  const label = b.card(row.link).querySelector('.su-internship-pay').textContent;
  assert.match(label, /(?:USD|\$)\s*23\.75\/hour/);
  assert(b.detail(row.link).textContent.includes(label));
});

test('a full internship grid does not add the full-time high-salary endorsement notes', () => {
  const rows = Array.from({ length:12 }, (_, index) => listing({ link:'https://example.com/program/annualized/' + index,
    pay:'$120,000/year (annualized)', payBasis:'annualized_year' }));
  const b = ui(rows);assert.equal(b.cards().length, 12);
  for (const card of b.cards()) assert.equal(card.querySelector('[data-act="openNote"]'), null);
});

test('full eligibility and employer facts remain distinct from the maximum three optional duties', () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link);
  assert(detail.querySelector('.su-internship-details').textContent.includes(row.eligibility));
  assert(detail.textContent.includes(row.benefits[0]));
  const duties = detail.querySelector('.su-internship-duties');assert(duties);
  assert.deepEqual(Array.from(duties.querySelectorAll('li'), node => node.textContent), row.duties);
  assert(!duties.textContent.includes(row.eligibility), 'eligibility is not truncated into duties');
});

test('missing duties stay honest and an unexpected fourth duty never crowds out full eligibility', () => {
  const row = upcoming({ duties:[] }), b = ui([row]);
  const detail = b.detail(row.link);
  assert.equal(detail.querySelector('.su-internship-duties'), null);
  assert.match(detail.textContent, /employer’s program page for duties/);
  assert(detail.textContent.includes(row.eligibility));
  b.app.jobs[0].duties = ['One task.', 'Two tasks.', 'Three tasks.', 'Unexpected fourth task.'];
  b.app.renderOverlays();const updated = b.overlay.querySelector('[role="dialog"]');
  assert.equal(updated.querySelector('.su-internship-duties').querySelectorAll('li').length, 3);
  assert(!updated.textContent.includes('Unexpected fourth task.'));assert(updated.textContent.includes(row.eligibility));
});

test('accepting, upcoming and unconfirmed cards have exclusive factual labels and counts', () => {
  const rows = [listing(), upcoming(), upcoming({ link:'https://example.com/program/stale', applicationsOpenISO:day(-1) })];
  const b = ui(rows);
  const expected = ['accepting', 'upcoming', 'needs_recheck'];
  assert.deepEqual(rows.map(row => I.applicationState(row)), expected);
  const labels = rows.map(row => b.card(row.link).querySelector('.su-internship-status').textContent);
  assert.match(labels[0], /accepting/i);assert.match(labels[1], /upcoming/i);assert.equal(labels[2], 'Application status unconfirmed');
  const count = b.grid.querySelector('.su-internship-counts');assert(count);
  assert.match(count.textContent, /1 accepting now/i);assert.match(count.textContent, /1 upcoming/i);assert.match(count.textContent, /1 needing a status check/i);
  assert.doesNotMatch(count.textContent, /status being checked/i, 'the count does not imply an active automated check');
});

test('focus returning from outside the document stays within the active detail and releases after close', () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link);
  const outside = b.document.body.appendChild(b.document.createElement('button'));
  const apply = detail.querySelector('[data-act="detailApply"]');assert(apply);
  apply.focus();b.fire('focusin', apply);
  assert.equal(b.document.activeElement, apply, 'a valid dialog focus target is preserved');
  outside.focus();b.fire('focusin', outside);
  assert(detail.contains(b.document.activeElement), 'a focus move into the page returns inside the dialog');
  b.fire('keydown', b.document.activeElement, { key:'Escape' });
  assert.equal(b.overlay.querySelector('[role="dialog"]'), null);
  outside.focus();b.fire('focusin', outside);
  assert.equal(b.document.activeElement, outside, 'closed dialogs no longer redirect page focus');
});

test('an open native welcome dialog retains ownership of focus over the board detail', () => {
  const row = listing(), b = ui([row]);b.detail(row.link);
  const welcome = b.document.body.appendChild(b.document.createElement('dialog'));
  welcome.id = 'su-launch';welcome.setAttribute('open', '');
  const button = welcome.appendChild(b.document.createElement('button'));
  button.focus();b.fire('focusin', button);
  assert.equal(b.document.activeElement, button, 'the board guard does not steal focus from the native dialog');
});

test('unpaid and undisclosed opportunities stay distinct and status counts follow the filtered cards', () => {
  const rows = [listing(), listing({ link:'https://example.com/program/unpaid', payStatus:'unpaid', pay:'Unpaid', payBasis:'not_listed', collegeCredit:'not_listed' }),
    listing({ link:'https://example.com/program/unknown-pay', payStatus:'not_disclosed', pay:'Not disclosed', payBasis:'not_listed' })];
  const b = ui(rows);
  assert.equal(b.card(rows[1].link).querySelector('.su-internship-pay').textContent, 'Unpaid');
  assert.match(b.card(rows[2].link).querySelector('.su-internship-pay').textContent, /not disclosed/i);
  b.app.setState({ pr:'Paid' });assert.equal(b.cards().length, 1);
  assert.equal(b.cards()[0].getAttribute('data-link'), rows[0].link);
  assert.match(b.grid.querySelector('.su-internship-counts').textContent, /1 accepting now.*0 upcoming/i);
});

test('View program for upcoming or recheck listings never opens application feedback or reports an application action', () => {
  for (const row of [upcoming(), upcoming({ applicationsOpenISO:day(-1) })]) {
    const b = ui([row]), card = b.card(row.link);
    assert.match(card.querySelector('.applylink2').textContent, /View program/);
    const detail = b.detail(row.link), view = detail.querySelector('[data-act="detailProgram"]');assert(view);
    assert.equal(detail.querySelector('[data-act="detailApply"]'), null);
    view.click();assert.equal(b.opened.length, 1);assert.equal(b.opened[0][0], row.link);assert.equal(b.opened[0][2], 'noopener');
    assert.equal(b.app.state.feedbackOpen, false);
    assert(!b.events.some(event => ['apply_click','application_reported'].includes(event.name)));
    assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), []);assert.equal(b.requests.length, 0);
  }
});

test('accepting Apply Now opens feedback, but only an explicit I applied confirmation creates a tracker record', () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link);
  const apply = detail.querySelector('[data-act="detailApply"]');assert(apply);assert.match(apply.textContent, /Apply Now/);
  apply.click();assert.equal(b.opened[0][0], row.link);assert.equal(b.app.state.feedbackOpen, true);
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), []);
  assert.equal(b.events.filter(event => event.name === 'apply_click').length, 1);
  b.overlay.querySelector('[data-act="markApplied"]').click();
  assert.equal(JSON.parse(b.localStorage.getItem('su_tracker'))[0].link, row.link);
  assert.equal(b.events.filter(event => event.name === 'application_reported').length, 1);
});

test('a previously rendered Apply control cannot submit application feedback after the listing stops accepting', () => {
  const row = listing(), b = ui([row]), detail = b.detail(row.link), apply = detail.querySelector('[data-act="detailApply"]');
  b.app.jobs[0].applicationStatus = 'unknown';apply.click();
  assert.equal(b.app.state.feedbackOpen, false);
  assert(!b.events.some(event => ['apply_click','application_reported'].includes(event.name)));
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), []);
});

test('internship Saved and Tracker retain existing raw URL identities across canonical employer aliases', () => {
  const primary = 'https://boards.greenhouse.io/example/jobs/12345';
  const alias = 'https://job-boards.greenhouse.io/example/jobs/12345';
  const oldTracker = { id:'existing-internship', company:'Example Studio', role:'Design Intern', link:alias, status:'Interview', notes:'Existing private note' };
  const b = ui([listing({ link:primary })], { saved:{ [alias]:true }, tracker:[oldTracker] });
  assert.equal(b.cards().length, 1);assert.equal(b.app.isSaved(primary), true);
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')), { [alias]:true }, 'rendering does not migrate the existing key');
  b.card(primary).querySelector('[data-act="toggleSave"]').click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')), {}, 'unsaving removes the equivalent stored alias');
  b.card(primary).querySelector('[data-act="toggleSave"]').click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_saved_jobs')), { [primary]:true });
  b.detail(primary).querySelector('[data-act="detailApply"]').click();
  b.overlay.querySelector('[data-act="markApplied"]').click();
  assert.deepEqual(JSON.parse(b.localStorage.getItem('su_tracker')), [oldTracker], 'confirmation does not duplicate or overwrite an existing equivalent tracker record');
});

test('sharing an internship returns to the internship feed with the same URL identity and selected theme', () => {
  const row = listing(), b = ui([row], { look:'poker' });
  b.detail(row.link).querySelector('[data-act="detailShare"]').click();
  assert.equal(b.shared.length, 1);const shared = new URL(b.shared[0].url);
  assert.equal(shared.pathname, '/internships.html');assert.equal(shared.searchParams.get('theme'), 'poker');
  assert.equal(Buffer.from(shared.searchParams.get('job'), 'base64').toString('utf8'), row.link);
  const next = ui([row], { search:shared.search });
  assert.equal(next.app.state.look, 'poker');next.runTimers(900);
  assert.equal(next.card(row.link).scrolled, true, 'the incoming share highlights its matching internship');
  assert.equal(next.card(row.link).style.outline, '3px solid #D8502E');
  next.detail(row.link);assert.equal(next.app.state.detailLink, row.link);
});

test('employer text renders as text, without introducing executable markup or account/reviewer fields', () => {
  const sentinel = 'PRIVATE_REVIEW_NOTE_SHOULD_NOT_RENDER';
  const row = listing({ eligibility:'Students who can discuss <script>alert(1)</script> safely.',
    eligibilityFlags:['Students <img src=x onerror=alert(1)>'], duties:['Discuss <svg onload=alert(1)> examples.'],
    benefits:['Meals & transit'], privateReviewNote:sentinel });
  const b = ui([row]), detail = b.detail(row.link);
  assert(detail.textContent.includes(row.eligibility));assert(detail.textContent.includes(row.duties[0]));
  assert.equal(detail.querySelector('script,img,svg[onload],[onerror]'), null);
  assert(!b.grid.textContent.includes(sentinel));assert(!detail.textContent.includes(sentinel));
});
