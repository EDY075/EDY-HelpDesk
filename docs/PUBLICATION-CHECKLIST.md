# EDY HelpDesk publication checklist

Run this checklist against a fresh Portfolio Demo copy. A checked item is evidence, not assumption.

- [ ] `.env`, `.env.*` and secret-manager output excluded; only approved examples remain.
- [ ] Database files, WAL/SHM/journals and restored backups excluded.
- [ ] Logs and diagnostic/event artifacts excluded (`.log`, EVTX, ETL, dumps, stdout captures).
- [ ] Report and analytics exports excluded.
- [ ] Screenshots use Portfolio Demo only and contain no hostname, IP, MAC, Windows user, DNS suffix or local path.
- [ ] Cookies, session IDs, CSRF values, Authorization headers, API keys, tokens, JWT-like strings and webhooks absent.
- [ ] Integration URLs/private endpoints and credentials absent.
- [ ] Real e-mail, personal names and local account names absent; synthetic `.invalid` examples only.
- [ ] Windows profile paths (`C:\\Users\\...`) and private host filesystem paths absent.
- [ ] Test results, Playwright traces/videos, coverage and debug artifacts excluded.
- [ ] `storage/`, `archive/`, performance databases and local backups excluded.
- [ ] Dependency audit and expanded secret scan pass on the publication set.
- [ ] README limitations, security reporting route and production prerequisites are accurate.
- [ ] LICENSE decision approved; do not add an arbitrary license.
- [ ] No GitHub remote, release, push or public deployment occurs before final human review.

Recommended screenshot surfaces: Overview, Operations Center, Ticket Workspace, Endpoint 360, Security Case, Reports, Integrations and Command Palette. Capture only after the `DEMO DATA`/Portfolio Demo indicator is visible.
