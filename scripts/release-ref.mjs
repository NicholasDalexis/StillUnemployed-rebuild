// Operator-side GitHub release prerequisite. No credentials, network transport,
// default grants, CLI side effects, force updates, retries or deployment path.
const SHA = /^[a-f0-9]{40}$/i;

export class ReleaseRefError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? {cause} : undefined);
    this.name = 'ReleaseRefError';
    this.code = code;
  }
}

// Accept both normal REST failures and resolved MCP isError envelopes. A
// fulfilled promise is not necessarily a successful GitHub operation.
export function unwrapGitHubResult(result) {
  let value = result;
  for (let i = 0; i < 6; i++) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value);continue; } catch { break; }
    }
    if (value?.structuredContent) { value = value.structuredContent;continue; }
    if (typeof value?.content === 'string') { value = value.content;continue; }
    const text = Array.isArray(value?.content) && value.content.find(item => item.type === 'text')?.text;
    if (text) { value = text;continue; }
    break;
  }
  if (result?.isError || value?.error || value?.error_code) {
    const error = new Error(String(value?.error || value?.message || value || 'GitHub operation failed'));
    error.status = value?.status ?? value?.error_data?.status;
    error.error_code = value?.error_code;
    throw error;
  }
  return value;
}

export function classifyGitHubFailure(error, operation) {
  if (error instanceof ReleaseRefError) return error.code;
  const message = String(error?.message || error?.error || '');
  const code = String(error?.error_code || error?.code || '');
  const status = Number(error?.status ?? error?.statusCode ?? error?.error_data?.status ??
    message.match(/GitHub API error (\d{3})/)?.[1]);
  if (/approval|auto.?review|policy.*reject|review.*reject/i.test(message + ' ' + code)) return 'APPROVAL_DENIED';
  if ([401, 403].includes(status) || /PERMISSION_DENIED|USER_NOT_LOGGED_IN|UNAUTHENTICATED|FORBIDDEN/i.test(code)) return 'AUTH_DENIED';
  if (status === 429 || /RATE_LIMIT|QUOTA/i.test(code)) return 'RATE_LIMITED';
  if (operation === 'readRef' && status === 404) return 'MISSING_REF';
  if (operation === 'createBranch' && status === 422 && /reference already exists/i.test(message)) return 'REF_EXISTS';
  if (status === 409 || /lease|expected.sha|not a fast.forward/i.test(message)) return 'REF_CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  return 'OPERATION_FAILED';
}

async function invoke(adapter, operation, args) {
  if (typeof adapter?.[operation] !== 'function') throw new ReleaseRefError('INVALID_ADAPTER', 'Missing adapter operation: ' + operation);
  try { return unwrapGitHubResult(await adapter[operation](args)); }
  catch (error) {
    if (error instanceof ReleaseRefError) throw error;
    throw new ReleaseRefError(classifyGitHubFailure(error, operation), 'GitHub ' + operation + ' stopped; preserve its original error and reconcile before retry.', error);
  }
}

function scope(repository, branch, authority) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !branch || typeof branch !== 'string' ||
      /[\s\x00-\x1f\x7f~^:?*\[\\]/.test(branch) || branch.includes('..') || branch.includes('@{') ||
      branch.includes('//') || branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock')) ||
      branch.endsWith('.') || branch.startsWith('-') || ['main', 'master', 'preview', 'HEAD', '@'].includes(branch)) {
    throw new ReleaseRefError('INVALID_SCOPE', 'Use the exact reviewed release branch, never a production or preview ref.');
  }
  if (!authority || authority.repository !== repository || authority.branch !== branch) {
    throw new ReleaseRefError('SCOPE_NOT_AUTHORIZED', 'A matching current coordinator grant is required.');
  }
}

function requireSha(sha) {
  if (typeof sha !== 'string' || !SHA.test(sha)) throw new ReleaseRefError('INVALID_SHA', 'A complete immutable commit SHA is required.');
}

function refSha(value, branch) {
  if (value?.ref !== 'refs/heads/' + branch || value?.object?.type !== 'commit' || !SHA.test(value.object.sha || '')) {
    throw new ReleaseRefError('INVALID_READBACK', 'The exact requested branch commit was not returned.');
  }
  return value.object.sha;
}

