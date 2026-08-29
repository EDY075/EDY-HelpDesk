# Production Readiness Baseline

EDY HelpDesk v1.0 RC is a local-first portfolio release candidate. It is **not approved for direct public Internet exposure**.

Production prerequisites:

1. TLS termination and a hardened reverse proxy; API/Web remain on private interfaces.
2. PostgreSQL live validation, provider-specific append-only controls and tested migration/rollback.
3. Secret manager or OS-protected secret injection; no `.env` in artifacts.
4. Dedicated service identities and least-privilege filesystem/database permissions.
5. Scheduled encrypted backups plus restore rehearsals and retention ownership.
6. Central monitoring/alert routing appropriate to the host, without logging sensitive payloads.
7. Access review, MFA/SSO design if exposure expands, patch/update ownership and incident response.
8. Approved retention/legal basis and publication checklist.

Local Operational Mode permits only the registered localhost endpoint, allowlisted read-only diagnostics, no elevation and no arbitrary command. It does not add remediation, remote PowerShell, WinRM, SSH, RDP or directory writes.
