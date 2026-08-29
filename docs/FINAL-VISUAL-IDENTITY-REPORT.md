# EDY HELPDESK — FINAL VISUAL IDENTITY REPORT

Date: 2026-08-28  
Release candidate: `1.0.0-rc.1`  
Scope: visual identity and authenticated UX QA only  
Environment: local Portfolio Demo with synthetic data

## Design Direction:

EDY HelpDesk now presents itself as an enterprise IT Operations and Service Desk workspace. The visual system is graphite-first, compact, information-led and intentionally restrained. Amber/copper identifies primary action and work context; operational data, queues and technical metadata are the protagonists.

The approved architecture, API, database, authentication, RBAC, SLA, tickets, assets, diagnostics, knowledge, security cases, reports, integrations and contracts were preserved.

## Visual Differentiation:

The dominant blue/cyan cyber-dashboard language was removed. The product is now differentiated by a narrow operations rail, dry graphite surfaces, continuous operational sections, dense data rows, technical workspaces and a restrained amber accent.

Explicit differentiation audit:

| Screen | Service Desk | IT Operations | SOC/Sentinel confusion | Generic dashboard confusion | Excess cards | Excess blue | Operational information leads |
|---|---:|---:|---:|---:|---:|---:|---:|
| Login | Yes | Yes | No | No | No | No | Yes |
| Overview | Yes | Yes | No | No | No | No | Yes |
| Operations Center | Yes | Yes | No | No | No | No | Yes |
| Ticket Queue / New Ticket | Yes | Yes | No | No | No | No | Yes |
| Ticket Workspace | Yes | Yes | No | No | No | No | Yes |
| Users / User Workspace | Yes | Yes | No | No | No | No | Yes |
| Assets / Endpoint 360 | Yes | Yes | No | No | No | No | Yes |
| Diagnostics / Event Logs / History | Yes | Yes | No | No | No | No | Yes |
| Knowledge Base / Article | Yes | Yes | No | No | No | No | Yes |
| Security Dashboard / Queue / Case | Yes | Yes | No | No | No | No | Yes |
| Reports / Report History | Yes | Yes | No | No | No | No | Yes |
| Integrations / Settings | Yes | Yes | No | No | No | No | Yes |
| Command Palette | Yes | Yes | No | No | No | No | Yes |

## Color System:

Central tokens in `apps/web/src/styles.css` now define:

- Background `#151411`; graphite surface levels `#1d1c19`, `#24221e`, `#2c2923`.
- Primary accent `#d4924b`; hover accent `#e3a45f`.
- Blue `#78a0c6` is limited to links and information.
- Green is restricted to healthy, success and resolved states.
- Amber marks attention, waiting and SLA work.
- Red is restricted to critical, security, breach and destructive meaning.
- Focus uses `#f0b665`.

No component-level color literals were introduced. Contrast spot checks: primary text/background `15.93:1`; secondary text/background `8.67:1`; accent/surface `6.50:1`; dark text/accent `7.03:1`; focus/background `10.16:1`.

## Typography:

Firm page titles, compact uppercase operational labels, monospaced ticket/asset/security identifiers and readable SLA values establish a technical service-management hierarchy without a gamer or cyber aesthetic.

## Navigation:

The sidebar is now a compact IT operations rail with grouped Operations, Knowledge, Security, Management and Configuration sections. Active routes use a narrow amber indicator and restrained surface change. The quick action is `New ticket`, keeping support work primary.

## Top Bar:

The top bar is contextual by route and exposes the active workspace, command palette, demo environment and session identity without competing with page content. Mobile reduces it to the essential menu, search/palette and account controls.

## Ticket Queue:

Ticket Queue is a dense operational table with recognizable ticket codes, compact filters, strong subject hierarchy and readable priority, status, assignee and SLA data. Rows remain rows rather than oversized cards.

## Ticket Workspace:

The workspace separates ticket identity and SLA at the top, activity and support content in the main area, and action/context panels for technician decisions. Assignment, next state, requester, department, asset, category, security and diagnostic context remain visible without turning the page into a dashboard.

