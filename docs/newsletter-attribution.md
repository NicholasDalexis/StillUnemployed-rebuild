# Newsletter attribution, 2.6.3 local candidate

Author: Codex. September 20, 2026. Source: Nic approved connecting StillUnemployed signups to their originating invitation/job. Status: implemented and tested locally; no preview or production deployment, provider endpoint registration or environment mutation.

The existing Beehiiv iframe remains the only email entry. With analytics consent, a same-origin private function issues a random 256-bit receipt tied to a keyed visitor/account, session, approved CTA/revision, placement and server-resolved public job. The embed gets `utm_source=stillunemployed`, `utm_medium=website`, `utm_campaign=su_<opaque receipt>`. Emails, Google UIDs and job URLs do not enter these tags.

All four surfaces use this path: job TL;DR, advice popup, feed signup popup, homepage recipe popup. The feed popup is grouped as Feed signup card, not falsely split into unregistered copy experiments. Approved rotating N-series invitations are reported by their readable wording. A form at least half visible is one exposure; rerenders/retries keep its identity. Focus is only engagement. Reopening an existing homepage form retains the same exposure. Each TL;DR opening also has a separate opted-in count. It does not replace the existing distinct-job exploration metric or train recommendations twice.

Beehiiv notifications are accepted only with a valid Svix signature over the original payload, a five-minute signature timestamp tolerance, production deploy context and explicit activation. Listen for `subscription.created` and `subscription.confirmed`. Pending creation records a received subscription. Active creation or confirmation records a confirmed signup. Both types share one keyed subscriber deduplication identity. Existing subscribers created before the attribution receipt are not counted as new acquisitions. No webhook email or raw body is persisted or logged by these functions.

The private dashboard distinguishes board accounts from newsletter conversions. Matched exposure conversion = distinct exposures with a provider-confirmed signup / distinct measured exposures, both recorded in the selected report window. This is a bounded observational funnel, not randomized A/B proof. Confirmations without a measured exposure remain in the confirmed total but do not inflate that rate. Each CTA/placement/job breakdown requires five distinct opted-in visitors; conversion details require five converting visitors. Missing/disabled measurements are unavailable rather than fabricated zeros. Later unsubscribe does not erase a historical conversion.

Receipt expiry is 30 days, raw conversion/event expiry 90 days. All records use the existing private analytics collections and cleanup. Reset deletes linked receipts and conversions; revoked receipt tombstones prevent an in-flight issuance from reviving attribution. Browser withdrawal and account transitions revoke pending codes. Failed revocations remain as opaque tokens for retry on reconnect/reload; no new attribution while that queue is pending. Clearing site data before a retry can prevent it reaching the server; original expiry still applies. No retroactive attribution of older subscriptions is claimed.

If receipt issuance is unavailable, excluded, disabled or exceeds 1.2 seconds, the plain signup form still loads. It never waits for a tracking service to become healthy. No secret, new provider, paid service, subscriber-list export or email send was introduced.

## Activation after the approved release stages

1. Verify Beehiiv Settings > Webhooks is available on the existing plan for **The Job Hunt Recipe**, publication `pub_0c57d89b-ed55-4496-b29c-1a77e598b89d`. No plan upgrade is authorized.
2. Publish the reviewed candidate to preview only after Nic approves. Preview/local are deliberately excluded from production measurement; verify forms and fallback, not production counts.
3. After separate production approval, publish with attribution disabled. Register the exact production endpoint `https://stillunemployed.com/.netlify/functions/newsletter-webhook` for this publication only and the two event types above. Do not register the preview endpoint or use a generic all-workspace secret.
4. Put its signing secret in private production `SU_BEEHIIV_WEBHOOK_SECRET`, alongside existing private analytics credentials. Enable `SU_NEWSLETTER_ATTRIBUTION_ENABLED=true` only for production. Modern wrappers use Netlify's actual `context.deploy.context`, not a browser-supplied environment claim.
5. Verify the iframe's actual UTM is carried into Beehiiv, one controlled fresh subscription produces exactly one received and active record, replay does not increment counts, and owner-only dashboard readback matches. A queued email, iframe load, response 200 or MCP connection alone is not this proof. Keep tracking disabled if delivery cannot be verified.
6. Subscription success text currently says to confirm by email while the publication's double opt-in is off and the form inherits it. Do not turn double opt-in on as a tracking workaround; review that separate text mismatch with Nic.

No subscriber or Portfolio Graded membership suppression is implemented here. Google sign-in does not enroll anyone in the newsletter.

Official references: https://developers.beehiiv.com/webhooks ; https://developers.beehiiv.com/webhooks/subscription/confirmed ; https://docs.svix.com/receiving/verifying-payloads/how-manual ; https://www.beehiiv.com/support/article/12977090590487

-Codex
