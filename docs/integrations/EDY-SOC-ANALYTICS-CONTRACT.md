# EDY SOC Analytics Contract

Status: Phase 6, schema version `1`. This is an internal analytical contract only. No Power BI, EDY SOC Analytics, SIEM, cloud or external transport is enabled.

## Envelope

Every future dataset uses this strict outer envelope:

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | integer | `1` |
| `generatedAt` | UTC timestamp | ISO 8601 with offset |
| `source` | string | `edy-helpdesk` |
| `dataset` | enum | `Tickets`, `SLAs`, `Assets`, `Diagnostics`, `Knowledge`, `SecurityCases`, `Calendar` |
| `records` | array | Dataset-specific minimized records |

Storage timestamps remain UTC. Date filters entered in the UI are interpreted as calendar boundaries in `America/Sao_Paulo`, then converted to a half-open UTC interval: `from <= timestamp < toExclusive`.

## Tickets v1

Grain: one record per ticket. Key: `ticketCode` (`string`).

| Field | Type | Notes |
|---|---|---|
| `ticketCode` | string | Stable business key |
| `priority` | enum | Low, Medium, High, Critical |
| `status` | enum | Persisted lifecycle state |
| `categoryCode` | string | Business dimension |
| `departmentCode` | string/null | Business dimension |
| `assigneeRef` | string/null | One-way pseudonym, never username/email |
| `assetRef` | string/null | One-way pseudonym, never hardware identifier |
| `createdAt`, `resolvedAt`, `closedAt` | UTC timestamp/null | Lifecycle facts |

Excluded: title, description, solution, comments, internal notes, requester identity and email.

## SLAs v1

Grain: one record per `TicketSla`. Key: `ticketCode` plus policy version.

Fields: `ticketCode:string`, `priority:enum`, `ticketStatus:enum`, `policy:string`, `policyVersion:integer`, `responseTargetMinutes:integer`, `resolutionTargetMinutes:integer`, `pausedSeconds:integer`, `firstResponseMinutes:integer|null`, `resolutionMinutes:integer|null`, `responseBreached:boolean`, `resolutionBreached:boolean`, `responseDueAt:UTC timestamp`, `resolutionDueAt:UTC timestamp`.

Compliance is `resolved within target / resolved tickets with an SLA`. A zero denominator yields `null`, not `0%`. Waiting User and configured Waiting Third Party states pause the clock. Resolution stops it. Reopen resumes the preserved clock; historical breach timestamps are not erased.

## Assets v1

Grain: one record per non-archived asset. Key: `assetCode`.

Fields: `assetCode:string`, `assetType:string`, `status:string`, `departmentCode:string`, `assigned:boolean`, `operatingSystem:string|null`, `lastSeenAt:UTC timestamp|null`, `createdAt:UTC timestamp`.

Excluded: serial number, asset tag, hostname, IP, MAC address, owner identity, notes and diagnostic payload.

## Diagnostics v1

Grain: one record per diagnostic job. Key: `diagnosticRef` pseudonym.

Fields: `diagnosticRef:string`, `assetRef:string`, `actionId:string`, `status:string`, `sourceMode:string`, `requestedAt:UTC timestamp`, `completedAt:UTC timestamp|null`, `durationMs:integer|null`, `findingCount:integer`, `redactionCount:integer`, `errorCode:string|null`.

Excluded: script path/hash, parameters, engine arguments, stdout/stderr, raw payload, finding detail, Event Log messages and WindowsEvent rows.

## Knowledge v1

Grain: one record per article. Key: `articleCode`.

Fields: `articleCode:string`, `status:string`, `categoryCode:string`, `linkedTicketCount:integer`, `version:integer`, `publishedAt:UTC timestamp|null`, `archivedAt:UTC timestamp|null`, `updatedAt:UTC timestamp`.

Excluded: title, summary, problem, symptoms, diagnostic steps, solution, validation steps, tags and author identity.

## SecurityCases v1

Grain: one record per SecurityCase. Key: `securityCaseCode`.

Fields: `securityCaseCode:string`, `severity:enum`, `status:enum`, `assignedAnalystRef:string|null`, `assetRef:string|null`, `evidenceCount:integer`, `timelineEntryCount:integer`, `createdAt:UTC timestamp`, `resolvedAt:UTC timestamp|null`, `closedAt:UTC timestamp|null`.

Excluded: title, summary, reason, resolution narrative, lessons learned, evidence snapshots, manual notes, source ticket text and analyst identity.

## Calendar v1

Reserved as a conceptual date dimension for future BI modelling. Phase 6 does not transmit it externally. Audit Summary exports reuse the `Calendar` envelope discriminator but contain only minimized operational event facts: timestamp, actor type/role, action, resource type and outcome. Actor IDs and metadata are excluded.

## Governance and evolution

- CSV and JSON are the only Phase 6 formats.
- Every export request, result and download is RBAC-scoped and audited without recording exported content.
- Viewer receives only non-sensitive Ticket, SLA, Asset and Knowledge reports. Technician datasets are limited to assigned/requested operational scope where applicable. Admin receives the broader approved set.
- Record schemas are allowlists. New fields require privacy review and an additive v1 change; breaking changes require schema version `2`.
- IDs are aggregated or pseudonymized where a business code is not required.
- No connector exists in Phase 6. The contract is preparation, not integration.
