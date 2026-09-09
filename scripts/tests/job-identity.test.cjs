const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const identity = require('../../js/job-identity.js');

const observed = [
  ['Glossier social 8054875', 'https://boards.greenhouse.io/glossier/jobs/8054875', 'https://boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8054875'],
  ['Reformation handbag 7917585', 'https://boards.greenhouse.io/reformation/jobs/7917585', 'https://job-boards.greenhouse.io/reformation/jobs/7917585'],
  ['Code and Theory 8558982002', 'https://www.codeandtheory.com/careers/8558982002', 'https://www.codeandtheory.com/careers/8558982002?gh_jid=8558982002'],
  ['CarGurus marketing 7972453', 'https://job-boards.greenhouse.io/cargurus/jobs/7972453', 'https://careers.cargurus.com/us/en/job/7972453?gh_jid=7972453'],
  ['Glossier influencer 8077849', 'https://job-boards.greenhouse.io/glossier/jobs/8077849', 'https://boards.greenhouse.io/glossier/jobs/8077849?gh_jid=8077849'],
];

for (const [label, a, b] of observed) test('observed duplicate: ' + label, () => {
  assert.equal(identity.equivalent(a, b), true);
  assert.equal(identity.equivalent(b, a), true);
  assert.equal(identity.keys(a)[0], identity.keys(b)[0]);
});

// Exact paths from the preserved September 5 board CSV. Each pair's only URL
// difference is /en-US; the distinct numeric requisitions must remain separate.
const numericWorkday = [
  ['125248', 'Associate-Designer---Madewell-Women-s-Knits_125248'],
  ['124054', 'Assistant-Designer---Washed-Product_124054'],
  ['121754', 'Assistant-Womens-Denim-Designer_121754'],
  ['125740', 'Men-s-Denim-Assistant-Designer_125740'],
].map(([id, slug]) => [id,
  'https://jcrew.wd1.myworkdayjobs.com/MadewellCareers/job/New-York-NY-USA-Headquarters/' + slug,
  'https://jcrew.wd1.myworkdayjobs.com/en-US/MadewellCareers/job/New-York-NY-USA-Headquarters/' + slug]);
for (const [id, a, b] of numericWorkday) test('observed numeric Workday locale duplicate: ' + id, () => {
  assert.equal(identity.equivalent(a, b), true);
  assert.equal(identity.equivalent(b, a), true);
  assert.equal(identity.keys(a)[0], 'ats:workday:jcrew.wd1.myworkdayjobs.com:MadewellCareers:' + id);
  assert.equal(identity.keys(a)[0], identity.keys(b)[0]);
});

const equal = [
  // Fresh unauthenticated HTTPS reads on September 5 followed both short URLs
  // to these exact employer-scoped paths (HTTP 200). No global shortcode rule.
  ['verified Magic Spoon Workable short alias', 'https://apply.workable.com/j/9E2D6ACC47', 'https://apply.workable.com/magicspoon/j/9E2D6ACC47/'],
  ['verified PetLab Workable short alias', 'https://apply.workable.com/j/A6CF4192C0', 'https://apply.workable.com/petlab-co/j/A6CF4192C0'],
  ['Workday locale', 'https://unilever.wd3.myworkdayjobs.com/TMICC/job/Englewood-Cliffs-NJ/NA-Marketing-Innovation_R-1182430', 'https://unilever.wd3.myworkdayjobs.com/en-US/TMICC/job/Englewood-Cliffs-NJ/NA-Marketing-Innovation_R-1182430'],
  ['Workday changed location and slug, same full requisition', 'https://umusic.wd5.myworkdayjobs.com/UMGUS/job/City/Old-Title_UMG-26451', 'https://umusic.wd5.myworkdayjobs.com/en-US/UMGUS/job/Other-City/New-Title_UMG-26451'],
  ['Greenhouse embedded job query', 'https://boards.greenhouse.io/embed/job_app?for=glossier&token=8054875', 'https://job-boards.greenhouse.io/glossier/jobs/8054875'],
  ['trusted Code and Theory query-only', 'https://codeandtheory.com/careers?gh_jid=8558982002', 'https://boards.greenhouse.io/codeandtheory/jobs/8558982002'],
  ['trusted Code and Theory www alias', 'https://codeandtheory.com/careers/8558982002', 'https://www.codeandtheory.com/careers/8558982002'],
  ['Lever apply page and provider tracking', 'https://jobs.lever.co/company/12345678-abcd-abcd-abcd-123456789012', 'https://jobs.lever.co/company/12345678-abcd-abcd-abcd-123456789012/apply?lever-source=test&lever-origin=applied'],
  ['Ashby UUID case', 'https://jobs.ashbyhq.com/company/12345678-abcd-abcd-abcd-123456789012', 'https://jobs.ashbyhq.com/company/12345678-ABCD-ABCD-ABCD-123456789012?utm_campaign=test'],
  ['SmartRecruiters changed slug', 'https://jobs.smartrecruiters.com/Equinox/744000138897639-old-title', 'https://jobs.smartrecruiters.com/Equinox/744000138897639-new-title'],
  ['Workable tenant path', 'https://apply.workable.com/employer/j/ABC123/', 'https://apply.workable.com/employer/j/ABC123?utm_source=test'],
  ['known global tracking only', 'https://example.com/jobs/one?job_id=1&utm_source=test&gclid=xyz', 'https://example.com/jobs/one?job_id=1'],
  ['safe host, default port and unreserved escape', 'HTTPS://EXAMPLE.COM:443/jobs/%7eone?job_id=%31', 'https://example.com/jobs/~one?job_id=1'],
  ['Greenhouse provider tracking', 'https://boards.greenhouse.io/glossier/jobs/8054875?gh_src=tracking', 'https://job-boards.greenhouse.io/glossier/jobs/8054875'],
];
for (const [label, a, b] of equal) test('equivalent: ' + label, () => assert.equal(identity.equivalent(a, b), true));

