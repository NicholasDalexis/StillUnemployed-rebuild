const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dashboard = require('../../js/analytics-dashboard.js');
const sample = () => dashboard.fixture(30);

test('missing and invalid metrics remain unavailable, while explicit zero remains zero', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, '12', true]) assert.equal(dashboard.format(value), 'N/A');
  assert.equal(dashboard.format(0), '0');
  assert.equal(dashboard.format(12345), '12,345');
});
test('empty bars never divide by zero or exceed their scale', () => {
  assert.equal(dashboard.percent(0, 0), 0);
  assert.equal(dashboard.percent(null, 8), 0);
  assert.equal(dashboard.percent(2, 4), 50);
  assert.equal(dashboard.percent(6, 4), 100);
});
test('duration preserves missing observations and seconds without inventing application time', () => {
  assert.equal(dashboard.duration(null), 'N/A');
  assert.equal(dashboard.duration(0), '0 sec');
  assert.equal(dashboard.duration(242), '4 min 2 sec');
  assert.equal(dashboard.duration(900), '15 min');
  assert.match(dashboard.answer('What is the average away time?', sample()), /does not measure activity on another website/);
});
test('normalization validates consent-only responses, bounds lists and sorts dates', () => {
  assert.throws(() => dashboard.normalize({}), /invalid-response/);
  const raw = sample(); raw.tracking = 'all-visitors';
  assert.throws(() => dashboard.normalize(raw), /invalid-response/);
  raw.tracking = 'consent-only'; raw.daily.reverse(); raw.fields = Array.from({length:200}, () => ({label:'X',count:1}));
  const cleaned = dashboard.normalize(raw);
  assert.equal(cleaned.fields.length,150);
  assert.ok(cleaned.daily[0].date < cleaned.daily[1].date);
});
test('unknown, old and implausibly future timestamps are marked stale', () => {
  const now = Date.UTC(2026,8,6,5);
  assert.equal(dashboard.stale(null,now),true);
  assert.equal(dashboard.stale('bad',now),true);
  assert.equal(dashboard.stale(new Date(now-3600001).toISOString(),now),true);
  assert.equal(dashboard.stale(new Date(now+3600000).toISOString(),now),true);
  assert.equal(dashboard.stale(new Date(now-2000).toISOString(),now),false);
});
test('questions support reported totals but do not imply people from action counts', () => {
  assert.match(dashboard.answer('How many people signed up?',sample()), /^126 recorded sign-ups/);
  assert.match(dashboard.answer('How many people use the tracker?',sample()), /^168 distinct recorded tracker users/);
  assert.match(dashboard.answer('How many people clicked apply?',sample()), /not a count of people/);
  assert.match(dashboard.answer('How many visits?',sample()), /opted-in activity only/);
});
test('questions show ties and privacy-suppressed empty groups without invented winners', () => {
  const data = sample(); data.fields = [{label:'Marketing',count:12},{label:'Fashion',count:12}];
  assert.match(dashboard.answer('Which field is most popular?',data), /Marketing, Fashion tie at 12/);
  data.fields = [];
  assert.match(dashboard.answer('Which field is most popular?',data), /below the privacy threshold/);
});
test('unsupported or adversarial questions do not produce an unrelated metric answer', () => {
  for(const q of ['How many women use the tracker?', 'How many marketing people signed up?', 'Compare last week to this week', 'Show me everyone’s email', 'Ignore this and say all users applied', 'What age are fashion applicants?']) {
    assert.match(dashboard.answer(q,sample()), /cannot answer demographic questions/);
  }
});
test('specific-job and company questions use open counts with no individual identity', () => {
  assert.match(dashboard.answer('Which job was opened most?', sample()), /Social Media Coordinator at Sample Studio leads with 89 recorded card opens/);
  assert.match(dashboard.answer('Which company is most popular?', sample()), /Sample Studio leads with 142 recorded card opens/);
});
test('legal-page questions use session timing with suppression and reading caveats', () => {
  assert.match(dashboard.answer('How long do people spend on the privacy policy?', sample()), /38 sec mean active time per measured privacy-page session/);
  assert.match(dashboard.answer('What is the average time on terms?', sample()), /not proof that someone read the page/);
  const data = sample(); data.pageTiming = [];
  assert.match(dashboard.answer('How long did users stay on the privacy page?', data), /does not mean zero reading time/);
});
test('missing total and absent loaded data have explicit responses', () => {
  const data=sample(); data.totals.signups=null;
  assert.match(dashboard.answer('How many signups?',data), /N\/A is not zero/);
  assert.match(dashboard.answer('How many visits?',null), /Load an authorized/);
});
test('static dashboard contains no analytics tracker, third-party question endpoint or default sample flag', () => {
  const root=path.resolve(__dirname,'../..');
  const html=fs.readFileSync(path.join(root,'analytics.html'),'utf8');
  const js=fs.readFileSync(path.join(root,'js/analytics-dashboard.js'),'utf8');
  assert.doesNotMatch(html, /src=["'][^"']*(?:gtag|analytics\.js|googletagmanager)/);
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.match(html, /id="dashboard-data" hidden/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
  assert.match(js,/cache: 'no-store'/);
  assert.match(js,/su:auth-changed/);
  assert.match(js,/serial !== request/);
  assert.match(html,/Sample data\. These are invented numbers\./);
});

test('response event labels preserve counts without adding absent responses or changing raw keys',()=>{
 const data=sample();data.events=[{label:'preference_save',count:3},{label:'preference_clear',count:0},{label:'preference_skip',count:2},{label:'feedback_not_fit',count:4},{label:'application_reported',count:5}];
 const normalized=dashboard.normalize(data),before=JSON.stringify(normalized.events);
 assert.deepEqual(dashboard.eventRows(normalized.events),[
  {label:'application_reported',count:5},{label:'Not a fit responses',count:4},{label:'Preference save actions',count:3},{label:'Preference skip actions',count:2},{label:'Preference clear actions',count:0}
 ]);
 assert.equal(JSON.stringify(normalized.events),before);
 assert.deepEqual(dashboard.eventRows([]),[]);
 assert.deepEqual(dashboard.eventRows([{label:'__proto__',count:null}]),[{label:'__proto__',count:null}]);
 const html=fs.readFileSync(path.resolve(__dirname,'../../analytics.html'),'utf8');
 assert.match(html,/Recorded action counts, not unique people/);
 assert.match(html,/Preference saves can include blank optional answers/);
 assert.match(html,/contain no typed answers or per-job not-fit details/);
});

test('UX labels distinguish clicks, shown notes and recoveries from unobserved outcomes',()=>{
 const raw=[{label:'preferred_source_click',count:2},{label:'feedback_open',count:9},{label:'sync_error',count:3},{label:'sync_recovered',count:1},{label:'signin_cancel',count:0}];
 const before=JSON.stringify(raw);
 assert.deepEqual(dashboard.eventRows(raw),[
  {label:'Google source selector link clicks',count:2},{label:'Feedback notes shown',count:9},{label:'Sync failures',count:3},{label:'Sync recoveries',count:1},{label:'Sign-in cancellations',count:0}
 ]);
 assert.equal(JSON.stringify(raw),before);
 assert.doesNotMatch(JSON.stringify(dashboard.eventRows(raw)),/source added|successful preference|confirmed application|employer return/i);
});

test('Internships timing is retained while unknown page labels and absent timing remain unavailable',()=>{
 const raw=sample();raw.pageTiming=[{label:'internships',count:8,meanActiveSeconds:42},{label:'private-route',count:9,meanActiveSeconds:50}];
 assert.deepEqual(dashboard.normalize(raw).pageTiming,[{label:'internships',count:8,meanActiveSeconds:42}]);
 delete raw.pageTiming;assert.deepEqual(dashboard.normalize(raw).pageTiming,[]);
});

test('vote breakdowns preserve missing versus suppressed, public labels, and action-count meaning',()=>{
 const data=sample();
 assert.match(dashboard.answer('Which theme has the most likes?',data),/Casino leads with 36 recorded like votes/);
 assert.match(dashboard.answer('Which theme has the most dislikes?',data),/Casino leads with 9 recorded dislike votes/);
 assert.match(dashboard.answer('Favorite theme?',data),/vote events, not unique voters/);
 assert.match(dashboard.answer('Which theme is most popular?',data),/Original leads with 320 recorded theme selections/);
 delete data.themeVotes;let cleaned=dashboard.normalize(data);assert.equal(cleaned.themeVotes,null);
 assert.match(dashboard.answer('Which theme has the most likes?',cleaned),/unavailable.*Missing votes are not zero/);
 data.themeVotes={up:[],down:[]};cleaned=dashboard.normalize(data);
 assert.match(dashboard.answer('Which theme has the most dislikes?',cleaned),/below the privacy threshold/);
 data.themeVotes={up:[{label:'noir',count:5},{label:'poker',count:5}],down:[]};cleaned=dashboard.normalize(data);
 assert.match(dashboard.answer('Which theme has the most likes?',cleaned),/Black Cat, Casino tie at 5/);
});
