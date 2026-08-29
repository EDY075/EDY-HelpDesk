# Phase 4 — execution design and preflight

28/08/2026. Baseline re-executed: 79/79 tests pass. The approved architecture,
security document, roadmap, six ADRs and Phase 3 final report remain unchanged.

## Decisions before implementation

- Separate persisted database deployment modes: a Demo database cannot be opened
  as Operational or receive real results. Operational storage is local and ignored.
- The HTTP API never imports the process runner. It queues server-owned action IDs,
  validated bounded parameters and immutable catalog snapshots.
- One registered local endpoint, bound to this host's fingerprint. Inventory hostname,
  IP and MAC are never execution targets. Registration is Admin-only and versioned.
- All nine actions use a reviewed read-only collector with a closed action switch;
  each catalog entry pins its version, internal file and SHA-256. No client path/argv.
- A small Windows process host uses an atomic Job Object assignment at process creation,
  kill-on-close, a parent-process lifetime handle and a hard deadline. No process starts
  outside containment. It rejects elevated tokens and locks the verified script against
  writes/deletion until the child exits. It never invokes UAC or kills unrelated processes.
- Global worker concurrency 1; per-asset active job 1; bounded queue and per-account rate
  limits enforced transactionally. Idempotency keys prevent duplicate requests.
- Worker rechecks mode, role, endpoint, catalog enabled/version/hash/schema, cancellation
  and audit persistence before execution. Invalid output never becomes a successful result.
- Event records expire after 30 days, other detailed results after 90 days; minimal job
  metadata after 365 days. Purges are bounded and audited; AuditEvent is never purged.
- Real raw output is memory-only and bounded. Event text is redacted before persistence;
  Viewer receives only sanitized summaries, not raw local inventory or event messages.
- Portfolio Demo has separately marked persisted synthetic examples and refuses enqueue.

## Threats addressed

Command injection/path traversal, script tampering/TOCTOU, elevated execution, orphaned
descendants, duplicate jobs, cancelled-job races, stale authorization, output/queue DoS,
event-log XSS, local data leakage into demo, and stale results shown as current.
Local administrators can still change binaries, source and databases; this is not a
sandbox against a compromised Windows administrator. Dedicated-account/ACL deployment
hardening remains explicit rather than silently changing the user's Windows permissions.

## Primary references

Atomic process assignment avoids the suspended-process orphan window described by
[Microsoft's process-creation guidance](https://devblogs.microsoft.com/oldnewthing/20230209-00/?p=107812).
Tree lifetime follows [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
and [process attribute lists](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
Event collection uses bounded FilterHashtable/MaxEvents from
[Get-WinEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent?view=powershell-7.5),
without free XPath, remote computers or Security log access.

No subagent creation tool is available in this session. Reviews are performed directly
and will not be described as independent squad approvals.
