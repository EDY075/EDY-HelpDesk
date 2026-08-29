# Phase 4 — Local read-only diagnostics: operator guide

Project: `<project-root>`. All commands below run from that folder.
The approved architecture, security policy, roadmap and ADRs are unchanged.

## Deployment modes

Demo and Operational use separate databases and separate running instances. The persisted
`DeploymentState.mode` is immutable. Changing `PORTFOLIO_DEMO` on an existing database
fails startup; it does not convert or sanitize the data. Never copy Operational results
into Demo. Do not run the synthetic seed against Operational storage.

The existing Demo preview remains at `http://127.0.0.1:4173`, API port 8081.
Its nine persisted example results are synthetic and stale by design. Worker startup in
Demo does not resolve or launch PowerShell, and API execution requests return 403.

## Explicit Operational setup

Use a non-elevated Windows account. This guide does not change ACLs, Windows services,
execution policy or UAC. If policy blocks the collector, stop and document the limitation.
The native host requires the installed .NET Framework C# compiler; a .NET SDK is not required.

1. Build the application and the reviewed native containment host:

   ```text
   npm run build
   npm run diagnostics:build-host
   ```

2. Create a **private, ignored** `.env.operational` using a local editor. Do not overwrite
   the Demo `.env`. Example values (replace the password placeholder privately):

   ```dotenv
   NODE_ENV=development
   API_HOST=127.0.0.1
   API_PORT=8082
   WEB_ORIGIN=http://127.0.0.1:4174
   DATABASE_URL=file:./storage/operational/local.db
   LOG_LEVEL=info
   PORTFOLIO_DEMO=false
   SESSION_IDLE_MINUTES=30
   SESSION_ABSOLUTE_HOURS=12
   LOCAL_ADMIN_USERNAME=admin.local
   LOCAL_ADMIN_PASSWORD=<private-value-at-least-12-characters>
   ```

3. Initialize an empty, dedicated database and its first Admin:

   ```text
   node --env-file=.env.operational --import tsx scripts/db-migrate.ts
   node --env-file=.env.operational --import tsx scripts/bootstrap-local-operational.ts
   ```

   Bootstrap requires `storage/operational/`, refuses existing accounts, and creates one
   local department/category. It never imports Demo fixtures or executes diagnostics.
   Remove the plaintext `LOCAL_ADMIN_PASSWORD` entry from that private file afterward;
   the application stores an Argon2id hash. Keep the credential in your password manager.

4. Start API and Worker in separate non-elevated terminals:

   ```text
   node --env-file=.env.operational apps/api/dist/server.js
   node --env-file=.env.operational apps/diagnostics-worker/dist/index.js
   ```

5. In another terminal, configure the Web proxy and start the separate local preview:

   ```powershell
   $env:VITE_API_PROXY_TARGET='http://127.0.0.1:8082'
   npm run preview -w @edy/web -- --port 4174
   ```

6. Sign in at `http://127.0.0.1:4174`. Create an asset in the Local operations department,
   open its diagnostic workspace and explicitly select **Register Local Endpoint** as Admin.
   Registration binds the asset to the local host fingerprint and increments `Asset.version`.
   Hostname/IP inventory fields are never targets. Review an approved action and press
   **Run diagnostic**. Opening an asset or ticket does not enqueue a job.

PowerShell selection prefers the standard PowerShell 7 install, then Windows PowerShell 5.1.
For a nonstandard install, `DIAGNOSTICS_ENGINE_PATH` may be set privately by the operator
to an absolute local `pwsh.exe`/`powershell.exe` path. It is not an API parameter. UNC paths
and reparse-point engines are rejected. Each result records the actual engine version.

## Execution and interpretation rules (version 1)

| Observation | Rule | State / caveat |
|---|---|---|
| OS / boot time | Recorded metadata | Info, not an OS health certification |
| CPU | utilization >= 90% | Warning; one sample, not sustained load |
| RAM | used / total >= 90% | Warning; zero/unknown total gives Unknown |
| System drive | available / total < 5% | Critical, objective capacity threshold |
| System drive | available / total >= 5% and < 15% | Warning |
| CPU/RAM/disk | Below warning thresholds, valid data | Healthy observation only |
| Services | Dhcp, Dnscache, EventLog, LanmanWorkstation not Running | Warning; Unknown remains Unknown |
| Other allowlisted services | W32Time, wuauserv, Spooler not Running | Info; expected state depends on endpoint use |
| Active adapters / DNS config | No active adapter / no configured DNS | Warning |
| Gateway | No reply to 2 bounded ICMP probes | Warning; ICMP filtering is possible |
| Gateway | No detected default gateway | Unknown |
| DNS | Resolution of fixed `example.com` fails | Warning, not a root-cause claim |
| Route | No default IPv4 route among bounded records | Warning |
| Windows Update | Installed hotfix history only | Info; pending updates are not assessed |
| Events | Count of matching records | Info; not evidence of compromise by itself |
| Unavailable provider | PermissionLimited / Unsupported | Unknown; never escalate privileges |

