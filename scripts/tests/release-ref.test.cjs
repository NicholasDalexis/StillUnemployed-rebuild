const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = import('../release-ref.mjs');
const REPO = 'NicholasDalexis/StillUnemployed-rebuild';
const BRANCH = 'internship-review-20261027-deadlines';
const MAIN = 'a'.repeat(40), NEXT = 'b'.repeat(40), OTHER = 'c'.repeat(40);
function failure(status, message, error_code) { return Object.assign(new Error(message), {status, error_code}); }
function ref(branch, sha) { return {ref:'refs/heads/' + branch, object:{type:'commit', sha}}; }
function fixture({tip = null, main = MAIN} = {}) {
  const state = {tip, main, calls:[], ancestry:true};
  const adapter = {
    async readRef(args) {
      state.calls.push(['readRef', args]);
      const sha = args.branch_name === 'main' ? state.main : state.tip;
      if (!sha) throw failure(404, 'Not Found');
      return ref(args.branch_name, sha);
    },
    async createBranch(args) { state.calls.push(['createBranch', args]);state.tip = args.sha;return {branch:args.branch_name}; },
    async isAncestor(args) { state.calls.push(['isAncestor', args]);return state.ancestry; },
    async updateRef(args) {
      state.calls.push(['updateRef', args]);
      if (args.expected_sha !== state.tip) throw failure(409, 'expected_sha mismatch');
      assert.equal(args.force, false);state.tip = args.sha;return {ok:true};
    }
  };
  const authority = {repository:REPO, branch:BRANCH, create:true, update:false};
  const input = {repository:REPO, branch:BRANCH, expectedMainSha:MAIN, authority, adapter};
  const writes = () => state.calls.filter(([name]) => /createBranch|updateRef/.test(name));
  return {state, adapter, authority, input, writes};
}

test('missing intended branch is created once from fresh main and GET verified', async () => {
  const f = fixture(), p = await (await api).prepareReleaseRef(f.input);
  assert.equal(p.created, true);assert.equal(p.branchSha, MAIN);
  assert.deepEqual(f.writes(), [['createBranch', {repository_full_name:REPO, branch_name:BRANCH, sha:MAIN}]]);
  assert.equal(f.state.calls.at(-1)[1].branch_name, 'main');
});

test('existing exact branch needs no creation grant or write', async () => {
  const f = fixture({tip:MAIN});f.authority.create = false;
  assert.equal((await (await api).prepareReleaseRef(f.input)).created, false);
  assert.deepEqual(f.writes(), []);
});

test('missing branch without creation grant and wrong scope stop before mutation', async () => {
  const f = fixture();f.authority.create = false;
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'CREATE_NOT_AUTHORIZED'});
  f.authority.branch = 'another-release';
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'SCOPE_NOT_AUTHORIZED'});
  assert.deepEqual(f.writes(), []);
});

test('fresh main advancement stops instead of recreating an older release base', async () => {
  const f = fixture({main:OTHER});
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'MAIN_CHANGED'});
  assert.deepEqual(f.writes(), []);
});

test('different existing ref is a conflict, never overwritten', async () => {
  const f = fixture({tip:OTHER});
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'REF_CONFLICT'});
  assert.deepEqual(f.writes(), []);
});

test('missing ref cannot recreate a historical non-main expected tip', async () => {
  const f = fixture();f.input.expectedBranchSha = OTHER;
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'REF_CONFLICT'});
  assert.deepEqual(f.writes(), []);
});

test('concurrent same-ref creation reconciles once; conflicting creation stops', async () => {
  for (const tip of [MAIN, OTHER]) {
    const f = fixture();
    f.adapter.createBranch = async args => {f.state.calls.push(['createBranch', args]);f.state.tip = tip;throw failure(422, 'Reference already exists');};
    if (tip === MAIN) assert.equal((await (await api).prepareReleaseRef(f.input)).concurrentCreation, true);
    else await assert.rejects((await api).prepareReleaseRef(f.input), {code:'REF_CONFLICT'});
    assert.equal(f.writes().length, 1);
  }
});

test('401,403 and automatic approval denials do not trigger creation fallback', async () => {
  for (const error of [failure(401, 'Bad credentials'), failure(403, 'Forbidden'), failure(422, 'Automatic approval review rejected action')]) {
    const f = fixture();
    const read = f.adapter.readRef;
    f.adapter.readRef = args => args.branch_name === 'main' ? read(args) : Promise.reject(error);
    await assert.rejects((await api).prepareReleaseRef(f.input), {code:error.status === 422 ? 'APPROVAL_DENIED' : 'AUTH_DENIED'});
    assert.deepEqual(f.writes(), []);
  }
});

