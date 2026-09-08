const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const States = require('../../js/us-states.js');
const Pay = require('../../js/pay-display.js');
const Internships = require('../../js/internships.js');
const Discovery = require('../../js/discovery.js');

// Run the actual app renderer, CSV ingestion, filtering and delegated events.
// Instrumentation exposes existing helpers only; it changes no app behavior.
// This offline DOM adapter cannot establish browser layout or visual fit.
const fixturePath = path.join(__dirname, 'board-qa.test.cjs');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const firstTest = fixtureSource.indexOf('\ntest(');
assert(firstTest > 0);
let prefix = fixtureSource.slice(0, firstTest);
const replace = (from, to) => { assert(prefix.includes(from), 'fixture hook: ' + from); prefix = prefix.replace(from, to); };
replace('response,fetchError,', "response,fetchError,pathname='/jobs.html',");
replace("pathname:'/jobs.html'", 'pathname');
replace('deriveState, suShareJob};', 'deriveState, suShareJob, cardPay, payDisclosure, canonicalState, isRemoteAnywhere};');
const fixture = { exports:{} };
vm.runInNewContext(prefix + '\nmodule.exports={board,job,row,csv};', {
  module:fixture, require:createRequire(fixturePath), __dirname, Buffer, URL, URLSearchParams, setImmediate
}, { filename:fixturePath });
const { board, job, row, csv } = fixture.exports;
function ui(options = {}) {
  const b = board(options);
  Object.assign(b.window, { SUStates:States, SUPayDisplay:Pay, SUInternships:Internships });
  return b;
}
function card(b, link) {
  const found = b.grid.querySelectorAll('.note[data-act="openJob"]').find(node => node.getAttribute('data-link') === link);
  assert(found, 'card exists for ' + link); return found;
}
function detail(b, link) { card(b, link).click(); const found = b.overlay.querySelector('[role="dialog"]'); assert(found); return found; }
function intern(extra = {}) {
  const link = extra.link || 'https://example.com/intern/design';
  return job({ internship:true, role:'Design Intern', link, loc:'Chicago, IL', state:'IL', style:'Hybrid',
    pay:'$22.50/hour', payStatus:'paid', payBasis:'hour', applicationStatus:'open', timingSourceUrl:link,
    verification:{status:'open',checkedAt:new Date().toISOString(),sourceUrl:link,reviewerType:'source_check'},
    duties:['Prepare design files.', 'Research visual concepts.', 'Present ideas.'], eligibility:'Current college students.', ...extra });
}

test('real Jobs cards and detail headings compact annual pay while preserving source data and salary tier', () => {
  for (const [pay, compact, tier] of [['$75,600', '$76K', 'low'], ['$138,600', '$139K', 'high'], ['$41,460', '$41K', 'low'], ['$79,999', '$80K', 'low']]) {
    const b = ui(), original = job({pay}); b.init([original]);
    const front = card(b, original.link); assert(front.textContent.includes(compact)); assert(!front.textContent.includes(pay));
    assert.equal(b.app.payTier(original.pay), tier, 'rounding never changes the salary-band input');
    const dialog = detail(b, original.link);
    assert.equal(dialog.querySelector('.su-pay-source'), null, 'the TL;DR no longer adds a Pay details disclosure');
    assert(!dialog.textContent.includes('Pay details'));
    assert(!dialog.textContent.includes(pay), 'the exact amount is not duplicated below the compact heading');
    assert(dialog.children.some(node => node.textContent === compact), 'compact value is in the actual detail heading');
    assert.equal(original.pay, pay); assert.equal(b.app.jobs[0].pay, pay);
  }
});

