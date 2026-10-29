# Release branch lifecycle

Operator-side maintenance, October29,2026, Codex. This supplements the ordinary
GitHub branch/PR/Git-CD workflow. It neither grants release authority nor runs
from the website, Netlify build or a scheduled checker.

`scripts/release-ref.mjs` provides `prepareReleaseRef` and `advanceReleaseRef`.
Supply the existing authorized GitHub connector through four adapter functions:

- `readRef({repository_full_name,branch_name})`: GET the exact
  `/repos/{owner}/{repo}/git/ref/heads/{branch_name}` via `github_fetch`, returning
  its REST ref object. Preserve failures, including resolved MCP error envelopes.
- `createBranch(args)`: `github_create_branch(args)`. It creates only the exact
  reviewed branch from freshly revalidated main, with separate creation authority.
- `isAncestor({repository_full_name,ancestor,descendant})`: read GitHub compare
  for the two immutable SHAs. Return true only if the supplied ancestor is the
  comparison's merge base and the relation is ahead/identical. Preserve errors.
- `updateRef(args)`: `github_update_ref(args)`, preserving `expected_sha` and
  `force:false`. Do not replace the connector's lease check with an unguarded
  REST PATCH or a force update.

Before either function, re-read current project/coordinator grants, authenticated
identity, repository access and writer ownership. The authority object is an
operator scope assertion, not an authentication mechanism or persistent grant.
Set its exact `repository` and `branch`; default create/update authority is absent.

Call prepare with the reviewed full `expectedMainSha` and, for an existing branch,
its separately reviewed `expectedBranchSha`. A missing branch may be created only
with `authority.create === true`, at that current main. A different existing tip,
advanced main, malformed response or unknown failure stops for reconciliation.
An explicit creation-race “Reference already exists” permits one exact-ref GET;
it never permits a second create or overwriting another tip.

Only after a fresh candidate includes current main/branch history, tests pass and
the existing authority covers that exact update, call advance with
`authority.update === true` and matching `authority.candidateSha`. It rechecks
main/ref, verifies ancestry, performs one non-force expected-SHA update and reads
the exact ref back. Branch preparation alone cannot authorize this step.

One existing end-to-end maintenance grant may cover both creation and update.
Populate both flags from that grant when its source/review prerequisites pass;
these are machine scope/freshness checks, not requests for another human approval
at each API. Do not interrupt already-authorized routine releases unnecessarily.

The connector must genuinely enforce `expected_sha` for non-force updates. If that
contract is unavailable, do not substitute a weaker transport. Main and candidate
branch cannot be locked together by these calls; re-read current main and source
freeze again before later PR/merge/promotion. A concurrent change can require a
new candidate even after a successful branch update.

401/403, permission errors and approval-review denials stop immediately. A normal
422 validation error is not labeled as an approval denial, but also is not blindly
retried. Update-of-missing-ref does not invoke a fallback create. Preserve original
native errors and readbacks, inspect ambiguous writes before any later human or
coordinator-authorized retry, and never switch branch/tool/deploy to evade a control.

Keep operator receipts, grants and source exports private. The public build's
allowlist excludes `scripts` and `docs`; no credentials or new dependency are
required. This helper makes no commit, PR, merge, deploy, version or source-Sheet
change. Existing production readiness and native/public readback gates still apply.

Validation: `node --test scripts/tests/release-ref.test.cjs` uses fake adapters only.

-Codex