## Asset Workspace:

Assets use technical inventory rows. Endpoint 360 reads as an endpoint profile sheet with identity, system, network, ownership, diagnostics, security context and support history. Asset codes and hostnames are treated as operational metadata.

## Diagnostics:

Diagnostics is framed as local IT troubleshooting. System, network, services, updates and Event Log data use the same HelpDesk language. The UI explicitly preserves allowlisted actions, no arbitrary commands, no elevation and Portfolio Demo synthetic execution only.

Running, success, failure, timeout, stale/fresh and diagnostic history representations were reviewed through seeded demo states and regression flows.

## Knowledge Base:

Knowledge Base is an internal IT knowledge center with strong search, KB codes, compact runbook rows, categories, dates and discreet tags. Articles prioritize Problem, Symptoms, Diagnostic Steps, Resolution and Validation, with contextual metadata kept secondary.

## Security:

Security remains a governed module inside HelpDesk. It uses the same graphite/amber foundation; red appears only for real severity. Security Queue and Case Workspace retain ticket and endpoint context and an investigative workflow without adopting a separate SIEM/SOC identity.

## Operations Center:

Operations Center is the strongest control surface: attention metrics, compact work queues, recent operations, service health and integration state. It uses continuous panels and operational strips instead of a mural of metric cards.

## Overview:

Overview is intentionally calmer than Operations Center. It provides an executive service-desk pulse, a compact priority-work view and limited high-value indicators using persisted demo data.

## Reports:

Reports is an operational export workspace with report creation, date range, format, security boundary, status, history, row count, size, expiration and download controls. It does not imitate a BI dashboard.

## Integrations:

Integrations is a continuous system-interfaces view. Each connector exposes purpose, status, contract and configuration state without glow-heavy standalone cards.

## Settings:

Settings is an enterprise configuration sheet showing only effective, API-reported values. Decorative or inactive fake switches were not added.

## Login:

Login is a minimal premium enterprise entry point with EDY HelpDesk / IT Operations identity, a dry graphite split layout, a restrained amber detail and an accessible form. It has no neon logo, hacker background or holographic grid. Chrome QA used the isolated local `localhost` origin so the authenticated `127.0.0.1` session remained intact.

## Responsive QA:

- Automated matrix: `22 surfaces × 7 viewports = 154/154 PASS`.
- Viewports: `1920×1080`, `1600×900`, `1440×900`, `1366×768`, `1280×720`, `1024×768`, `768×900`.
- Additional real-Chrome spot check: critical workspaces at `768×900` and `360×800`.
- Final narrow-screen recheck: 18/18 critical route/viewport checks without document-level horizontal overflow.
- Mobile sidebar, data-table adaptation, workspaces and Login remain usable.

## Accessibility:

Keyboard flows, command-palette navigation, route focus, semantic headings, labelled controls, skip navigation, ARIA, visible focus, contrast and reduced-motion support were preserved. All tested routes had a page heading and no application boundary. Command Palette keyboard behavior passed E2E.

## Visual QA:

Chrome authenticated QA covered Login, Overview, Operations Center, Tickets, New Ticket, Ticket Workspace, Users, User Workspace, Assets, Endpoint 360, Diagnostics, Event Logs, Diagnostic History, Knowledge Base, Knowledge Article, Security Dashboard, Security Queue, Security Case, Reports, Report History, Integrations, Settings and Command Palette.

Layout, hierarchy, spacing, typography, alignment, color meaning, tables, buttons, forms, focus, keyboard behavior, empty/loading/success/failure/timeout/stale states and responsive behavior were reviewed. Login was inspected without credential entry or session revocation.

## Console Errors:

Application errors: `0`.

Chrome recorded 296 repeated events attributable to the installed Cuponomia browser extension (`chrome-extension://gidejehfgombmkfflghejpncblgfkagj`) and its closed message channel. They are external browser-extension noise, not emitted by EDY HelpDesk.

## Network Errors:

Unexpected application network errors: `0`.