test('internship faces and detail headings use compact paid labels without losing hourly or annual source facts', () => {
  const cases = [
    [{pay:'$22.50/hour',payBasis:'hour'}, '$23/hour'],
    [{pay:'$1,100/week',payBasis:'week'}, '$1,100/week'],
    [{pay:'$138,600/year (annualized)',payBasis:'annualized_year'}, '$139K/year'],
    [{pay:'Paid; amount not disclosed',payBasis:'not_listed'}, '$ Paid']
  ];
  for (const [fields, compact] of cases) {
    const b = ui({pathname:'/internships.html'}), original = intern(fields); b.init([original]);
    assert.equal(card(b, original.link).querySelector('.su-internship-pay').textContent, compact);
    const dialog = detail(b, original.link);
    assert(dialog.children.some(node => node.textContent === compact), 'internship detail heading uses ' + compact);
    assert.equal(dialog.querySelector('.su-pay-source'), null, 'the detail keeps one compact pay label');
    assert.equal(original.pay, fields.pay);assert.equal(b.app.jobs[0].pay, fields.pay);
    assert.equal(b.app.jobs[0].payBasis, fields.payBasis, 'display rounding never rewrites the source unit');
    if (fields.payBasis === 'hour') assert(!dialog.textContent.includes('/year'), 'hourly pay is never annualized');
  }
});

test('pay rendering stays inert and the approved small internship hourly assumption is display-only', () => {
  const b = ui(), unsafe = job({pay:'$75,600 <img src=x onerror=alert(1)>'}); b.init([unsafe]);
  const dialog = detail(b, unsafe.link);
  assert.equal(dialog.querySelector('.su-pay-source'), null);assert.equal(dialog.querySelector('img,[onerror],script'), null);
  assert.equal(b.app.jobs[0].pay, unsafe.pay, 'raw employer text stays untouched');
  const student = intern({pay:'$23.75 (time unit not listed)',payBasis:'not_listed'}), before=JSON.stringify(student);
  assert.equal(b.helpers.cardPay(student), '$24/hour');
  assert.equal(JSON.stringify(student),before,'the hourly assumption is presentation only');
  assert.equal(b.helpers.cardPay(intern({pay:'$1,100/week',payBasis:'week'})), '$1,100/week', 'an explicit employer unit is never replaced');
  assert.equal(b.helpers.cardPay(intern({pay:'Not disclosed',payStatus:'not_disclosed'})), 'Pay not disclosed');
  assert.equal(b.helpers.cardPay(intern({pay:'Unpaid',payStatus:'unpaid'})), 'Unpaid');
});

test('the rendered selector always offers all states plus exactly 50 full names, independent of source garbage or an empty feed', () => {
  for (const records of [[], [job({state:'California-Los Angeles 1041 N. Formosa Ave',loc:'California-Los Angeles 1041 N. Formosa Ave'}), job({link:'https://example.com/tegna',state:'Any TEGNA Station Location',loc:'Any TEGNA Station Location'})]]) {
    const b = ui(); b.init(records); b.app.setState({openPanel:'filters'});
    const select = b.document.getElementById('su-state'); assert(select);
    const options = select.querySelectorAll('option'); assert.equal(options.length, 51);
    assert.deepEqual(Array.from(options,node => node.getAttribute('value')), ['all', ...States.STATES.map(state => state.code)]);
    assert.deepEqual(Array.from(options.slice(1),node => node.textContent), States.STATES.map(state => state.name));
    assert(!select.textContent.includes('Formosa')); assert(!select.textContent.includes('TEGNA'));
    assert.equal(options.find(node => node.getAttribute('value') === 'DC'), undefined);
  }
});

