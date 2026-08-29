# Phase 7 internal security review

Scope: authentication, sessions, CSRF, CORS, RBAC/IDOR, validation/mass assignment, SQL assumptions, XSS, CSV injection, traversal, redirects, serialization, logging, secrets, integrations, backup and publication.

## Findings

| Severity | Count | Result |
|---|---:|---|
| Critical | 0 | None found |
| High | 0 | None found |
| Medium | 0 open | Findings below corrected |
| Low | 0 open | Operational limitations documented |
| Informational | 3 | PostgreSQL live test unavailable; public TLS/reverse proxy not configured; external screen-reader test not performed |

Corrected findings:

- SIEM asset context exposed internal ID/code/hostname: replaced by deterministic pseudonymous reference.
- Unsupported integration switches could claim enabled state: startup now fails closed until a compatible adapter/pipeline is approved.
- Viewer direct navigation exposed the new-ticket form: read-only state now blocks it before mutation.
- New security cases displayed an invalid Resolve action: UI now follows the domain transition graph.
- Repeat login left the previous browser session active: authenticated login now rotates/revokes it.
- Stale browser session remained in an error page: a 401 now clears client session state and returns to login.
- Protocol-relative return paths were accepted by the login redirect guard: `//` is now rejected.
- Malformed percent-encoded cookies could raise a parser error: treated as unauthenticated.
- Readiness/startup logs could include raw exception messages: logs now record safe error names only.
- PostgreSQL helper commands contained credential-like fallback examples: replaced by a non-secret validation URL and an explicit external `POSTGRES_TEST_DATABASE_URL` requirement for live deployment.
- The compiled Worker bundled the PostgreSQL driver in a form that could fail at startup: database driver packages are now externalized and the production artifact was restart-tested.

Additional QA corrections:

- Portfolio Demo reported a missing Worker heartbeat as an operational fault even though real diagnostics are intentionally disabled: health now reports `Disabled / Not required in Portfolio Demo`.
- One deterministic ticket fixture described the security workflow as inactive: the synthetic seed text now reflects the approved governed escalation workflow.

Controls verified by tests: exact Origin, CSRF cookie/header/hash, HttpOnly/Strict/Secure production cookie policy, server-side logout revocation, idle and absolute expiry, RBAC negatives, optimistic locking, strict Zod allowlists, path allowlists, CSV formula neutralization, sanitized Problem Details, Helmet CSP without `unsafe-eval`, integration timeout/retry/dead-letter and backup checksum/integrity.