test('resolved MCP permission rejection is a failure, not successful missing-ref recovery', async () => {
  const f = fixture();const read = f.adapter.readRef;
  f.adapter.readRef = args => args.branch_name === 'main' ? read(args) : Promise.resolve({isError:true,
    structuredContent:{error:'GitHub API error 403: denied', error_code:'PERMISSION_DENIED', error_data:{status:'403'}}});
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'AUTH_DENIED'});
  assert.deepEqual(f.writes(), []);
});

test('creation failure is never retried through another branch or transport', async () => {
  for (const error of [failure(403, 'Forbidden'), failure(500, 'Ambiguous server failure'), failure(429, 'Limit'), failure(422, 'Validation failed')]) {
    const f = fixture();
    f.adapter.createBranch = async args => {f.state.calls.push(['createBranch', args]);throw error;};
    await assert.rejects((await api).prepareReleaseRef(f.input));
    assert.equal(f.writes().length, 1);assert.equal(f.writes()[0][1].branch_name, BRANCH);
  }
});

test('create success cannot replace independent exact-ref readback', async () => {
  const f = fixture();
  f.adapter.createBranch = async args => {f.state.calls.push(['createBranch', args]);return {branch:BRANCH};};
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'MISSING_REF'});
  assert.equal(f.writes().length, 1);
});

test('main change after creation stops with the created ref preserved', async () => {
  const f = fixture(), create = f.adapter.createBranch;
  f.adapter.createBranch = async args => {const r = await create(args);f.state.main = OTHER;return r;};
  await assert.rejects((await api).prepareReleaseRef(f.input), {code:'MAIN_CHANGED'});
  assert.equal(f.state.tip, MAIN);assert.equal(f.writes().length, 1);
});

test('candidate update requires separate exact grant then non-force expected-sha update and readback', async () => {
  const f = fixture({tip:MAIN}), {prepareReleaseRef, advanceReleaseRef} = await api;
  const prepared = await prepareReleaseRef(f.input);
  await assert.rejects(advanceReleaseRef({prepared, candidateSha:NEXT, authority:f.authority, adapter:f.adapter}), {code:'UPDATE_NOT_AUTHORIZED'});
  assert.deepEqual(f.writes(), []);
  const authority = {...f.authority, update:true, candidateSha:NEXT};
  const result = await advanceReleaseRef({prepared, candidateSha:NEXT, authority, adapter:f.adapter});
  assert.equal(result.verified, true);
  assert.deepEqual(f.writes(), [['updateRef', {repository_full_name:REPO, branch_name:BRANCH, sha:NEXT, expected_sha:MAIN, force:false}]]);
});

test('ref moved after preparation stops before update', async () => {
  const f = fixture({tip:MAIN}), a = await api, prepared = await a.prepareReleaseRef(f.input);
  f.state.tip = OTHER;
  await assert.rejects(a.advanceReleaseRef({prepared, candidateSha:NEXT,
    authority:{...f.authority, update:true, candidateSha:NEXT}, adapter:f.adapter}), {code:'REF_CONFLICT'});
  assert.deepEqual(f.writes(), []);
});

test('server expected-sha lease rejects a concurrent writer without force or retry', async () => {
  const f = fixture({tip:MAIN}), a = await api, prepared = await a.prepareReleaseRef(f.input);
  const update = f.adapter.updateRef;
  f.adapter.updateRef = args => {f.state.tip = OTHER;return update(args);};
  await assert.rejects(a.advanceReleaseRef({prepared, candidateSha:NEXT,
    authority:{...f.authority, update:true, candidateSha:NEXT}, adapter:f.adapter}), {code:'REF_CONFLICT'});
  assert.equal(f.state.tip, OTHER);assert.equal(f.writes().length, 1);
});