test('actual CSV ingestion and matchesBase handle all explicit states, unrestricted remote and DC without widening restrictions', () => {
  const b = ui();
  const locations = [
    ['ca','California-Los Angeles 1041 N. Formosa Ave'], ['multi','San Francisco, CA or New York, NY'],
    ['dc','Washington, DC'], ['dc-address','DC-Washington; 2121 Wisconsin Ave NW (Nexstar-WDCW)'],
    ['wa','Renton, Washington'], ['restricted','New York, NY (Remote)'],
    ['anywhere','Remote, United States'], ['restricted-unknown','Remote, US (state restrictions)'],
    ['unknown','Any TEGNA Station Location']
  ];
  const records = b.helpers.rowsToJobs(b.helpers.parseCSV(csv(locations.map(([id,Location]) => row({Link:'https://example.com/'+id,Location})))));
  b.init(records);
  const matching = state => { b.app.state.st=state; return Array.from(b.app.computeShown().shown,j=>j.link.split('/').pop()).sort(); };
  assert.deepEqual(matching('CA'), ['anywhere','ca','multi']);
  assert.deepEqual(matching('NY'), ['anywhere','multi','restricted']);
  assert.deepEqual(matching('WA'), ['anywhere','wa']);
  assert.deepEqual(matching('WI'), ['anywhere']);
  assert.equal(matching('all').length, locations.length);
  b.app.state.st='CA';
  assert.equal(b.app.matchesBase(job({state:'Remote',loc:'New York, NY (Remote)'})), false, 'legacy Remote label cannot override an explicit location');
  assert.equal(b.app.matchesBase(job({state:'Remote',loc:'Remote (Pittsburgh)'})), false);
});

test('restored view state migrates full-name/address selections and rejects ambiguous or unknown values before rendering', async () => {
  for (const [old, expected] of [['California','CA'], ['ca','CA'], ['California-Los Angeles 1041 N. Formosa Ave','CA'], ['NY/CA','all'], ['Any TEGNA Station Location','all'], ['Remote','all'], ['Washington, DC','all'], ['all','all'], [undefined,'all']]) {
    const b = ui();
    const receipt = {state:{st:old,q:'',cat:'all',ws:'Any',pr:'Any',fr:'Any',savedOnly:false},y:0};
    let saved;
    b.window.SUBoardRuntime={checkOwner:()=>false,read:()=>receipt,request:(_key,load)=>Promise.resolve().then(load),save:(_key,state)=>{saved={...state};}};
    await b.boot(); assert.equal(b.app.state.st, expected, String(old));
    b.fireWindow('pagehide'); assert.equal(saved.st, expected, 'the next receipt stores the canonical value');
    b.app.setState({openPanel:'filters'});
    const selected = b.document.getElementById('su-state').querySelectorAll('option').filter(node => node.getAttribute('selected') !== null);
    assert.equal(selected.length, 1); assert.equal(selected[0].getAttribute('value'), expected);
  }
});

test('internship filtering understands entire source-location state fields and counts the selected offices', () => {
  const b=ui({pathname:'/internships.html'});
  const multi='San Francisco, CA or New York, NY; hub based';
  b.init([intern({link:'https://example.com/intern/multi',state:multi,loc:multi}),
    intern({link:'https://example.com/intern/ca',state:'El Segundo, CA; body says hybrid, header says onsite',loc:'El Segundo, CA; body says hybrid, header says onsite'}),
    intern({link:'https://example.com/intern/dc',state:'Washington, DC',loc:'Washington, DC'})]);
  b.app.setState({st:'NY'});
  assert.deepEqual(Array.from(b.app.computeShown().shown,j=>j.link),['https://example.com/intern/multi']);
  assert.equal(b.grid.querySelector('.su-results-count').textContent,'1 internship');
  b.app.setState({st:'CA'});assert.equal(b.app.computeShown().shown.length,2);
  b.app.setState({st:'WA'});assert.equal(b.app.computeShown().shown.length,0);
  b.app.setState({st:'all'});assert.equal(b.app.computeShown().shown.length,3);
});

test('state control events update effective results, full-name chip and compact count, then clear predictably', () => {
  const b = ui(); b.init([job({link:'https://example.com/ca',loc:'Los Angeles, CA',state:'CA'}), job({link:'https://example.com/ny',loc:'New York, NY',state:'NY'})]);
  b.app.setState({openPanel:'filters'});
  const select = b.document.getElementById('su-state'); select.value='CA'; b.fire('change',select);
  assert.equal(b.app.state.st,'CA'); assert.equal(b.app.computeShown().shown.length,1);
  assert.equal(b.grid.querySelector('.su-results-count').textContent,'1 job');
  const chip = b.grid.querySelector('[data-act="chipSt"]'); assert(chip.textContent.includes('California')); chip.click();
  assert.equal(b.app.state.st,'all'); assert.equal(b.grid.querySelector('.su-results-count').textContent,'2 jobs');
});

