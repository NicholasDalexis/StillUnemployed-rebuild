# Jobs connector: Privacy and Terms review draft

Recorded 2026-09-21, America/New_York. Author: Codex. Source: RD1085 local implementation and the existing product policies. Status: initial local draft, not approved legal language or a compliance certification. Production policies and behavior remain unchanged.

Update 2026-09-21 22:40 America/New_York. Author: Codex. Source: Nic's explicit hosted-preview approval in task 01a0c1d1-a24f-7b33-84df-c0642b4dc2bf. Status: these disclosures are included in the 2.6.5 preview candidate; hosted rendering remains to be verified. Production promotion and Meta submission remain separate gates.
-Codex

## Changes requiring disclosure before public enablement

The new surface is a public, read-only jobs API. A third-party agent can transmit job-search filters to it and receive public listing content and employer links. This implementation has no application-level query logging, account data, personalized matching, resume handling, tracking cookies, applications or writes. Existing hosting access/security logs may still process network identifiers and requested URLs. Third-party agents have their own data practices.

## Proposed Privacy Policy addition: Agent and API searches

When you use a supported third-party agent or connector to search StillUnemployed, that service sends us the search filters needed for your request, such as role keywords, a city or state, work arrangement, disclosed-pay range or experience requirement. Our public jobs API returns listing information and links. It does not access your StillUnemployed account, saved jobs, application tracker or resume, and it cannot submit an application for you.

We do not add application-level logging of these API search queries. Our hosting provider may process IP addresses, requested URLs and related technical information for delivery, security and abuse prevention. API clients should send only job-search filters, not resumes, contact information or sensitive personal details. The agent service you choose separately handles your conversation and may retain or process information under its own privacy policy.

## Proposed Terms addition: Public API and third-party agents

Where available, our public jobs API provides read-only search and listing information. Access may be limited, interrupted or disabled, including for maintenance, source availability or abuse prevention. Clients must respect stated limits and must not attempt to access private data or circumvent access controls.

Listings reflect information available to StillUnemployed and our current visibility checks. Search results are not a guarantee that an employer is still accepting applications, that a salary will be offered or that you qualify for a role. Confirm requirements and availability with the employer. Sorting or filtering is not a hiring recommendation or employment prediction. A third-party agent may summarize our results; its output and data practices are governed separately by that service. This API does not submit applications or act on your account.

## Before hosted acceptance or submission

1. Product owner reviews this wording and checks the actual enabled environment and hosting log behavior. Resolve the provider's exact retention settings rather than inventing a retention period.
2. Apply the accepted additions to the existing public policy pages, with the appropriate effective-date and release records. Preserve existing account, analytics and provider disclosures.
3. Re-run the product's existing privacy-review and version-seal workflow against the final source. This candidate does not claim that its inherited 2.6.4 release receipt covers new code.
4. Verify policy rendering and links on hosted preview. Repeat the changed-flow check before production enablement and before giving public URLs to Meta.

-Codex
