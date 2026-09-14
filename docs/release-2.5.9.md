# Release 2.5.9

Local candidate for Nic's review. Preview and production promotion are separate.

Job details group the smaller Save, Share and Close icons at the upper right, with transparent backgrounds and 44 px tap targets. The Share hint stays handwritten. Long company names remain readable; the controls occupy their own row on narrow phones. All site-owned X controls share the same round-cap SVG geometry while retaining surface colors and action semantics.

No data, storage, analytics, authentication, consent, provider or subscription behavior changed. Personal save synchronization, Share, dismissal and Tracker removal confirmation retain their existing paths. Privacy and Terms were reviewed; no wording change is needed.

Validation: 905 automated tests passed under Node 22.23.2. Independent review passed 149 focused tests and 13 additional offline toolbar assertions; these overlap the full suite. Final rendered checks, version seal and exact source identity are recorded in the corresponding local QA receipt.

This patch does not resolve the separately tracked runtime activation or newsletter membership work. No hosted deployment is included.
