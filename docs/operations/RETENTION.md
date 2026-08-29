# Data retention matrix

Retention is local operational policy, not a substitute for legal review. AuditEvent remains append-only and has no automatic purge.

| Data | Default | Enforcement | Notes |
|---|---:|---|---|
| Active sessions | idle 30 min; absolute 12 h | Authentication middleware | Revoked/expired rows eligible for administrative purge after 30 days |
| DiagnosticResult | 90 days | Worker bounded purge | Structured snapshot; backup excludes raw payload |
| WindowsEvent | 30 days | Worker bounded purge | System/Application only; sanitized text |
| Report exports | 7 days | API marks expired and denies download | Physical file cleanup remains controlled administration |
| Analytics integration exports | 7 days recommended | Manual local administration | Server-defined filenames; never external automatically |
| Operational logs | 30 days recommended | Host log rotation | Redacted structured logs; do not publish |
| Outbox Pending/Failed | until processed or dead-letter | Retry policy | Never purge active delivery state |
| Outbox Processed | 90 days recommended | Manual/archive policy | Preserve corresponding AuditEvent |
| Outbox DeadLetter | until reviewed | Manual decision | Sanitized error code only |
| AuditEvent | indefinite baseline | No automatic delete | Append-only triggers; future chained hash remains an architectural option |

Any physical purge must run in bounded batches, create an AuditEvent summary, preserve foreign keys and have a recent validated backup. Audit retention changes require an explicit architecture/security decision.
