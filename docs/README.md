# EDY HelpDesk Documentation

Use this index for the technical detail intentionally kept outside the project landing page.

## Core

- [Architecture](../ARCHITECTURE.md)
- [Security](../SECURITY.md)
- [Roadmap](../ROADMAP.md)
- [Technical setup and operations](GETTING-STARTED.md)
- [Release notes 1.0.1](RELEASE-NOTES-1.0.1.md)
- [Release notes 1.0.0](RELEASE-NOTES-1.0.0.md)

## Architecture decisions

- [ADR-001 — Modular Monolith](adr/ADR-001-modular-monolith.md)
- [ADR-002 — SQLite to PostgreSQL Strategy](adr/ADR-002-sqlite-to-postgresql-strategy.md)
- [ADR-003 — Diagnostics Worker Isolation](adr/ADR-003-diagnostics-worker-isolation.md)
- [ADR-004 — PowerShell Allowlist Model](adr/ADR-004-powershell-allowlist-model.md)
- [ADR-005 — Transactional Outbox](adr/ADR-005-transactional-outbox.md)
- [ADR-006 — Authentication and RBAC](adr/ADR-006-authentication-and-rbac.md)

## API and data

- [OpenAPI v1](api/openapi-v1.yaml)
- [Assets and Knowledge API](api/phase3-assets-knowledge.md)
- [Diagnostics API](api/phase4-diagnostics.md)
- [Security API](api/phase5-security.md)
- [Integrations API](api/phase7-integrations.md)
- [SQLite ↔ PostgreSQL parity](database/SQLITE-POSTGRESQL-PARITY.md)

## Operations

- [Production Readiness Baseline](operations/PRODUCTION-READINESS-BASELINE.md)
- [Backup and restore](operations/BACKUP-RESTORE.md)
- [Observability](operations/OBSERVABILITY.md)
- [Retention](operations/RETENTION.md)
- [Local diagnostics operations](phase4-operations.md)

## Security and publication evidence

- [Phase 7 Security Review](security/PHASE-7-SECURITY-REVIEW.md)
- [Final Release Audit](FINAL-RELEASE-AUDIT-REPORT.md)
- [Publication Gate Report](PUBLICATION-GATE-REPORT.md)
- [GitHub Presentation and Easy Demo Report](GITHUB-PRESENTATION-EASY-DEMO-REPORT.md)
- [Publication Checklist](PUBLICATION-CHECKLIST.md)
- [Localization and Themes Report](LOCALIZATION-THEMES-FINAL-REPORT.md)

Screenshots under `docs/screenshots/` are synthetic Portfolio Demo evidence. No operational screenshot belongs in the public repository.
