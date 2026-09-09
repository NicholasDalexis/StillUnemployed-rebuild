# Internship presentation

September 6, 2026. Local implementation after 2.2.3; publication is separate.

Students should be able to compare what they will earn, what they will do,
whether they qualify, and when applications open. Preserve the board's warm
notebook style, shared theme paper/ink, readable Archivo facts, handwritten
headings/actions and 44px targets. Review at 320px, 390px and desktop widths.

Cards display exact employer compensation, location/work arrangement and
application phase. Different pay periods are never converted or compared as
annual salaries; internship cards use neutral theme paper. A source-confirmed
future start does not mean an application is closed. Source-announced upcoming
programs require private major-brand admission and retain their own count and
View program action. Passing a stated opening date requires source rechecking,
never an automatic change to Apply Now.

Details show up to three supplied duty bullets, source-precision dates, all
eligibility restrictions, supported credit and benefits. Missing values remain
unknown. No inferred duty, credit benefit, unrestricted eligibility or pay basis.
Program visits never become application claims or trigger Welcome Back.

The offline projection adapter maps an operational readback to a public
snapshot. It requires explicit publication admission and source verification;
private golden decisions, rationale, brand evidence and file paths are excluded.
Legacy operational rows remain unpublished until reviewed. No job sourcing,
live data promotion, source fetch schedule or deployment is part of this patch.

## Operational publication, September 6, 2026

The above paragraph describes 2.2.4. The next implementation uses one existing
workbook with separate main Jobs and Internships tabs. Golden Set decisions are
fit examples; they are never substitutes for a fresh employer check.

`scripts/publish-internships.mjs` accepts a complete private operational export
and explicit row admissions. Validate with `--check`, then publish using the same
absolute `--input` path. No arbitrary output path, network write or deployment
is allowed. The publisher requires fresh receipts, rejects duplicate identities
and older conflicting exports, and atomically replaces the public snapshot.
Unknown, closed, inactive and removed rows are excluded. An intentionally empty
replacement requires explicit `publication.allowEmpty: true`.

On localhost, the board loads that reviewed snapshot directly. Hosted pages use
`/.netlify/functions/internships-catalog`, which can only suppress already
approved entries against the current Sheet's Link, Active/Dead and Application
Status columns. It cannot add a new role or promote Upcoming to Open. A missing
or conflicting source returns an unavailable state rather than stale listings.

To remove an internship, mark its operational row Dead instead of deleting the
record. Once this endpoint is deployed, the next hosted page load excludes it.
Local previews and the static snapshot require a fresh reviewed export. Pages
already open are not live subscriptions. Publication and deployment receipts
are recorded separately from this implementation contract.

The endpoint does not collect account data, preferences or analytics. It fetches
only three public employer-listing fields using a fixed server-side URL. Private
Golden notes, admission rationale and source artifacts never enter the feed.