const different = [
  ['same title different IDs', 'https://boards.greenhouse.io/glossier/jobs/1', 'https://boards.greenhouse.io/glossier/jobs/2'],
  ['same numeric ID different employer', 'https://boards.greenhouse.io/glossier/jobs/123', 'https://boards.greenhouse.io/reformation/jobs/123'],
  ['same tenant and numeric ID different provider', 'https://boards.greenhouse.io/company/jobs/123', 'https://jobs.smartrecruiters.com/company/123-role'],
  ['Greenhouse region scope', 'https://boards.greenhouse.io/company/jobs/123', 'https://boards.eu.greenhouse.io/company/jobs/123'],
  ['Lever region scope', 'https://jobs.lever.co/company/12345678-abcd-abcd-abcd-123456789012', 'https://jobs.eu.lever.co/company/12345678-abcd-abcd-abcd-123456789012'],
  ['Lever employer scope', 'https://jobs.lever.co/one/12345678-abcd-abcd-abcd-123456789012', 'https://jobs.lever.co/two/12345678-abcd-abcd-abcd-123456789012'],
  ['Ashby employer scope', 'https://jobs.ashbyhq.com/one/12345678-abcd-abcd-abcd-123456789012', 'https://jobs.ashbyhq.com/two/12345678-abcd-abcd-abcd-123456789012'],
  ['Workable employer scope', 'https://apply.workable.com/one/j/ABC123/', 'https://apply.workable.com/two/j/ABC123/'],
  ['unknown Workable short alias does not infer employer', 'https://apply.workable.com/j/ABC123', 'https://apply.workable.com/employer/j/ABC123'],
  ['known Workable short alias does not match another employer', 'https://apply.workable.com/j/9E2D6ACC47', 'https://apply.workable.com/another-employer/j/9E2D6ACC47'],
  ['Workable verified employers stay separate even with identical ID', 'https://apply.workable.com/magicspoon/j/9E2D6ACC47', 'https://apply.workable.com/petlab-co/j/9E2D6ACC47'],
  ['Workable alias does not erase different requisition', 'https://apply.workable.com/j/9E2D6ACC47', 'https://apply.workable.com/magicspoon/j/9E2D6ACC48'],
  ['Workable alias does not discard meaningful query', 'https://apply.workable.com/j/9E2D6ACC47?job_id=another', 'https://apply.workable.com/magicspoon/j/9E2D6ACC47'],
  ['Workable alias does not discard hash route', 'https://apply.workable.com/j/A6CF4192C0#/jobs/another', 'https://apply.workable.com/petlab-co/j/A6CF4192C0'],
  ['Workday full suffix', 'https://example.wd5.myworkdayjobs.com/Careers/job/City/Title_R-12345-1', 'https://example.wd5.myworkdayjobs.com/Careers/job/City/Title_R-12345-2'],
  ['Workday different tenant', 'https://one.wd5.myworkdayjobs.com/Careers/job/City/Title_R-12345', 'https://two.wd5.myworkdayjobs.com/Careers/job/City/Title_R-12345'],
  ['Workday different job board', 'https://one.wd5.myworkdayjobs.com/External/job/City/Title_R-12345', 'https://one.wd5.myworkdayjobs.com/Internal/job/City/Title_R-12345'],
  ['Workday locale stripping does not erase requisition', 'https://one.wd5.myworkdayjobs.com/en-US/Careers/job/City/Title_R123', 'https://one.wd5.myworkdayjobs.com/Careers/job/City/Title_R124'],
  ['numeric Workday different tenant', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248', 'https://two.wd1.myworkdayjobs.com/en-US/Careers/job/City/Title_125248'],
  ['numeric Workday different job board', 'https://one.wd1.myworkdayjobs.com/External/job/City/Title_125248', 'https://one.wd1.myworkdayjobs.com/en-US/Internal/job/City/Title_125248'],
  ['numeric Workday different requisition', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248', 'https://one.wd1.myworkdayjobs.com/en-US/Careers/job/City/Title_124054'],
  ['numeric Workday complete suffix remains significant', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248-1', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248-2'],
  ['numeric Workday leading zero remains significant', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_0125248', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248'],
  ['numeric Workday meaningful query is not discarded', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248?job_id=one', 'https://one.wd1.myworkdayjobs.com/en-US/Careers/job/City/Title_125248?job_id=two'],
  ['numeric Workday hash route is not discarded', 'https://one.wd1.myworkdayjobs.com/Careers/job/City/Title_125248#/jobs/one', 'https://one.wd1.myworkdayjobs.com/en-US/Careers/job/City/Title_125248#/jobs/two'],
  ['arbitrary gh_jid cannot infer employer', 'https://untrusted.example/careers?gh_jid=8054875', 'https://boards.greenhouse.io/glossier/jobs/8054875'],
  ['arbitrary gh_jid across hosts', 'https://one.example/careers?gh_jid=123', 'https://two.example/careers?gh_jid=123'],
  ['untrusted custom path on trusted host', 'https://www.codeandtheory.com/blog?gh_jid=8558982002', 'https://boards.greenhouse.io/codeandtheory/jobs/8558982002'],
  ['lookalike provider hostname', 'https://boards.greenhouse.io.evil.example/glossier/jobs/8054875', 'https://boards.greenhouse.io/glossier/jobs/8054875'],
  ['unknown query changes identity', 'https://example.com/job?job_id=1', 'https://example.com/job?job_id=2'],
  ['unknown query preserved even with matching GH ID', 'https://boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8054875&job_id=one', 'https://boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8054875&job_id=two'],
  ['unknown source is not assumed tracking', 'https://example.com/job?source=one', 'https://example.com/job?source=two'],
  ['unknown gh_src is not assumed tracking', 'https://example.com/job?gh_src=one', 'https://example.com/job?gh_src=two'],
  ['blank query value preserved', 'https://example.com/job?job_id=', 'https://example.com/job'],
  ['bare versus blank query preserved', 'https://example.com/job?job_id', 'https://example.com/job?job_id='],
  ['query order preserved for unknown servers', 'https://example.com/job?a=1&b=2', 'https://example.com/job?b=2&a=1'],
  ['duplicate query order preserved', 'https://example.com/job?id=1&id=2', 'https://example.com/job?id=2&id=1'],
  ['hash routes preserved', 'https://example.com/#/jobs/1', 'https://example.com/#/jobs/2'],
  ['provider hash route suppresses inference', 'https://boards.greenhouse.io/glossier/jobs/1#/jobs/2', 'https://boards.greenhouse.io/glossier/jobs/1'],
  ['encoded slash preserved', 'https://example.com/jobs/a%2fb', 'https://example.com/jobs/a/b'],
  ['path case preserved', 'https://example.com/Jobs/One', 'https://example.com/jobs/one'],
  ['trailing slash preserved for unknown server', 'https://example.com/job/1', 'https://example.com/job/1/'],
  ['nonstandard provider port does not infer', 'https://boards.greenhouse.io:8443/glossier/jobs/1', 'https://boards.greenhouse.io/glossier/jobs/1'],
  ['HTTP and HTTPS remain separate for unknown server', 'http://example.com/job/1', 'https://example.com/job/1'],
];
for (const [label, a, b] of different) test('distinct: ' + label, () => assert.equal(identity.equivalent(a, b), false));

for (const value of [null, undefined, 7, {}, '', ' ', '/job/123', 'javascript:alert(1)', 'ftp://example.com/job', 'https://user:pass@example.com/job', 'https://example.com:99999/job', 'https://example..com/job', 'https://example.com/job%zz', 'https://example.com/job one', 'https://example.com\\@other.com/job']) {
  test('malformed or unsupported URL stays unmerged: ' + String(value), () => {
    assert.deepEqual(identity.keys(value), []);
    assert.equal(identity.inspect(value).valid, false);
    assert.equal(identity.equivalent(value, value), false);
  });
}

for (const value of [
  'https://boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8077849',
  'https://boards.greenhouse.io/glossier/jobs/8054875?gh_jid=8054875&gh_jid=8077849',
  'https://www.codeandtheory.com/careers/8558982002?gh_jid=8558982003',
  'https://careers.cargurus.com/us/en/job/7972453?gh_jid=999',
  'https://boards.greenhouse.io/embed/job_app?for=one&for=two&token=1',
]) test('contradictory trusted identity fails closed: ' + value, () => {
  assert.deepEqual(identity.keys(value), []);
  const description = identity.inspect(value);
  assert.equal(description.valid, true);
  assert.equal(description.ambiguous, true);
  assert.equal(identity.equivalent(value, value), false);
});

test('legitimate unknown URL remains valid with a canonical fallback', () => {
  const description = identity.inspect('https://unknown.example/careers?job_id=123');
  assert.equal(description.valid, true);
  assert.equal(description.ambiguous, false);
  assert.deepEqual(description.keys, ['url:https://unknown.example/careers?job_id=123']);
});

test('groupJobs preserves original objects and URLs and chooses first input', () => {
  const a = Object.freeze({ Link: observed[0][1], title: 'First', dateAdded: '2026-07-11' });
  const b = Object.freeze({ Link: observed[0][2], title: 'Second', dateAdded: '2026-08-31' });
  const c = Object.freeze({ Link: observed[1][1], title: 'Independent' });
  const input = Object.freeze([a, c, b]);
  const groups = identity.groupJobs(input);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].job, a);
  assert.equal(groups[1].job, c);
  assert.deepEqual(groups[0].members, [a, b]);
  assert.deepEqual(groups[0].aliases, [a.Link, b.Link]);
  assert.equal(groups[0].key, identity.keys(a.Link)[0]);
  assert.equal(a.Link, observed[0][1]);
  assert.equal(b.Link, observed[0][2]);
});

test('groupJobs collapses all five observed pairs without mixing employers', () => {
  const jobs = observed.flatMap(pair => [{ link: pair[1], title: 'Same fixture title' }, { link: pair[2], title: 'Same fixture title' }]);
  const groups = identity.groupJobs(jobs);
  assert.equal(groups.length, 5);
  assert.ok(groups.every(g => g.members.length === 2 && g.aliases.length === 2));
});

test('numeric Workday grouping preserves four separate jobs and all original URLs', () => {
  const jobs = numericWorkday.flatMap(([id, a, b]) => [Object.freeze({ Link: a, id }), Object.freeze({ Link: b, id })]);
  const groups = identity.groupJobs(Object.freeze(jobs));
  assert.equal(groups.length, 4);
  groups.forEach((group, i) => {
    assert.equal(group.job, jobs[i * 2]);
    assert.deepEqual(group.members, jobs.slice(i * 2, i * 2 + 2));
    assert.deepEqual(group.aliases, numericWorkday[i].slice(1));
  });
});

test('groupJobs supports caller URL selector and preserves stable membership order', () => {
  const jobs = [{ href: observed[0][1] }, { href: observed[0][2] }, { href: observed[0][1] }];
  const group = identity.groupJobs(jobs, { getUrl: job => job.href })[0];
  assert.equal(group.job, jobs[0]);
  assert.deepEqual(group.members, jobs);
  assert.deepEqual(group.aliases, [observed[0][1], observed[0][2]]);
});

test('malformed and missing URLs stay independent even with the same title', () => {
  const jobs = [{ url: 'bad', title: 'Identical' }, { url: 'bad', title: 'Identical' }, { title: 'Identical' }];
  const groups = identity.groupJobs(jobs);
  assert.equal(groups.length, 3);
  assert.ok(groups.every(g => g.key === null));
  assert.deepEqual(identity.groupJobs(null), []);
});

test('standalone browser and Apps Script execution needs no URL, require or module global', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../js/job-identity.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('typeof URL', context), 'undefined');
  assert.equal(vm.runInContext('typeof require', context), 'undefined');
  assert.equal(context.SUJobIdentity.equivalent(observed[3][1], observed[3][2]), true);
  assert.equal(context.SUJobIdentity.inspect('/relative').valid, false);
});
