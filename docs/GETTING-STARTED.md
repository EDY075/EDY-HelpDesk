# EDY HelpDesk — Technical Setup and Local Operations

This guide preserves the detailed installation and local-operation reference outside the concise project landing page.

## Requirements

- Windows, Linux, or macOS.
- Node.js `>=22.12.0`.
- npm `>=10`.
- Loopback ports `5173` and `8080` available for the default development profile.

The public Windows launchers require Windows and never download Node.js, request elevation, alter the registry, or bypass PowerShell execution policy.

## Windows Portfolio Demo

From an extracted release source directory:

```bat
setup-demo.bat
start-demo.bat
```

`setup-demo.bat` checks the platform and toolchain, runs `npm ci`, creates a Git-ignored `.env` with a cryptographically generated local password, generates Prisma clients, applies migrations, and seeds synthetic data.

`start-demo.bat` validates the safe demo profile, starts API, Web, and the isolated Diagnostics Worker, tracks only its own supervised process tree, and opens `http://127.0.0.1:5173`.

Stop only that supervised demo:

```bat
stop-demo.bat
```

Runtime state and local logs stay under `storage/demo-runtime/`, which is ignored by Git.

## Manual setup

```bash
npm ci
```

Copy `.env.example` to `.env`, then set a unique local `DEMO_SEED_PASSWORD` with at least 12 UTF-8 bytes. Do not commit `.env`.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Start all processes:

```bash
npm run dev
```

Individual processes:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:8080/api/v1/health`
- API readiness: `http://127.0.0.1:8080/api/v1/ready`

## Demo accounts

- `demo.admin`
- `demo.technician`
- `demo.viewer`

All three use the password defined locally in `DEMO_SEED_PASSWORD`.

## Configuration reference

| Variable | Safe local example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | runtime mode |
| `API_HOST` | `127.0.0.1` | loopback API binding |
| `API_PORT` | `8080` | API port |
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | exact CORS origin |
| `DATABASE_PROVIDER` | `sqlite` | `sqlite` or `postgresql` |
| `DATABASE_URL` | `file:./storage/edy-helpdesk.db` | local SQLite file |
| `LOG_LEVEL` | `info` | operational log level |
| `PORTFOLIO_DEMO` | `true` | synthetic safety boundary |
| `SESSION_IDLE_MINUTES` | `30` | idle session lifetime |
| `SESSION_ABSOLUTE_HOURS` | `12` | absolute session lifetime |
| `DEMO_SEED_PASSWORD` | local only | Argon2id credential input for synthetic accounts |
| `INTEGRATION_*_ENABLED` | `false` | fail-closed external integration switches |

Configuration missing or inconsistent with the selected provider blocks startup.

## Portfolio Demo boundary

The easy demo launcher requires all of the following:

- `PORTFOLIO_DEMO=true`
- `API_HOST=127.0.0.1`
- `WEB_ORIGIN=http://127.0.0.1:5173`
- SQLite under the project `storage/` directory
- every `INTEGRATION_*_ENABLED=false`
- no real diagnostic execution

Portfolio Demo never executes PowerShell. The Diagnostics Worker still runs as a separate process and reports the honest demo-disabled state.

## Database operations

```bash
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` applies the SQL files in `prisma/migrations/`, records their SHA-256 in `_edy_migrations`, and refuses modified history.

PostgreSQL static parity:

```bash
npm run db:validate:postgresql
npm run db:ddl:postgresql
```

A live PostgreSQL cutover has not been validated. See [SQLite ↔ PostgreSQL parity](database/SQLITE-POSTGRESQL-PARITY.md).

## Backup and restore

```bash
npm run backup:create
npm run restore:validate -- storage/backups/<backup> storage/restore-validation/<new>.db
```

Restore validation always targets a new file and verifies checksum, integrity, foreign keys, and record counts. See [Backup and Restore](operations/BACKUP-RESTORE.md).

## Quality commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run audit:dependencies
npm run scan:secrets
npm run e2e
```

## Production boundary

The default project is local-first. Do not expose it to a public network without a dedicated review of TLS termination, reverse proxy configuration, secret management, observability, shared rate limiting, backup policy, and live PostgreSQL validation.

See [Production Readiness Baseline](operations/PRODUCTION-READINESS-BASELINE.md).
