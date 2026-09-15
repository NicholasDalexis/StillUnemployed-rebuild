# Availability checks and operational alerts

Prepared locally September 13, 2026 by Codex for 2.5.3. The code and tests are not evidence of a deployed sender, a scheduled run or delivered mail. This adapter is separate from the existing Monday ecosystem reporter. Do not change that reporter to install this one.

## Components

- `job-availability-check` checks one pending canonical posting per run. The source is the accepted catalog identity, never a URL invented by the reporter. Fixed public ATS APIs are supported for Greenhouse, Lever, Ashby, SmartRecruiters and Workday. Unsupported, blocked, incomplete or contradictory evidence becomes UNKNOWN and requires review. An ordinary 404 never retires a role.
- Both scheduled functions declare every-five-minute UTC schedules. Netlify runs schedules automatically only on the published deployment, with a 30-second limit. Branch/preview schedules require an explicit manual invocation for QA. A preview deployment does not activate the production schedule.
- `job-availability-alerts` claims one durable private alert and sends it to the receiver below. It never sends reporter identifiers, private Tracker notes, application status or account credentials. The shared HMAC secret authenticates the operational request. The same alert ID is retained across retries.
- `Code.gs` is a new, fixed-recipient Apps Script receiver. It stores a reservation before attempting `MailApp.sendEmail`. A repeated alert ID cannot send again. An ambiguous mail attempt returns `uncertain` and remains held for manual reconciliation. `accepted_by_sender` means MailApp returned normally, not that the message reached an inbox.

## Configuration to perform through the authorized provider session

1. Create a separate private Apps Script project with `Code.gs` and `appsscript.json`. Preserve the fixed recipient and the minimal `script.send_mail` scope. Do not grant access to Gmail contents or unrelated spreadsheets.
2. Generate a cryptographically random secret, at least 32 characters. Store it only as script property `SU_AVAILABILITY_ALERT_SECRET` and the corresponding Netlify Functions secret. Never place it in source, a Sheet, build output or a handoff note.
3. Deploy the receiver as a web app executing as its authorized owner. Its HTTPS endpoint must accept the server's unauthenticated HTTP transport; the application validates every body with HMAC. The endpoint URL is not itself a credential. Use the deployed `/exec` URL, not an editor or `/dev` URL. No user message is sent by deployment alone.
4. Set Functions-scoped values separately for the intended deployment context: `SU_AVAILABILITY_CHECKS_ENABLED=true`, `SU_AVAILABILITY_ALERTS_ENABLED=true`, `SU_AVAILABILITY_ALERT_URL=https://script.google.com/macros/s/<deployment>/exec` and `SU_AVAILABILITY_ALERT_SECRET`. The checks and sender are disabled until explicitly enabled. Do not expose these through browser configuration.
5. Rebuild the authorized preview and inspect its deployed function inventory. Verify the receiver signature with an explicitly authorized QA alert whose scope is `preview`, a stable alert ID and a clearly identified test job. Confirm one message in the recipient inbox. Replay the identical alert ID and confirm the receiver returns the original receipt with no second message. Preserve the native readback without recording the secret.
6. Test a signed-in preview availability report against a controlled fixture or explicitly approved role. Read the private record, run `job-availability-check` manually, and read the evidence, status and `last-check-run`. Prove exact-open restoration and UNKNOWN escalation. Use offline fixtures for definitive closure; do not retire a real open role as a test.
7. Run `job-availability-alerts` manually, then read the private outbox, `last-alert-run`, receiver reservation and actual inbox result. Label queue acceptance, verifier completion, sender acceptance and inbox delivery separately.
8. Production activation is a separate release operation. Preserve preview/production store separation, verify the first automatic scheduled run after publication, and inspect subsequent failures. Do not call schedules operational based on a successful manual invocation alone.

## Review and failure handling

Private Netlify Blobs stores are `su-job-availability-v1-preview` and `su-job-availability-v1-production`. The `state` record holds reports, evidence, outbox entries and idempotency receipts. `last-check-run` and `last-alert-run` hold bounded operational summaries. Public moderation indexes expose posting keys/links only.

UNKNOWN signed-in reports remain quarantined; UNKNOWN signed-out reports remain visible to everyone else. A new independent signed-in reporter after an open restoration escalates directly to human review. Human-review records are not automatically restored by this worker. Owner actions use `/api/job-availability/review` with fresh evidence and the current record revision. Closed means a local board retirement; source Sheets are not rewritten by this worker.

The sender retries network failures with the same alert ID, then holds the alert as `uncertain` after five consecutive ambiguous failures. An authenticated `retry` receipt proves the receiver did not dispatch, so quota/lock failures remain pending with exponential backoff from five minutes to six hours. They do not become permanently uncertain just because a mail quota takes time to recover. A stale sending lease can be claimed again, while the receiver's stable reservation prevents a second send. If the receiver reserved before an ambiguous MailApp result, inspect the inbox and delivery context manually. Never clear a reservation or give the same event a new ID just to force a retry.

If the sender is disabled or not configured, alerts remain pending. Failed scheduled checks return an error and keep the report unresolved. A successful source check does not establish that the separate email channel works. Provider logs and run records still require an operator or separately configured alert monitor; this patch does not silently create another monitoring service.

The receiver stops admitting new IDs at 900 stored receipts, before the Script Properties quota. The main queues also fail closed at their documented record/byte/receipt caps. Archive with retained deduplication and active-suppression continuity before reaching capacity. Do not delete receipts while a corresponding pending/sending alert could be replayed.

## Evidence sources

- [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Netlify function environment variables](https://docs.netlify.com/build/functions/environment-variables/)
- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [Apps Script MailApp](https://developers.google.com/apps-script/reference/mail/mail-app)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby public posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [SmartRecruiters Posting API](https://developers.smartrecruiters.com/docs/posting-api)
