# SQLite ↔ PostgreSQL parity matrix

Phase 7 baseline, 29/08/2026. Canonical domain source: `prisma/schema.prisma`. PostgreSQL projection: `prisma/schema.postgresql.prisma`, generated mechanically by `npm run db:sync:postgresql-schema`.

## Validation status

| Gate | SQLite | PostgreSQL |
|---|---|---|
| Prisma schema validation | PASS | PASS |
| Generated Prisma client | PASS | PASS |
| Model/enum/field/index parity test | PASS | PASS |
| Deployment DDL generation | Existing 6-migration runner | PASS, baseline SQL generated |
| Local live server deployment | PASS | **NOT VALIDATED — no PostgreSQL server, Docker, Podman or `psql` was available** |
| Seed and runtime tests | PASS | NOT VALIDATED |

No cloud database or repository credential was used. PostgreSQL cannot be reported as runtime PASS until a local server executes deployment, seed, foreign-key, transaction and application tests.

## Domain parity

| Feature | SQLite | PostgreSQL readiness |
|---|---|---|
| Tickets and optimistic `version` | Tested | Identical model, constraints and indexes |
| SLA | Tested | Identical timestamps, relationships and indexes |
| Assets / AST sequence | Tested | Identical unique constraints and `SequenceCounter` |
| Knowledge / KB sequence | Tested | Identical unique constraints and optimistic lock |
| Diagnostics | Tested | Identical allowlist, job/result/event relationships |
| Security / SEC sequence | Tested | Identical 1:0..1 Ticket relation and case version |
| AuditEvent append-only | SQLite triggers tested | Schema parity; PostgreSQL append-only trigger must be installed and live-tested before production |
| Transactional Outbox | Retry/dead-letter tested | Identical status, uniqueness and scheduling indexes |
| Reports / ExportJob | Tested | Identical enums, retention and ownership indexes |

## Strategy

- SQLite remains the default local/Portfolio Demo database.
- `DATABASE_PROVIDER` must match `DATABASE_URL`; mismatch blocks startup.
- Runtime selects `PrismaBetterSqlite3` or `PrismaPg` without sharing generated internal models.
- The approved custom SQLite migration runner remains authoritative on Windows; it was not deleted or relabeled as Prisma Migrate.
- PostgreSQL starts from the generated RC baseline DDL under `prisma/migrations-postgresql/`. Future PostgreSQL changes require a provider-specific migration history and live CI/service validation.
- Cutover requires an offline, checksummed export/import rehearsal, sequence reconciliation, record counts, critical relationship checks and rollback backup.
