# PostgreSQL baseline

This directory contains PostgreSQL-only deployment artifacts generated from the canonical Prisma domain model. It does not replace the approved SQLite migration runner.

`20260829000000_v1_rc_baseline/migration.sql` is generated with `npm run db:ddl:postgresql`. A live deployment is validated only when a local PostgreSQL test server is explicitly available.
