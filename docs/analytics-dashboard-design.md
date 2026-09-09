# Board notebook design and verification

This is an owner utility for understanding recorded, consented job-board activity. Its primary tasks are comparing visits and job actions over a selected period, identifying popular career fields and role families, inspecting missing measurements, and asking bounded questions about the same aggregates. It works on desktop and phone. Success means a reviewer can distinguish a real count, a missing value, a privacy-suppressed dimension and synthetic sample data without guessing.

The visual system preserves the site's notebook identity: shared Archivo/Indie Flower typography, warm paper and yellow action notes, quiet borders and restrained tape. A utility heading replaces a marketing hero. Numeric measurements are aligned, tabular and typed; handwriting is limited to short headings/actions. Bars are paired with text values. Daily charts have an equivalent native data table. Colour is never the only data encoding.

Design reading for this implementation: the project's current style guide and UI/UX working standard; original Apple HIG Layout (grouping, visual hierarchy and adaptability) and Feedback; WCAG 2.2 original criteria 1.4.1, 1.4.10, 1.4.11, 1.4.12 and 2.4.7. These sources guide the implementation and do not certify usability or accessibility conformance.

## Data and access

The static page contains no private analytics. It requests the owner's aggregate API with a Firebase bearer token and `cache: no-store`. Server authorization is the security boundary. The client clears displayed aggregates on authentication change, page hide, failed refresh and changed date window, cancels old requests, and discards late responses. It does not write tokens, data or questions to storage. It does not load GA or a chart/AI service.

Default state is signed out or loading. Other states include authorization denial, service/invalid-response error, successful empty window, partial response, stale/unknown refresh time, and explicitly chosen synthetic preview. Sample data is only available after clicking Preview sample data, with a persistent invented-numbers banner and sample labels on answers. It is never a fallback for an API failure.

The question box performs deterministic intent matching on displayed aggregates. It supports total visits, visitors, job opens, saves, apply clicks, reported applications, sign-ups, sign-ins, tracker users, top field/role/job/company/theme, legal-page session timing and observed away-time average. Unsupported demographic, individual-level, comparative or causal questions receive a limitation, not a fabricated answer. Questions stay in browser memory.

The job journey is explicitly action counts, not a person-level conversion funnel. Distinct visitors are analytics visitors, not a complete count of people. Dimension groups below the backend privacy threshold are omitted. Empty dimensions can reflect suppression. Away time is an observation of this tab being hidden after Apply and returning, not employer-site application time. Fifteen minutes is an observation cap, not an assertion about typical application duration.

## Verification

Automated and rendered verification are recorded with the implementation handoff. Real owner authorization, production event delivery and representative human/physical-phone testing require separate deployment and user verification. Fixture browser checks do not establish production analytics collection.

Local checks on September 5, 2026: 12 unit tests and 31 fixture browser checks passed. Browser coverage includes 1440/1024/700/390/320 widths, 90-day chart reflow at 320px, enlarged text-spacing reflow, keyboard sample activation, supported and unsupported questions, daily-table equivalence, real zero versus missing values, empty/suppressed charts, stale data, 403/503 handling, response-window mismatch, sign-out DOM clearing and in-flight response cancellation. Desktop and phone screenshots were visually inspected. One enlarged-spacing date control overflow and a potential 90-day narrow-chart overflow were corrected. No runtime page errors occurred. The browser test uses a synthetic token and intercepted aggregate response, not live Firebase access.

Run unit tests with `node --test scripts/tests/analytics-dashboard.test.cjs`. The standalone `scripts/tests/analytics-dashboard-browser.cjs` uses Playwright with headless Chrome; set `PLAYWRIGHT_MODULE` to an installed module if it is outside the default resolution path, and `ANALYTICS_QA_OUTPUT` to a private evidence folder. The fixture server is temporary and contacts no production analytics or Firebase service.
