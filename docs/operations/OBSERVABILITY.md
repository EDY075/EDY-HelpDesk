# Local observability baseline

The RC intentionally avoids Prometheus, Grafana server and ELK.

- `/api/v1/health`: process liveness, version and uptime.
- `/api/v1/ready`: configuration and real database query; returns 503 when the database is unavailable.
- Operations Center: persisted workload plus API, database and Diagnostics Worker heartbeat.
- Integrations/Operations: real Outbox counts and truthful Sentinel/SIEM/Analytics states.
- Structured Pino logs: request/correlation IDs, method, route, status and duration; request bodies, credentials, cookies and authorization are not logged.
- Worker logs: lifecycle, heartbeat and safe error codes only.

`Connected` is never inferred from configuration. The RC does not instantiate a remote adapter because discovery found no compatible authorized endpoint. A future adapter must report its last successful validated response separately from local readiness.
