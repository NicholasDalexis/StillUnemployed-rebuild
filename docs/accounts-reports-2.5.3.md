# Accounts, measurement and reports: 2.5.3 readiness

Prepared September 13, 2026 by Codex. This is an implementation and evidence receipt, not a production activation receipt.

## Confirmed causes and provider gates

- Production 2.5.2 had an explicit early return in `js/auth.js` for stillunemployed.com and www.stillunemployed.com. Preview and production could therefore display the same version while exposing different account features.
- Firebase project `stillunemployed-17de9` (project number 43122740614) publicly reported authorized domains localhost, its firebaseapp.com/web.app hosts, and preview--stillunemployed.netlify.app. The production apex and www were absent at the September 13 readback.
- Both live and preview `/__/auth/handler` returned 200. Netlify already transparently proxies the Firebase auth helper. HTTP success alone does not prove Google login works.
- Both analytics-admin endpoints returned 503, “Analytics is not configured”. Connected Netlify environment-variable readback returned an empty list. This patch does not backfill uncollected visits, infer completed applications, or certify crash-free operation.
- Root DNS readback found healthy apex/www resolution through Porkbun and HTTPS delivery. The active apex TXT lookup was empty while the historical Google ownership TXT existed in the dormant Netlify zone. Google brand/domain verification needs a separate console/DNS check. This is distinct from the proven client gate and missing Firebase domains.

Before production auth activation: preserve existing Firebase authorized domains and add stillunemployed.com plus www.stillunemployed.com; verify the Google OAuth web client's authorized redirect URI for each served auth domain (`https://stillunemployed.com/__/auth/handler`, and www if used rather than redirected). Preserve preview redirects. Inspect deployed Firestore rules and confirm authenticated UID isolation. Perform explicit signed-out and signed-in browser checks on approved preview and live hostnames, including mobile redirect fallback. Do not infer this from a 200 handler, a visible Google button or an app version string.

September 13 provider follow-up, reported by the frontend253 agent after native saved-and-reopened readback: Firebase now includes the production apex and www while preserving its existing authorized domains. The Google OAuth web client now includes apex/www JavaScript origins and `/__/auth/handler` callbacks, with Firebase/preview entries preserved. Google indicates configuration propagation can take minutes to hours. Live Firestore rules permit reads/writes only at the authenticated user's own `users/{uid}` document and deny other paths. These are provider configuration checks; actual mobile/desktop sign-in remains a separate integration proof. Nic's exact verified UID for the analytics owner allowlist is `huqVBMpt2LgBG8NOxvINIwk9Slw2`. No real user data was deleted or altered by this audit.

Production measurement requires these server values, entered through approved provider configuration without copying secrets into notes: `SU_ANALYTICS_ENABLED=true`, a restricted `SU_FIREBASE_SERVICE_ACCOUNT` for this project, a strong random `SU_ANALYTICS_SECRET`, `SU_ALLOWED_ORIGINS` with exact approved origins, and `SU_ANALYTICS_ADMIN_UIDS` containing the verified owner UID. Preview client and ingestion requests are excluded from production measurement by this patch. Prove a consented synthetic event, readback, reset and 90-day retention behavior before calling analytics operational. Current counters are consented recorded activity, not all humans; `apply_click` is an outbound click and `application_reported` is self-reported, neither proves an employer received an application. Existing structured recovery counts are not comprehensive crash monitoring.

## Stored data and deletion

| Storage | Contents | Removal / isolation |
|---|---|---|
| Firebase Authentication | Google identity, verified email, display name/photo and UID | Existing verified-email account deletion request. Deleting an Auth identity alone does not delete Firestore or report queues. |
| Firestore `users/{uid}` | Saved public job snapshots, Tracker company/role/link/date/status/notes/source, requested major/location/interests, personal hides and confirmations; old paused visit records | Own UID only under deployed rules. Item removal synchronizes; a tombstone prevents stale-device resurrection. Full deletion needs the account record and historical data checked separately. |
| Browser account caches | Signed-out and signed-in saved/Tracker/profile cache, theme, reminder markers, board view | Origin-local and account-separated. Clearing browser data is not cloud deletion. Preview and production currently share Firebase project and UID document, so QA edits made while signed in can change the same cloud account. |
| Recently viewed | Up to 100 public job identities/labels, timestamp and explicit action per device account, up to 30 days | Clear control and successful Reset history clear the current account's device history. Session-only dismissal ordering is not eligibility or global hiding. |
| Optional analytics / recommendations | Pseudonymous browser/account keys and structured events or bounded interest scores, no free text | Off until chosen. Reset history removes matching records; expired activity is excluded after 90 days, with scheduled deletion separately verified. QA and preview collection excluded. |
| Private operational report queues | Verified reporter UID (or keyed daily guest identifier), public posting details, reason, server receipt time, retry receipt and moderation evidence | Not optional analytics. Owner-only review access, separate preview/production stores. No auth tokens, raw IPs, private Tracker notes, status or application dates. Operational history has no automatic 90-day expiry; archive/delete when no longer needed, without undoing active suppression. |

