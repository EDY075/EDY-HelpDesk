# EDY HelpDesk — Pre-integration Discovery

Discovery date: 2026-08-29 (America/Sao_Paulo)

Scope: read-only inventory of local project directories under `<local-project-root>`. No file,
database, configuration, branch or runtime state in another EDY project was changed.

## Result

| Product requested | Real primary path | State | HelpDesk compatibility |
| --- | --- | --- | --- |
| EDY Sentinel | Not found | Unavailable | Not evaluated; no API may be invented |
| EDY SIEM | `<local-project-root>/EDY-SIEM` | Available, v0.3.0 | Incompatible with the current HelpDesk SecurityCase contract |
| EDY SOC Analytics | `<local-project-root>/EDY-SOC-Analytics` | Available, v1.0.0 project/release baseline | File contract exists, but it consumes SIEM Event/Alert/Incident rather than HelpDesk datasets |

Directories named security-fix, reconcile, recovery or backup were treated as derivative
worktrees/archives and were not selected as integration targets.

## EDY Sentinel

No directory or project named EDY Sentinel exists under the discovered scope. EDY Shield
exists, but it is a distinct endpoint integrity product and must not be relabeled as
Sentinel. Stack, version, endpoint, authentication and contract are therefore
**UNAVAILABLE / NOT VALIDATED**.

Required before integration:

1. an approved canonical project path;
2. a versioned read-only endpoint-context contract;
3. authenticated localhost/private transport;
4. explicit mapping to HelpDesk Asset, DiagnosticAction and DiagnosticResult;
5. proof that no arbitrary command, script path, shell argument or executable crosses the
   boundary.

## EDY SIEM

### Observed implementation

- Stack: Python 3.12, FastAPI, Pydantic v2, SQLite persistence, React 18/Vite frontend.
- Version: `0.3.0` in `pyproject.toml` and project documentation.
- API base: `/api/v1`; OpenAPI at `/openapi.json` and Swagger at `/docs`.
- General API authentication: optional `X-API-Key` when `EDYSIEM_API_KEY` is configured.
- Machine-to-machine ingestion authentication: scoped rotatable Bearer token from
  `EDYSIEM_SHIELD_INGEST_TOKEN`; HTTPS is required outside loopback.
- Implemented ingestion endpoint:
  `POST /api/v1/ingestion/sources/edy-shield/events`.
- Transport requirements: `application/json`, identity encoding, batches up to 100 events,
  `Idempotency-Key` exactly equal to the UUID v4 `batch_id`, 120 requests/minute.
- Contract: strict schema `1.0` for EDY Shield events with source product `edy-shield`,
  typed Shield event types, endpoint asset/evidence and per-item acknowledgement.
- Durability: inbox, duplicate detection and 409 on idempotency/content conflict.

### Compatibility decision

The endpoint is not a generic SIEM incident ingestion endpoint. A HelpDesk SecurityCase is
not an EDY Shield event and cannot truthfully satisfy `source.product=edy-shield`, Shield
event types or Shield evidence constraints. Transforming a HelpDesk case into that schema
would falsify provenance and weaken both products' controls.

Status in HelpDesk: **Incompatible**. The adapter remains disabled and performs no network
delivery.

### Required SIEM changes — approval required

The SIEM would need a separate, versioned endpoint such as a HelpDesk case/incident ingest
port with:

- its own scoped M2M credential;
- strict schema for minimized `security.case.*` events;
- idempotency and correlation IDs;
- durable inbox, retry-safe acknowledgements and safe errors;
- fields matching the approved HelpDesk SIEM contract without raw diagnostics, Event Log
  dumps, credentials, session data or internal notes.

No SIEM change was made.

## EDY SOC Analytics

### Observed implementation

- Stack: Power BI Project (PBIP/PBIR/TMDL), Python dataset/validation generators and
  Power Query.
- Version/state: v1.0.0 release baseline documented; current local hardening branch has
  pending Power BI Desktop validation steps.
- Integration style: file-based, offline validated JSON/CSV; no ingestion HTTP endpoint was
  found.
- Normative schema: `contracts/edy-siem-export.schema.json`, schemaVersion `1.0.0`.
- Producer required by that schema: `sourceProduct = EDY SIEM`.
- Record types: Event, Alert and Incident with typed IDs, security severity/status, asset,
  rule and optional MITRE/false-positive/safe-summary fields.
- Authentication: not applicable to the local file validator; Power BI Service publication
  and refresh credentials are outside the local project contract.
- Data state: synthetic portfolio dataset; live Service publication is not completed.

### Compatibility decision

The real Analytics schema is a SIEM security-event model and does not accept HelpDesk
Tickets, SLAs, Assets, Diagnostics, Knowledge or SecurityCases as their native datasets.
HelpDesk will therefore generate its own approved versioned analytics-export files, but it
will not claim that the current Power BI project consumed them.

Status in HelpDesk: **Export Ready** locally, **not Connected**.

### Required Analytics changes — approval required

To consume HelpDesk data, the Analytics project would need an approved adapter/staging
layer for the HelpDesk `EDY-SOC-ANALYTICS-CONTRACT.md`, new dimensional mappings and refresh
configuration. PBIX/PBIP, Power Query and the external pipeline were not changed.

## Integration risks and controls

| Risk | Control |
| --- | --- |
| Falsified producer provenance | Fail closed on contract/product mismatch |
| Coupling to another database or filesystem | Ports/adapters only; no foreign DB access |
| Secret or PII leakage | Allowlisted fields, redaction, pseudonymous asset references |
| Duplicate delivery | Event ID/idempotency key plus durable Outbox state |
| External outage | Timeout, bounded retry/backoff and dead-letter in HelpDesk |
| Demo data leaving the app | All real integrations permanently disabled in Portfolio Demo |
| Misleading UI | Never display Connected without a successful real communication |

## Discovery conclusion

No safe direct integration can be enabled against the discovered projects without changes
outside EDY HelpDesk. Phase 7 may implement disabled-by-default ports, validation, retry
state, local analytics export and truthful operational status, while all real delivery
remains off.