test('real discovery actions stay in Board menu below the far-right count, separate from theme and Saved controls', () => {
  for (const signedIn of [false,true]) {
    const b = ui(), root = b.window;
    root.document=b.document; root.localStorage=b.localStorage;
    root.SUAuth={signedIn:()=>signedIn,syncReady:()=>true,syncState:()=> 'synced'};
    root.SUStore={owner:()=>signedIn?'alice':null,discovery:()=>({}),view:()=>({saved:{},tracker:[]})};
    root.SUDiscovery=Discovery.create(root); b.init();
    const menu=b.document.getElementById('su-board-menu'); assert(menu);
    assert.equal(menu.tagName,'DETAILS'); assert.equal(menu.getAttribute('open'),null);
    const count=b.grid.querySelector('.su-results-count'); assert.equal(menu.parentElement.parentElement,count.parentElement);assert(count.parentElement.classList.contains('su-board-meta'));
    assert(menu.parentElement.classList.contains('su-board-utilities'));
    const actions=menu.querySelectorAll('a,button'); assert.equal(actions.length,signedIn?5:4);
    assert(menu.querySelector('[data-discovery="hidden"]')); assert(menu.querySelector('a[href="./suggest.html"]')); assert(menu.querySelector('[data-act="openWelcome"]'));
    assert.equal(menu.querySelector('[data-act="openModal"]').textContent,'About Nic');
    assert.equal(!!menu.querySelector('[data-discovery="settings"]'),signedIn);
    for(const action of ['toggleSavedOnly','toggleLook']) assert.equal(menu.querySelector('[data-act="'+action+'"]'),null);
    assert(!b.grid.querySelector('.su-main-nav').contains(menu));
    assert.equal(b.grid.querySelector('[data-discovery="recommend"]'),null);
    assert.equal(b.overlay.querySelector('[role="dialog"]'),null,'preferences never auto-open on init');
  }
});

test('Jobs and Internships entrypoints load both shared presentation modules before the app', () => {
  for(const name of ['jobs.html','internships.html']){
    const html=fs.readFileSync(path.join(__dirname,'../..',name),'utf8');
    const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1].split('?')[0]);
    const app=scripts.findIndex(src=>src.endsWith('/app.js'));
    for(const module of ['us-states.js','pay-display.js']){const i=scripts.findIndex(src=>src.endsWith('/'+module));assert(i>=0&&i<app,name+' loads '+module+' before app');}
  }
});


test('Show hidden jobs contains only dismissed cards and never advice or personal envelopes', () => {
  const b=ui(),root=b.window,rows=Array.from({length:12},(_,i)=>job({link:'https://example.com/hidden/'+i,pay:'$120K'}));
  root.document=b.document;root.localStorage=b.localStorage;root.SUAuth={signedIn:()=>false};root.SUDiscovery=Discovery.create(root);
  b.init(rows);
  for(const row of rows)assert.equal(root.SUDiscovery.dismiss(row.link,'not_fit'),true);
  b.app.render();assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,0);
  b.grid.querySelector('[data-discovery="hidden"]').click();
  assert.equal(root.SUDiscovery.showHidden(),true);assert.equal(b.grid.querySelectorAll('.note[data-act="openJob"]').length,12);
  assert.equal(b.grid.querySelector('.su-advice'),null,'hidden view is a review list, not an advice feed');
  assert.equal(b.grid.querySelector('[data-act="openNote"]'),null);assert.equal(b.grid.querySelector('[data-act="closeNote"]'),null);
  assert.equal(b.grid.querySelectorAll('[data-discovery="restore"]').length,12);
});
