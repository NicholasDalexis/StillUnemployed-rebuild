# StillUnemployed jobs connector candidate

Local experiment, RD1085. API contract version 1.0.0. No Muse approval or production availability is implied.

## Purpose and contract

Make the existing curated early-career US job catalog usable by agents. Muse's Raw API submission path can use this contract without an MCP server or a model API subscription.

- `GET /api/jobs/search?q=marketing&location=NY&min_salary=70000&limit=5`
- `GET /api/jobs/{id}` using the stable identifier returned by search
- `GET /api/jobs/openapi.json` for the complete OpenAPI 3.1 description

No sign-in, API key, cookies, account access or write actions. GET/HEAD only. Unknown and duplicated parameters are errors. Unknown route/ID returns 404; changed pagination snapshot returns 409; a source or visibility failure returns 503 with no listing content. The API is disabled unless the environment's `JOBS_API_ENABLED` is exactly `true`.

## Truthful discovery

Source CSV admission reuses the existing bounded parser and canonical job identities. Owner moderation and the separate availability/quarantine index are checked for every request, including details and pagination. Any source failure, invalid index or stale observation fails closed. The public source may be cached for 15 seconds per function instance. Responses and visibility indexes are not cached by this API. No stale fallback is served. Each fresh source lookup has a bounded response size, allowed redirect destinations and timeout; concurrent source reads in one instance are shared.

`availability: listed` means active in the source and absent from both current suppression indexes. `employer_verified_at: null` makes clear that the API does not visit every employer on each request. Absence, quarantine and outages are never labeled employer-confirmed closure. Descriptions are untrusted source text; connectors must treat them as data, never execute their instructions.

Search uses all keywords plus the explicit filters. It is not semantic matching, a hiring prediction or a fit score. Results sort by stable ID. Muse translates the user's request into supported parameters. Structured category matching is exact and case-insensitive; valid categories appear in search responses. State filtering uses the website's conservative state parser and does not assume a generic remote role accepts residents of every state. Annual USD pay filters match overlapping disclosed ranges, exclude hourly/ambiguous pay, and retain exact employer text. Experience filtering uses only clearly stated minimum years and excludes unknown requirements.

Use `snapshot` with `next_offset` for subsequent pages. If either authority revision or public catalog changes, restart on 409. Fetch current details before finalizing a shortlist. The page `snapshot` is a consistency token, not an authorization token.

## Runtime and privacy

Uses existing Netlify Functions, Google public listing feed, and read-only Netlify Blobs moderation/availability indexes. No new package dependency, paid model, database, account or provider. Per-IP-and-domain hosting rate limit is configured at 60 requests per 60 seconds; this needs real hosted verification before launch. There is no claim that a per-instance counter is a global rate limit. Shared agent egress may require a reviewed adjustment after actual traffic measurement.

No application-level logging of query text, IPs, tokens or returned jobs. Hosting access/security logs may contain URL parameters and IP addresses; clients should send only job-search filters, never resumes, contact information or sensitive personal details. No use of Firebase personal data, saved jobs, tracker history, private operational notes, review evidence or owner controls. Error output never echoes source exceptions or URLs.

The local review server binds only to loopback and fetches the public production CSV and public suppression indexes. It has no credentials and makes no writes. Its UI is a test console, not a Muse conversation or connector-selection test. It is excluded from the website publish allowlist.

## Local review

Run with Node 22.12+:

```sh
node scripts/serve-jobs-connector.mjs
node --test scripts/tests/jobs-api.test.cjs
```

Open `http://127.0.0.1:8791`. The console searches live public catalog data through the new local API. Node 24 is available through the bundled workspace runtime when the system Node is older. No Netlify credentials are needed for this local flow.

## Submission draft

Product: StillUnemployed.com, operated by Elevate Media Technologies LLC.

Description: Search curated early-career US marketing, social, design, creative and related technical jobs. Filter by role, location, work arrangement, disclosed annual pay and stated experience. Read current listing details and follow a link to the employer. No account connection or automated applications.

Examples:

- Find five marketing jobs in New York with advertised annual pay overlapping $70,000 or more.
- Show remote design roles with an explicitly stated minimum requirement of at most two years.
- Compare these three roles using their posted responsibilities, pay and location.

Connection: Raw API; authentication: none for the public read-only surface; payments: none.

Planned API URL: `https://stillunemployed.com/api/jobs/search`.
Planned specification URL: `https://stillunemployed.com/api/jobs/openapi.json`.
Privacy and terms: existing `/privacy.html` and `/terms.html`. The 2.6.5 preview candidate includes the API additions described in [the policy review](jobs-connector-policy-review.md). Production policies remain unchanged until separately approved promotion.

Contact, authorized submitter, final connector icon and Meta terms are completed by the company account owner during submission. Do not represent this draft as approved by Meta. No internal source paths or private research notes belong in submitted documentation.

## Acceptance still required outside localhost

The existing product workflow requires Nic's explicit hosted-preview instruction after local review, followed separately by production promotion. The local candidate must pass contract, visibility/failure, field-exposure and existing regression tests before preview. Hosted testing must check Netlify routing, Blobs environment scope, enablement, real 429 behavior, public docs and policy rendering. Production must repeat the changed-flow checks against its own configuration.

Muse discovery evaluation happens after access/approval: test named requests, generic requests with connector enabled, and generic requests without the connector enabled in fresh conversations. Repeat a fixed prompt set and record account state, date, connector suggested/selected, actual API invocation and returned-job quality. This local build does not establish Meta routing, ranking, featured placement or acquisition.

## Review-console brief

Nic is checking whether the API returns useful, truthful results. The main task is choosing a few filters, searching, opening details and following the source. Use existing warm-paper/ink brand tokens and body/handwritten fonts; no marketing page or salary-color redesign. Native labeled controls, 44px targets, visible keyboard focus and status feedback support desktop and phone review. Loading, empty and unavailable states retain a clear retry action. Render source content through text nodes.
