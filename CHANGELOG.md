# Changelog

Release notes for EDY HelpDesk. This file summarizes product increments; it is not a commit log.

## 1.0.0 — Final local release

- Completed the public-repository hygiene, privacy, clean-install, localization, theme, accessibility and visual release audit.
- Added browser auto-translation protection so the native `pt-BR` and `en` interfaces remain authoritative.
- Hardened generic 500 logging to exclude internal error messages.
- Made `db:seed` self-contained after a clean install by building internal packages first.
- Fixed mobile navigation background scrolling and added regression coverage.
- Promoted all package, API and OpenAPI metadata from `1.0.0-rc.1` to `1.0.0`.

## 1.0.0-rc.1 — Phase 7: Integrations & Production Readiness

- Added read-only discovery and versioned, fail-closed integration contracts.
- Added local minimized analytics exports, Integration status UI and Operations health.
- Completed Transactional Outbox retry, exponential backoff, idempotency and dead-letter behavior.
- Added dual-provider Prisma readiness, PostgreSQL DDL and SQLite/PostgreSQL parity documentation.
- Added Playwright functional/RBAC/responsive automation with an isolated synthetic database.
- Added controlled SQLite backup/restore validation, retention and production-readiness runbooks.
- Hardened sessions, cookies, redirects, error boundaries, logs, configuration and publication scanning.
- Added graceful shutdown and route-level frontend code splitting.

## Phase 6 — Dashboard & Reports

- Added analytics dashboards backed by operational records, accessible charts and date filters.
- Added role-aware reporting, report history and safe CSV exports.
- Added performance baselines and Operations analytics surfaces.

## Phase 5 — Security Escalation

- Added the governed Ticket-to-SecurityCase escalation workflow with 1:0..1 cardinality.
- Added Security dashboard, queue, evidence summaries, assignments, severity and resolution flows.
- Added minimized EDY SIEM outbox contract while keeping delivery disabled.

## Phase 4 — Local Read-Only Diagnostics

- Added isolated Diagnostics Worker and formal DiagnosticAction allowlist.
- Added bounded, non-elevated local PowerShell diagnostics and structured sanitized results.
- Added Endpoint Health, Event Logs, Diagnostic History and endpoint context in tickets.

## Phase 3 — Assets & Knowledge Base

- Added asset inventory, Endpoint 360, user assignment and ticket linkage.
- Added Knowledge Base draft/publish/archive lifecycle and ticket references.
- Added optimistic locking and stable business numbering for assets and articles.

## Phase 2 — Service Desk Core

- Added Ticket lifecycle, assignment, comments, internal notes, SLA tracking and operational queues.
- Added transactional ticket numbering, optimistic locking and append-only auditing.
- Added synthetic Portfolio Demo and responsive premium application shell.

## Phase 1 — Technical Foundation

- Established the TypeScript monorepo, React Web, Express API and separate Worker.
- Added session authentication, deny-by-default RBAC, Prisma/SQLite persistence and versioned `/api/v1` routes.
- Added validated configuration, structured logs, migrations, seed and quality gates.

## License

No license has been selected. License approval is a release/publication prerequisite; no arbitrary license is implied by this repository.
