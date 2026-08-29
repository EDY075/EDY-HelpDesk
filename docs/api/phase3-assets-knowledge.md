# Phase 3 — Assets & Knowledge API

Implementation contract, 2026-08-28. Base: `/api/v1`. This document supplements;
it does not replace the approved architecture, security baseline or ADRs.

## Authentication, errors and concurrency

All routes require the existing server-side session. Mutations additionally require
the accepted Origin and `X-CSRF-Token`. RBAC is enforced server-side. JSON payloads
use strict Zod DTOs; unexpected fields, including executable commands and script paths,
are rejected. Existing payload limits, request/correlation IDs and Problem Details apply.

- `200`: successful read/update; `201`: creation; `204`: ticket link change.
- `400`: invalid fields or invalid relationship target.
- `401`: no valid session; `403`: insufficient permission or ticket outside scope.
- `404`: absent resource; hidden Draft/Archived article for Viewer also returns 404.
- `409`: stale version, incompatible lifecycle, duplicate unique value/link or annual capacity.

Every asset/article mutation except creation requires a positive integer `version`.
Ticket resource links require **Ticket.version**, not the asset/article revision.
Writes use compare-and-swap in the same transaction as audit/history; a successful
change increments its aggregate version. A rejected write does not overwrite data.
Clients reload the latest revision and review before retrying; no automatic merge.

## RBAC

| Operation | Viewer | Technician | Admin |
|---|---|---|---|
| Read assets/User Workspace | Yes | Yes | Yes |
| Create/edit/assign asset | No | Yes | Yes |
| Archive/restore asset | No | No | Yes |
| Read Published knowledge | Yes | Yes | Yes |
| Read Draft/Archived knowledge | No | Yes | Yes |
| Create/edit Draft | No | Yes | Yes |
| Edit Published | No | No | Yes |
| Publish/archive/restore article | No | No | Yes |
| Link/unlink ticket resources | No | Assigned tickets only | Any non-Closed ticket |

Permissions: `assets.read`, `assets.manage`, `assets.archive`, `knowledge.read`,
`knowledge.draft`, `knowledge.publish`, `knowledge.link`; existing `tickets.update`
and `directory.read` protect the corresponding integrations. Unlisted permissions
are denied. Closed tickets cannot change resource links.

## Routes — 19 method/path contracts

| Method | Path | Input / result |
|---|---|---|
| GET | `/assets` | Filtered/paginated inventory |
| POST | `/assets` | Create manual asset; returns 201 |
| GET | `/assets/:id` | Inventory, owner, department, up to 50 related tickets and 50 audit entries |
| PATCH | `/assets/:id` | `version` and editable inventory fields |
| POST | `/assets/:id/assignments` | `version`, `assignedUserId: UUID \| null` |
| POST | `/assets/:id/archive` | `version`; sets archivedAt |
| POST | `/assets/:id/restore` | `version`; clears archivedAt |
| GET | `/users/:id` | User, department, non-archived assigned assets, open/recent tickets |
| POST | `/tickets/:id/asset` | `version`, `assetId: UUID \| null`; returns 204 |
| GET | `/knowledge` | Filtered/paginated article list |
| POST | `/knowledge` | Structured content; always creates Draft, returns 201 |
| GET | `/knowledge/:id` | Article, safe author projection, category, tags, related tickets |
| PATCH | `/knowledge/:id` | `version` and editable content |
| POST | `/knowledge/:id/publish` | `version`; Draft → Published |
| POST | `/knowledge/:id/archive` | `version`; Draft/Published → Archived |
| POST | `/knowledge/:id/restore` | `version`; Archived → Draft |
| GET | `/tickets/:id/knowledge` | Linked Published articles only |
| POST | `/tickets/:id/knowledge/link` | `version`, `articleId`; returns 204 |
| POST | `/tickets/:id/knowledge/unlink` | `version`, `articleId`; returns 204 |

The existing ticket create/PATCH routes also validate asset activity and preserve
link history. There are no physical DELETE endpoints for assets or articles.

## Asset contract

Required at creation: `name` (2–150 chars), `type`, active `departmentId`.
Optional: `hostname`, `manufacturer`, `model`, `serialNumber`, `operatingSystem`,
`osVersion`, `cpu`, `ramBytes`, `storageBytes`, `ipv4`, `macAddress`, `status`,
`location`, `purchaseDate`, `warrantyUntil`, `notes`, `lastSeenAt`.

Types: Desktop, Laptop, Server, Printer, NetworkDevice, Mobile, Other.
Statuses: Active, InStock, Maintenance, Retired, Lost. Archived is independent.
Server-owned: UUID, immutable `assetCode`, version and creation/update/archive dates.
Legacy assetTag, assetType and ownerId are retained; API exposes `type` and
`assignedUserId` aliases. Use the dedicated assignment endpoint for ownership.

