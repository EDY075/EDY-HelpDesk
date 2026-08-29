# Phase 2 Design Research — Service Desk Core

**Status:** applied design direction  
**Date:** 2026-08-28  
**Scope:** conceptual UX patterns only; no copied branding, layouts, text, assets or proprietary components

## Research inputs

- [ServiceNow Service Operations Workspace](https://www.servicenow.com/docs/r/it-service-management/service-operations-workspace/service-operations-workspace-ui.html): agents need a centralized path from landing view and lists into a context-rich record workspace.
- [Jira Service Management queues](https://support.atlassian.com/jira-service-management-cloud/docs/check-out-your-queues/): the queue is the primary triage surface and should expose summary, status, requester and SLA urgency at a glance.
- [Freshservice ticketing](https://www.freshworks.com/freshservice/ticketing/): a unified ticket view reduces context switching, while SLA policy and assignment remain visible operational controls.
- [Linear search and command interactions](https://linear.app/docs/search): keyboard-first search, recent items and scoped filtering reduce navigation cost for frequent operators.
- [Linear selection and command menu](https://linear.app/docs/select-issues): a command surface should be contextual, discoverable and usable without the mouse.
- [Grafana dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/): an operational overview must answer a question, reduce cognitive load and use color semantically instead of decorating every metric.

## Product principles adopted

1. **Queue before dashboard decoration.** Tickets are scanned, filtered, sorted and opened from a dense but readable operational surface.
2. **One workspace, complete context.** Ticket details, conversation, history, assignment, requester, asset and SLA are presented together without hiding the active task.
3. **Urgency is explainable.** Priority and SLA state use independent labels; color is an assistive signal, never the only carrier of meaning.
4. **Keyboard paths are first-class.** `Ctrl/Cmd + K`, focus visibility, predictable tab order and Escape behavior support repeated technician workflows.
5. **URL is view state.** Queue filters, sorting and pagination can be shared or restored without inventing a separate saved-view subsystem.
6. **Real data or an honest empty state.** Overview values come from the API and SQLite. Unavailable data is labeled, not estimated or hardcoded.
7. **Motion confirms change.** Short transitions support overlays, toasts, loading and state changes; reduced-motion preferences disable nonessential animation.
8. **Progressive density.** Desktop prioritizes efficient scanning; narrower widths collapse secondary context before impairing the primary workflow.

## EDY visual direction

- Deep blue-gray base with layered surfaces and restrained borders.
- Blue for selection, focus and information; green for healthy/resolved; amber for waiting or at-risk; red for critical or breached.
- Ticket codes and countdowns use tabular/monospaced numerals where useful.
- Identity is `EDY HelpDesk — IT Operations / Service Desk`, without visual imitation of the researched products.

## Explicit exclusions

- No copied navigation tree, proprietary iconography, component geometry, copywriting or screenshots.
- No fake analytics, decorative cyber-security theater or integrations represented as active.
- No diagnostic execution, PowerShell, Event Viewer, directory services or external messaging in Phase 2.
