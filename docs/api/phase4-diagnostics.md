# Phase 4 — Diagnostics API v1

Base `/api/v1`, authenticated server-side session. Mutation requires the approved Origin
and session CSRF header. Existing auth, RBAC, error envelope and rate controls remain intact.

| Method / route | Permission | Contract |
|---|---|---|
| GET `/diagnostics/catalog` | diagnostics.read | mode, liveExecutionEnabled, workerStatus, localAssetId, public catalog metadata |
| POST `/diagnostics/local-endpoint` | Admin, diagnostics.configure | strict `{assetId, version}`; optimistic asset locking; 200 |
| POST `/assets/:id/diagnostics` | Admin/Technician, diagnostics.execute | strict `{actionId, parameters}` plus UUID `x-idempotency-key`; 202 new, 200 replay |
| GET `/assets/:id/diagnostics` | diagnostics.read | paginated history, persisted findings, freshness, requester, duration |
| GET `/diagnostics/jobs/:id` | diagnostics.read | lifecycle/result and separately paginated sanitized event records |
| POST `/diagnostics/jobs/:id/cancel` | requester Technician or Admin | strict `{}`; 202 cancellation request |

All routes require authentication; Viewer can only read sanitized results. A Technician
cannot cancel another technician's job. Admin has no shell or catalog bypass. Catalog
modification via HTTP is deliberately absent: reviewed definitions are internal source and
versioned deployment data, not arbitrary administrator script uploads.

Queries accept only `page` >= 1 and `pageSize` 1–50. Unknown fields are rejected. Catalog
responses omit scriptPath and scriptHash. Job metadata includes the immutable script hash
snapshot for provenance, but never an executable path or raw stderr.

## Request examples

```json
{"actionId":"windows.system.summary","parameters":{}}
```

```json
{"actionId":"eventlog.query","parameters":{"logName":"System","level":"Warning","timeWindow":"24h","limit":50}}
```

Every action except `eventlog.query` accepts an empty strict object. The event schema allows
System/Application, Critical/Error/Warning/Information, 1h/6h/24h/7d and limit 1–100 (default 50).
No command, script, path, executable, shell, raw argv, target, arbitrary domain, service name,
XPath or Security log is accepted. Inventory fields cannot become targets.

400 = invalid schema/key; 401 = session required; 403 = role/mode/endpoint/catalog denied;
404 = unknown resource; 409 = busy/stale registration/worker unavailable/idempotency conflict;
429 = account/queue limit. Errors disclose safe summaries, not native errors or PowerShell output.

## Worker-only output contract

Strict envelope: schemaVersion 1, matching actionId, collectedAt ISO date-time, actual
engine (`WindowsPowerShell` or `PowerShell` plus version), availability, data.
Supported payloads use action-specific strict Zod schemas. PermissionLimited/Unsupported
requires null data. Unknown keys, invalid types/counts/resource bounds, wrong action,
out-of-window events or stale/future collection timestamps are not successful results.

`DiagnosticAction.outputSchema` stores an inspectable JSON Schema; shared Zod validators
also enforce cross-field and request-specific rules. The API never trusts browser-provided output.

## State and transaction rules

```text
Queued -> Running -> Succeeded | Failed | TimedOut | Cancelled
Queued -> Cancelled
```

Enqueue + audit, claim + audit, result + terminal status + audit are transactional. Success
audit failure rolls back the result. Running cancellation sets cancelRequestedAt; the Worker
aborts its contained process tree, then commits Cancelled and audit. Cancellation observed
before result commit wins. A request racing an already committed success returns conflict.
No automatic retry. Reuse of an idempotency key with a different payload returns 409.

SQL enforces one active job per asset and job/result ownership. Worker leasing is global to
one database, not a distributed lock across independent installations. Only one local endpoint
is registered in v1. Host fingerprint mismatch refuses execution. No remote transport exists.

Demo result queries are mode-filtered. Operational raw inventory is hidden from Viewer;
event messages are returned only to Admin/Technician. Result expiry returns null details,
not invented empty-success data. Historical findings remain tied to their stored rule version.

## Audited operations

`diagnostic.requested`, `denied`, `started`, `succeeded`, `failed`, `timed_out`, `cancelled`,
`cancellation_requested`, `script_integrity_failure`, `output_validation_failure`,
`event_log_queried`, `endpoint_registered`, `retention_purge`.

Audit metadata is bounded provenance/counts/status, never raw output, event text, credentials,
engine paths or private local inventory. Existing append-only database triggers are unchanged.
Transactional Outbox remains untouched; these local jobs do not make external integrations.