Fresh means collected within 15 minutes; older means Stale. Area cards flag stale contributing
snapshots independently. Result pages refresh freshness periodically. The health summary
uses up to 50 recent jobs and the most recent retained result per action, not an exhaustive
or continuous endpoint assessment. Historical findings and rule version are stored once.
Severity aggregation prioritizes Critical, Warning, Unknown, Info, then Healthy; missing data
must not imply health. Recommendations are text only. Knowledge suggestions are manual
search links, never AI-generated causes or automatically created articles.

## Limits and retention

| Control | Value |
|---|---:|
| Successful new requests per account | 10 in 5 minutes |
| Active jobs per asset | 1 (Queued or Running) |
| Global executing jobs per database | 1, exclusive renewable Worker lease |
| Queue ceiling | 20 active jobs (additional guard; one registered endpoint in v1) |
| Normal action deadline / combined output cap | 15 seconds / 65,536 bytes |
| Event query deadline / combined output cap | 20 seconds / 524,288 bytes |
| stderr cap, every action | 8,192 bytes; never persisted |
| Event query limit | 1–100 records, default 50; message <= 2,048 characters |
| Event windows | 1h, 6h, 24h, 7d |
| History and event page | default 10, maximum 50 |
| Adapters / route records / gateway probes | 16 / 32 / 2 |
| Lease / heartbeat / abandoned-job reconciliation | 10s / 500ms / after 35s |
| WindowsEvent / detailed result / minimal job | 30 / 90 / 365 days |

Operational Worker purges expired records at most 100 per type per minute and appends count-only
audit. API hides expired details even before purge. Event text exists only in WindowsEvent,
not duplicated inside the 90-day result. Application never purges AuditEvent. Running jobs
are never purged; interrupted jobs fail without replaying their action.

No export functionality was added. Existing policy remains 7-day export files / 90-day export
metadata. API/Worker emit sanitized structured logs to stdout; no rotating file sink was added.
If an operator captures those streams, configure that supervisor's maximum size and 30-day
retention. There is no claim that arbitrary terminal capture files are auto-purged.

## Privacy and deployment boundary

Real hostname, addresses and inventory remain private Operational data for Technician/Admin.
Viewer receives stored interpreted findings, not raw inventory payload or event messages.
Event text/provider sanitization covers profile/UNC paths, current hostname/username,
email, IPv4/IPv6, MAC, common internal DNS suffixes and common credential labels. This is
best-effort minimization, not a guarantee that arbitrary event prose contains no sensitive data.
Messages are React text nodes, never raw HTML. No public export or automatic screenshot exists.

Databases, runtime executables, diagnostics, logs, exports, screenshots and debug artifacts
are ignored. Real QA writes only private `storage/operational-qa/` databases. Backups under
`archive/` remain private and are not a publication source. Secret scan checks versionable
source/docs; it does not certify ignored runtime databases as safe to publish.

Local host/account compromise is outside the app's isolation guarantee. The development
account can modify the source, manifest, native binary and database. For dedicated operation,
review Windows ACLs: code/catalog/native host read+execute only to the runtime account;
write access only to its private storage/log directories. No ACL or service-account changes
were silently applied during this phase. Protect local database/backup files and disk encryption
through the authorized Windows administration process. No field-level encryption was added.

## Verification commands

```text
npm run check
npm run audit:dependencies
npm run scan:secrets
npm run smoke:phase3
npm run smoke:phase4
node --import tsx scripts/qa-bootstrap.ts
npm run diagnostics:qa-containment
npm run diagnostics:qa-real
```

`qa-real` is an explicit authorized real collection, not a routine unit test. It starts an
isolated Operational API and a separate Worker, exercises all 10 collection cases, and prints
safe metadata only. To validate another engine, set the private engine-path variable first.
Containment QA uses inert controlled fixtures outside the production catalog; it tests only
its own process descendants, never arbitrary processes. Unit tests use injected fake runners.