IPv4 is syntactically validated. MAC accepts six colon-separated hexadecimal octets
and normalizes uppercase. Serial number accepts letters, digits, space, dot, underscore,
slash and hyphen, up to 100 chars. Hostname uses letters/digits/dots/hyphens, up to 253
chars. Neither field is resolved or contacted. Byte sizes are nonnegative safe integers
up to Number.MAX_SAFE_INTEGER. Dates accept ISO date-time strings or null.
Technical values remain optional; `lastSeenAt` is manual metadata, not telemetry.

The detail response states `inventorySource: "manual"` and `diagnosticsAvailable: false`.
No endpoint executes diagnostics, scripts, commands or remote requests.

Asset filters: `search`, `type`, `status`, `departmentId`, `assignedUserId` (UUID or
`unassigned`), `operatingSystem`, `includeArchived=true|false` (default false).
Search covers name/code/legacy tag/hostname/serial/model. Sorting: `updatedAt`
(default), `assetCode`, `name`, `lastSeenAt`; `order=asc|desc` (API default desc).

## Knowledge contract

Creation requires `title`, `summary`, `problem`, `symptoms`, `diagnosticSteps`,
`solution`, `validationSteps`, active `categoryId`, `tags`. Draft sections may be empty;
title requires 3–200 chars. Summary max 1,000; each support section max 8,000.
The author is taken from the authenticated account, never supplied by the client.
Publishing requires all support sections and summary to be nonempty.
Archived records cannot be edited; restore creates Draft status while retaining
historical `publishedAt`. A subsequent publish sets the new publication timestamp.

Content is plain text. HTML-like tags are rejected and React renders escaped text;
there is no HTML/Markdown interpreter or WYSIWYG surface. Tags are an array of at
most 12 values, 1–40 chars each, letters/digits/spaces/hyphens; normalized lowercase,
deduplicated and sorted. No article executes its diagnostic prose.

Search covers code/title/summary/problem/symptoms/solution/tags. Filters:
`categoryId`, `status=Draft|Published|Archived`, exact `tag`. Sort: `updatedAt`
(default) or `title`, with `order=asc|desc`. Viewer is constrained to Published;
other roles default to non-Archived. No artificial relevance or popularity rank.

List pagination for both areas: `page` default 1, `pageSize` default 25, max 100;
response `{ data, pagination: { page, pageSize, total, totalPages } }`.
Search max 200 chars. Stable ID tie-break ordering prevents random ordering of equal values.

## Persistence and numbering

`SequenceCounter(scope,year)` allocates AST-YYYY-NNNNNN and KB-YYYY-NNNNNN in UTC
inside the create transaction. UUID remains internal identity. Codes cannot be edited
through DTOs; SQLite triggers additionally prohibit code UPDATE. At 999999 per scope/year,
creation returns 409. Concurrency is covered by API tests for both sequences.

Migration `20260828230000_assets_knowledge` is additive. It assigns deterministic
AST-2026 codes to legacy assets ordered by createdAt/id and initializes the asset
counter without decreasing it. The 2026 prefix is deliberate for this versioned
historical migration; runtime allocations use the actual UTC year.

Inventory type/status use validated string sets to preserve legacy Asset storage
without rebuilding its table. RAM/storage use SQLite REAL/Prisma Float because Prisma
Int is too small for modern byte sizes; the API safe-integer bound preserves exactness
and JSON number compatibility. A future PostgreSQL migration must preserve this bound.

Tags use a bounded delimiter-encoded column (`|dns|network|`) for a small local-first
catalog. Input validation excludes the delimiter, so exact-tag filtering is unambiguous.
This is not a general full-text index. Normalize/index further only with demonstrated scale.

`KnowledgeArticleTicket` has unique(ticketId,articleId) and restricted foreign keys.
Unlink removes only the current association, not its article/ticket or historical audit.
Archiving does not delete associations; non-Published knowledge is hidden from the
ticket reference list until published again. User Workspace caps open tickets at 25
and recent tickets at 10; article detail caps related tickets at 50.

## Audit and history

Append-only AuditEvent records asset create/update/assign/reassign/unassign/archive/
restore, article create/update/publish/archive/restore and ticket resource link changes.
Events include actor ID/role snapshot, timestamp, request/correlation IDs and resource.
Assignment records old/new user IDs. Asset edits record field names and old/new department.
Ticket asset changes record previous/new asset IDs in both AuditEvent and TicketHistory;
knowledge changes record article ID/code. TicketHistory includes actor and prior/new version.
Audit stores change metadata, not complete copies of knowledge prose or credentials.
Existing anti-UPDATE/DELETE audit triggers remain active. Hash chaining stays deferred.

## Explicitly deferred

Create Knowledge Draft from Ticket is not implemented: a safe field-by-field review
and redaction workflow is needed before copying potentially personal or internal text.
Manual Draft creation is available. No automatic solution copying or publication exists.
Diagnostics Worker, allowlist architecture, requiresElevation=false, Outbox and localhost
defaults remain intact; Phase 3 activates no diagnostic capability or external adapter.
