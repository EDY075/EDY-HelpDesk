# Local backup and restore

Status: tested SQLite administrative procedure for EDY HelpDesk v1.0 RC. There is no destructive Restore button in the UI.

## Backup scope

`npm run backup:create` creates a unique folder under `storage/backups/` containing:

- `database.db`: consistent SQLite backup copy;
- `manifest.json`: format version, application version, timestamp, SHA-256, critical counts and non-secret mode/session settings.

The copy—not the live database—is sanitized before its checksum is finalized:

- active sessions removed;
- worker lease and local endpoint registration removed;
- WindowsEvent rows removed;
- raw `DiagnosticResult.payload` replaced with empty JSON while structured findings/metadata remain;
- temporary export file references invalidated;
- logs, export files, screenshots and secrets are never copied.

AuditEvent and domain history remain intact. Source paths and `DATABASE_URL` are not written to the manifest.

## Create

1. Confirm `.env` points to the intended local SQLite database and no secret is printed.
2. Stop or quiesce mutating processes for the clearest recovery point; the SQLite backup API still creates a consistent snapshot.
3. Run `npm run backup:create`.
4. Record the relative backup directory and keep the manifest with the database.

## Restore validation

Restore always targets a **new, non-existing** file under `storage/`; it refuses overwrite and traversal:

```text
npm run restore:validate -- storage/backups/<backup-folder> storage/restore-validation/<new-name>.db
```

The command verifies manifest schema, SHA-256, SQLite `integrity_check`, `foreign_key_check`, critical record counts, zero sessions and zero WindowsEvent rows. Only after this validation and an approved maintenance window may an operator reconfigure `DATABASE_URL` to the restored file. Keep the previous live database in `storage/archive/`; do not overwrite it.

PostgreSQL backup/restore is NOT VALIDATED in this environment. Production PostgreSQL must use provider-native, encrypted backups, restricted credentials and scheduled restore rehearsals.
