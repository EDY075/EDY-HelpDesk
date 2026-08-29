# EDY HelpDesk 1.0.0 — Release Notes

EDY HelpDesk 1.0.0 is the first audited local portfolio release of the IT Operations / Service Desk platform.

## Highlights

- End-to-end service desk workflow with governed ticket lifecycle, SLA tracking and optimistic locking.
- Asset inventory, Endpoint 360, Knowledge Base and user context.
- Isolated read-only diagnostics worker backed by a server-owned PowerShell allowlist; Portfolio Demo never executes PowerShell.
- Governed Ticket → Security Case escalation, sanitized evidence and append-oriented audit history.
- Operational dashboards, reports, safe CSV/JSON exports and a transactional integration outbox.
- Official `pt-BR` and `en` interfaces with locale-aware formatting and persistent preferences.
- Operations and Dark themes built on shared design tokens.
- Deny-by-default RBAC, server-side sessions, CSRF/origin controls and sanitized production errors.

## Validation

The final local audit covers clean installation, lint, type checking, unit/integration tests, Playwright E2E, build, dependency audit, secret/privacy scanning, SQLite integrity, smoke testing, performance and authenticated Chrome review.

## License

EDY HelpDesk 1.0.0 is distributed under the [MIT License](../LICENSE). Copyright (c) 2026 Edmilson Gomes.

## Known boundaries

- This is a local-first release. It does not include public deployment, TLS termination or a production secret manager.
- PostgreSQL schema and DDL parity are validated statically; a live PostgreSQL cutover remains unvalidated.
- Sentinel and SIEM adapters remain disabled and fail-closed. SOC Analytics support is limited to a minimized local export contract.
- No remote shell, arbitrary command, remediation, WinRM, SSH, RDP or endpoint elevation exists.
- Public repository publication still requires explicit owner authorization; no repository or release is created automatically.

This document is a local release draft. It has not been published.
