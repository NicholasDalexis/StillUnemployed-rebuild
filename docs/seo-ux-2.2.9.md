# Discovery and resilient browsing

Design brief, September 6, 2026. For a student or early-career visitor comparing roles on desktop, keep the current paper board and one dominant action: inspect a role, then visit the employer. Maintain keyboard/touch access and narrow-screen reflow. Useful content and truthful availability take priority over promotions.

- Cold catalog loading uses three quiet paper placeholders after a short delay, never fabricated jobs. Fast loads do not flash a skeleton. Empty, failed and retry states remain distinct.
- Live catalog reads remain mandatory. No persistent catalog snapshot may reappear after a failed availability read. A future fast catalog cache requires an authoritative closure/quarantine check. Existing account caches remain scoped by owner and reconcile with the server.
- Remember only the tab's board filters and scroll position for 30 minutes, separately for Jobs and Internships. Clear on account change and never send search text or cached state to analytics. Explicit shared-job/filter URLs take precedence.
- Refresh/retry preserves filters, current scroll and unaffected navigation. Rendering or network failures offer a branded recovery path. Optional newsletter/signup failures must not remove the board.
- The Welcome Back prompt keeps its existing optional Google sign-in and clear close control. A small separate text link, "Prefer us on Google", opens Google's domain-targeted selector. It is available without board login. Opening the selector is the only observable action; selection/completion is never inferred.
- Supplemental help uses readable short text on hover/focus with Escape dismissal. Essential labels and tap-accessible screen explanations remain visible; the existing theme dialog remains the actual theme chooser.

Preview remains excluded from indexing. Public discovery implementation and exact verification are recorded with the finished release. This brief is not a production or cloud-account acceptance claim.