async function mainUnchanged(adapter, repository, expected) {
  const sha = refSha(await invoke(adapter, 'readRef', {repository_full_name:repository, branch_name:'main'}), 'main');
  if (sha !== expected) throw new ReleaseRefError('MAIN_CHANGED', 'Main advanced; reconcile the candidate against fresh main before mutation.');
}

export async function prepareReleaseRef({repository, branch, expectedMainSha, expectedBranchSha = expectedMainSha, authority, adapter}) {
  scope(repository, branch, authority);requireSha(expectedMainSha);requireSha(expectedBranchSha);
  await mainUnchanged(adapter, repository, expectedMainSha);
  let observed, created = false, concurrentCreation = false;
  try { observed = await invoke(adapter, 'readRef', {repository_full_name:repository, branch_name:branch}); }
  catch (error) {
    if (error.code !== 'MISSING_REF') throw error;
    if (authority.create !== true) throw new ReleaseRefError('CREATE_NOT_AUTHORIZED', 'The exact branch is missing; obtain its creation grant before proceeding.');
    if (expectedBranchSha !== expectedMainSha) throw new ReleaseRefError('REF_CONFLICT', 'An absent branch cannot recreate an expected historical tip.');
    // Recheck main immediately before the one allowed create. Never create the
    // old candidate SHA or infer that an update denial authorizes creation.
    await mainUnchanged(adapter, repository, expectedMainSha);
    try {
      await invoke(adapter, 'createBranch', {repository_full_name:repository, branch_name:branch, sha:expectedMainSha});
      created = true;
    } catch (failure) {
      if (failure.code !== 'REF_EXISTS') throw failure;
      // A concurrent exact-ref creation is reconciled once by GET, not retried.
      concurrentCreation = true;
    }
    observed = await invoke(adapter, 'readRef', {repository_full_name:repository, branch_name:branch});
  }
  const sha = refSha(observed, branch);
  if (sha !== expectedBranchSha) throw new ReleaseRefError('REF_CONFLICT', 'The intended branch tip differs from the reviewed tip; do not overwrite it.');
  await mainUnchanged(adapter, repository, expectedMainSha);
  return {repository, branch, mainSha:expectedMainSha, branchSha:sha, created, concurrentCreation};
}

export async function advanceReleaseRef({prepared, candidateSha, authority, adapter}) {
  const {repository, branch, mainSha, branchSha} = prepared || {};
  scope(repository, branch, authority);[mainSha, branchSha, candidateSha].forEach(requireSha);
  if (authority.update !== true || authority.candidateSha !== candidateSha) {
    throw new ReleaseRefError('UPDATE_NOT_AUTHORIZED', 'The current grant must cover this exact candidate update.');
  }
  await mainUnchanged(adapter, repository, mainSha);
  const current = refSha(await invoke(adapter, 'readRef', {repository_full_name:repository, branch_name:branch}), branch);
  if (current !== branchSha) throw new ReleaseRefError('REF_CONFLICT', 'The prepared branch changed; preserve the other writer and reprepare.');
  // Both fresh-main ancestry and branch ancestry are required. A candidate
  // based on an older release cannot be promoted just because it exists.
  for (const ancestor of new Set([mainSha, branchSha])) {
    if (await invoke(adapter, 'isAncestor', {repository_full_name:repository, ancestor, descendant:candidateSha}) !== true) {
      throw new ReleaseRefError('CANDIDATE_CONFLICT', 'Candidate does not include the reviewed main and branch history.');
    }
  }
  await mainUnchanged(adapter, repository, mainSha);
  await invoke(adapter, 'updateRef', {repository_full_name:repository, branch_name:branch, sha:candidateSha,
    expected_sha:branchSha, force:false});
  const verified = refSha(await invoke(adapter, 'readRef', {repository_full_name:repository, branch_name:branch}), branch);
  if (verified !== candidateSha) throw new ReleaseRefError('INVALID_READBACK', 'Updated ref was not independently verified; reconcile without replay.');
  return {repository, branch, before:branchSha, after:verified, force:false, verified:true};
}