test('stale candidate ancestry, update denial and missing-ref update never cause branch recreation', async () => {
  for (const condition of ['stale', 'denied', 'missing']) {
    const f = fixture({tip:MAIN}), a = await api, prepared = await a.prepareReleaseRef(f.input);
    if (condition === 'stale') f.state.ancestry = false;
    if (condition === 'denied') f.adapter.updateRef = async args => {f.state.calls.push(['updateRef', args]);throw failure(403, 'Forbidden');};
    if (condition === 'missing') f.state.tip = null;
    await assert.rejects(a.advanceReleaseRef({prepared, candidateSha:NEXT,
      authority:{...f.authority, update:true, candidateSha:NEXT}, adapter:f.adapter}),
    {code:condition === 'stale' ? 'CANDIDATE_CONFLICT' : condition === 'denied' ? 'AUTH_DENIED' : 'MISSING_REF'});
    assert.equal(f.writes().filter(([name]) => name === 'createBranch').length, 0);
    assert.equal(f.writes().length, condition === 'denied' ? 1 : 0);
  }
});

test('protected promotion refs and malformed branch names are refused before any read', async () => {
  for (const branch of ['main', 'preview', 'master', 'bad..name', 'a.lock', '/a', 'a//b', 'a@{b', '-a', 'a b', 'a?b']) {
    const f = fixture();f.input.branch = branch;f.authority.branch = branch;
    await assert.rejects((await api).prepareReleaseRef(f.input), {code:'INVALID_SCOPE'});
    assert.deepEqual(f.state.calls, []);
  }
});

test('ordinary update 422 is classified separately from permission and approval refusal', async () => {
  const {classifyGitHubFailure, unwrapGitHubResult} = await api;
  assert.equal(classifyGitHubFailure(failure(422, 'Reference does not exist'), 'updateRef'), 'VALIDATION_ERROR');
  assert.equal(classifyGitHubFailure(failure(404, 'Not Found'), 'readRef'), 'MISSING_REF');
  assert.equal(classifyGitHubFailure(failure(422, 'Automatic approval review rejected'), 'updateRef'), 'APPROVAL_DENIED');
  assert.deepEqual(unwrapGitHubResult({content:[{type:'text', text:JSON.stringify({content:JSON.stringify(ref(BRANCH, MAIN))})}]}), ref(BRANCH, MAIN));
});

test('resolved MCP missing-ref envelope is recovered only during granted preparation', async () => {
  const f = fixture(), read = f.adapter.readRef;
  f.adapter.readRef = args => !f.state.tip && args.branch_name === BRANCH ? Promise.resolve({isError:true,
    structuredContent:{error:'GitHub API error 404: Not Found', error_code:'NOT_FOUND', error_data:{status:'404'}}}) : read(args);
  assert.equal((await (await api).prepareReleaseRef(f.input)).created, true);
  assert.equal(f.writes().length, 1);
});

test('approval denial while checking candidate ancestry stops without update or alternate route', async () => {
  const f = fixture({tip:MAIN}), a = await api, prepared = await a.prepareReleaseRef(f.input);
  f.adapter.isAncestor = async () => ({isError:true, content:[{type:'text', text:'Automatic approval review rejected this action'}]});
  await assert.rejects(a.advanceReleaseRef({prepared, candidateSha:NEXT,
    authority:{...f.authority, update:true, candidateSha:NEXT}, adapter:f.adapter}), {code:'APPROVAL_DENIED'});
  assert.deepEqual(f.writes(), []);
});

test('ambiguous update completion preserves changed state and never auto-retries', async () => {
  const f = fixture({tip:MAIN}), a = await api, prepared = await a.prepareReleaseRef(f.input);
  const update = f.adapter.updateRef;
  f.adapter.updateRef = async args => {await update(args);throw failure(500, 'Response lost after write');};
  await assert.rejects(a.advanceReleaseRef({prepared, candidateSha:NEXT,
    authority:{...f.authority, update:true, candidateSha:NEXT}, adapter:f.adapter}), {code:'OPERATION_FAILED'});
  assert.equal(f.state.tip, NEXT);assert.equal(f.writes().length, 1);
});

test('a successful update response without matching remote tip is unverified', async () => {
  const f = fixture({tip:MAIN}), a = await api, prepared = await a.prepareReleaseRef(f.input);
  f.adapter.updateRef = async args => {f.state.calls.push(['updateRef', args]);return {ok:true};};
  await assert.rejects(a.advanceReleaseRef({prepared, candidateSha:NEXT,
    authority:{...f.authority, update:true, candidateSha:NEXT}, adapter:f.adapter}), {code:'INVALID_READBACK'});
  assert.equal(f.writes().length, 1);
});