The final authenticated route pass captured 63 API requests with no unexpected `4xx` or `5xx`. The E2E suite independently asserts no unexpected browser console, request or server failures.

One isolated `401` from `GET /api/v1/auth/me` was expected while deliberately opening the unauthenticated Login origin; it correctly rendered the Login page and did not affect the authenticated session.

## Tests:

`248/248 PASS`

- API: 175
- Diagnostics Worker: 14
- Config: 10
- Contracts: 37
- Domain: 10
- Test Utils: 2

## E2E:

`17/17 PASS` in 1.3 minutes, including authentication/logout, Viewer and Technician RBAC, asset creation, Ticket Workspace lifecycle, governed security escalation, reports/export, Command Palette keyboard navigation, refresh stability, stale session handling and the responsive route matrix.

## Lint:

`PASS`

## Typecheck:

`PASS`

## Build:

`PASS`

Web production output: CSS `94.63 kB` (`18.11 kB` gzip); main JS `362.14 kB` (`108.58 kB` gzip). Routes remain code-split.

## Dependency Audit:

`0 vulnerabilities`

## Secret Scan:

`PASS`

## Issues Found:

10 visual/QA issues were found:

1. Blue/cyan was too dominant.
2. Sidebar hierarchy resembled other EDY security products.
3. Too many independent card treatments weakened operational density.
4. Large radii and soft shadows felt like a generic SaaS template.
5. Security surfaces visually competed with the HelpDesk product identity.
6. Top-bar context was too generic.
7. Asset and diagnostics screens read too much like dashboards.
8. Login used a more cyber-oriented presentation than the requested enterprise service-desk identity.
9. Legacy stylesheet order temporarily overrode the new token layer during implementation.
10. Real Chrome at 360 px exposed a 1–5 px workspace-grid overflow missed by the existing responsive matrix.

## Issues Fixed:

`10/10`

The visual system, shell, high-priority workspaces and Login were corrected. The stylesheet cascade was repaired and the prior stylesheet was preserved at `archive/final-visual-identity-baseline/styles.before-identity.css`. The final responsive grid now collapses before its 320 px context rail can force document overflow. No approved functionality was removed.

## Screens Recommended:

All captures contain only synthetic Portfolio Demo data.

1. Login — `http://localhost:5173/login` — [`01-login.png`](screenshots/final-visual-identity/01-login.png)
2. Operations Center — `http://127.0.0.1:5173/operations` — [`02-operations-center.png`](screenshots/final-visual-identity/02-operations-center.png)
3. Ticket Queue — `http://127.0.0.1:5173/tickets` — [`03-ticket-queue.png`](screenshots/final-visual-identity/03-ticket-queue.png)
4. Ticket Workspace — `http://127.0.0.1:5173/tickets/34ca0633-1540-41ea-ba43-0430d79414ea` — [`04-ticket-workspace.png`](screenshots/final-visual-identity/04-ticket-workspace.png)
5. Endpoint 360 — `http://127.0.0.1:5173/assets/2acceba1-0f9f-4330-be52-cd9095d34be0` — [`05-endpoint-360.png`](screenshots/final-visual-identity/05-endpoint-360.png)
6. Diagnostics — `http://127.0.0.1:5173/assets/2acceba1-0f9f-4330-be52-cd9095d34be0/diagnostics` — [`06-diagnostics.png`](screenshots/final-visual-identity/06-diagnostics.png)
7. Knowledge Base — `http://127.0.0.1:5173/knowledge` — [`07-knowledge-base.png`](screenshots/final-visual-identity/07-knowledge-base.png)
8. Security Case — `http://127.0.0.1:5173/security/cases/50000000-0000-4000-8000-000000000005` — [`08-security-case.png`](screenshots/final-visual-identity/08-security-case.png)

No screenshots were published.

## FINAL QUESTION:

Can EDY HelpDesk be visually confused with  
EDY Sentinel / EDY SIEM?

**NO**

Ready for final release review: **YES**

No push, publication, GitHub release or change to another EDY project was performed.