Keep the existing policy contact route for account data requests; no new account-deletion form was introduced. Verify request identity and enumerate Auth, `users/{uid}`, optional analytics actor keys, operational reports, historical providers and browser caches before marking a request complete. No real account was deleted during this work.

## Tracker report contract

`POST /api/tracker-reports` requires same-origin JSON and a current verified Google token. Body: `{requestId, job:{link,company,role,source}, reason}`. Link may be empty for a manual row; at least company or role is required. Sources: StillUnemployed.com, LinkedIn, Indeed, Company website, Referral, Other. Reasons: unavailable, suspicious, incorrect, other. Private notes/status/application dates are rejected as extra fields. No arbitrary URL fetch occurs.

202 receipt: `{schemaVersion:1,requestId,reportId,status:'pending_review',duplicate,scope}`. `reportId` is 64 lowercase hexadecimal characters. Duplicate UUID retries return the original report. Reusing a UUID for different content conflicts. A new equivalent report is deduplicated for that account. Reporting alone never removes a listing. Owner-only `GET /api/tracker-reports?limit=50&after=<reportId>` exposes a bounded review page.

## Availability reports and shared visibility

`POST /api/job-availability` accepts `{requestId,link}`. Exact same-origin required. Bearer is optional, but a supplied invalid token is rejected rather than downgraded to a guest. URLs must resolve to one canonical role in the fresh authoritative catalog. Signed-out reports queue a check without global suppression; verified-account reports quarantine the canonical role. Queue result is receipt status, not verified closure.

202 receipt: `{schemaVersion:1,requestId,reportId,status,duplicate,scope,globallyHidden}`. Statuses: queued_check, quarantined, restored, retired, human_review. Owner-only `/api/job-availability/admin` exposes report status, per-record revision and evidence history. `/api/job-availability/review` accepts same-origin owner POST `{requestId,link,expectedRevision,result,evidence:{url,type,checkedAt,excerpt}}`. Results are open, closed or unknown. Fresh exact-posting evidence is required; HTTP failure or CAPTCHA cannot certify closure. Workday `postingAvailable: false`, explicit unavailable posting text or exact Job not found are closure evidence categories. UNKNOWN remains for human review. A second independent verified reporter after restoration escalates to human review. A repeat from the same original reporter requests another check without independently re-quarantining the restored role.

The existing `/api/job-moderation` and `moderationIndex` now combine owner suppression with availability quarantine. Public data contains only canonical keys, slugs and job links. Composite revision is owner revision + availability revision. Admin owner restoration translates a checked composite revision to the guarded owner revision. Server-side shared cards and the internship catalog inherit the same combined suppression index. Browser validation capacity must allow up to 3,000 combined suppression records.

Private state is updated with strong reads, conditional ETag writes, bounded retries and readback before success. Member/guest limits: five new requests per hour and twenty per day; network limits thirty per hour and one hundred per day when the platform supplies an IP. Retries of the same UUID do not consume another receipt. Queues fail closed at 2,000 records, 10,000 receipt entries or 8 MiB. They need operational archival before those caps, not silent truncation. Owner review actions are exempt from submission rate limits. No source Google Sheet is edited by these endpoints.

At this receipt stage the queue and manual owner-review state machine are implemented. A scheduled verification worker, successful hosted run, durable alert outbox delivery and operator acknowledgment are separate requirements. Do not label automatic checking or email alerting operational until those proofs exist.

September 13 implementation follow-up: the deterministic worker, durable outbox and separate signed, fixed-recipient Apps Script receiver are now prepared with offline tests. Exact authoritative open evidence restores; exact closure evidence retires; ambiguous or unsupported responses become UNKNOWN and create a private alert. Current-cycle hold authorization is separate from historical reporter IDs and is cleared by open restoration, so an anonymous re-report cannot create a new global hold from an old signed-in report. Per-record revision checks prevent an obsolete source observation from overriding a newer owner decision. The owner moderation wrapper now replays an identical restore receipt before checking the old composite revision, while changed payloads and later reversals still conflict. Hosted invocation, receiver deployment, secret configuration, actual inbox delivery and the first automatic published schedule are not established by this local code. See `ops/availability-alerts/README.md` for the concrete activation and receipt sequence.

## References

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/web/manage-users
- https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
- https://support.google.com/cloud/answer/13804266?hl=en
