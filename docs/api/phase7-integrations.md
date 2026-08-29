# Phase 7 integration and settings API

Base: `/api/v1`. All routes use the server-side session, exact Origin/CSRF for mutation, Problem Details, request/correlation IDs and `Cache-Control: no-store`.

| Method | Route | Permission | Contract |
|---|---|---|---|
| GET | `/integrations` | `integrations.read` | three strict statuses plus real Outbox counts |
| GET | `/settings` | `settings.read` | effective non-secret application/session/diagnostics/integration settings |
| POST | `/integrations/analytics/exports` | Admin `integrations.manage` | `{ dataset }`; returns server filename, size, count, SHA-256, timestamp |

The three integration records are exactly Sentinel, SIEM and Analytics. Status values are allowlisted. `Connected` requires a real successful validated communication; this RC returns `Unavailable`, `Incompatible` and `ExportReady` respectively.

Analytics datasets: Tickets, SLAs, Assets, Diagnostics, Knowledge, SecurityCases and Calendar. Each file is a strict envelope with `schemaVersion`, `generatedAt`, `source`, `dataset`, `recordCount` and `records`. Filename and directory are server-controlled; content is minimized and pseudonymized.

No endpoint accepts a destination URL, token, script, command, path or arbitrary payload from the client. Connection test/enable/disable actions are not exposed because compatible remote adapters are not approved.
