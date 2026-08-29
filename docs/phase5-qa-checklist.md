# Phase 5 — checklist factual de regressão e QA

Data de execução: 28/08/2026. Ambiente: Portfolio Demo, loopback.
Resultado: PASS. Evidência detalhada em PHASE-5-FINAL-REPORT.md.

## 1. Baseline e arquitetura

- [x] Hashes de ARCHITECTURE.md, ROADMAP.md, SECURITY.md e seis ADRs preservados.
- [x] Monólito modular, RBAC, AuditEvent append-only, Ticket locking e Outbox preservados.
- [x] Diagnostics Worker separado; allowlist, requiresElevation=false e Demo lock preservados.
- [x] Nenhum GitHub, push, publicação ou transporte EDY SIEM criado.

## 2. Banco

- [x] Upgrade Phase 4 → Phase 5 aplicado após backup recuperável.
- [x] 5/5 migrations; integrity_check ok; foreign_key_check sem violações.
- [x] Ticket 1 → 0..1 SecurityCase e SEC code únicos.
- [x] SecurityCase.version positivo e compare-and-increment.
- [x] AuditEvent e SecurityTimelineEntry protegidos contra UPDATE/DELETE por quatro triggers.
- [x] Demo sem DiagnosticResult Operational.
- [x] Cinco Cases e cinco TicketContext sintéticos após seed.

## 3. Domínio e API

- [x] Escalation somente por Ticket; reason, severity e summary strict.
- [x] SEC numbering, duplicate escalation, idempotency e rollback transacional cobertos.
- [x] Viewer 403 auditado; Technician/Admin autorizados conforme scope.
- [x] Severity restrita a Low/Medium/High/Critical.
- [x] Matriz de status válida; transições inválidas recusadas.
- [x] Contained não chama Worker, PowerShell ou controles do Windows.
- [x] Assignment/reassignment e analyst inativo testados.
- [x] Version stale retorna 409 sem overwrite.
- [x] ManualNote rejeita markup/campos desconhecidos e aplica redaction.
- [x] TicketContext é server-derived; cliente não pode criá-lo.
- [x] Diagnostic evidence usa resultado existente sem stdout bruto.
- [x] Event evidence aceita somente System/Application já persistido.
- [x] Resolution, reopen, false positive e close preservam histórico.
- [x] Search, filtros, sorting, paginação, dashboard, Ticket e Asset integrations testados.

## 4. Outbox e SIEM boundary

- [x] Quatro eventTypes e envelope schemaVersion 1.
- [x] source fixo edy-helpdesk e correlationId persistido.
- [x] Payload strict com nove chaves allowlisted.
- [x] Redaction verificada; sem credenciais, raw stdout/stderr ou Event Log completo.
- [x] Nove envelopes locais Pending ao fim da QA.
- [x] Nenhum DNS/socket/HTTP/fila de entrega externa iniciado.
- [x] EDY-SIEM-CONTRACT.md alinhado ao schema executável.

## 5. Regressão Phase 1–4

- [x] 183/183 testes no monorepo.
- [x] Login/session/CSRF/Origin/rate limiting preservados pelos testes.
- [x] Service Desk, Directory, RBAC, Audit, Assets, Knowledge e diagnostics preservados.
- [x] Smoke Phase 3: 12 rotas; 7 assets; 7 articles; 6 users; 7 tickets.
- [x] Smoke Phase 4: 24 reads; 2 expected denies; 9 synthetic results; realExecution=false.
- [x] Baseline real diagnostics 20/20 não reexecutado em Demo; nenhuma execução PowerShell.

## 6. Smoke local autenticado

- [x] API readiness e Web responderam em 127.0.0.1.
- [x] Worker iniciou separado com capabilities vazias em Portfolio Demo.
- [x] Phase 5 smoke: 8 reads, 5 Cases, Viewer deny, Outbox local.
- [x] Fluxo visual controlado de assignment, 409, reload, close, reopen e false positive.
- [x] Zero transporte de integração externa.

## 7. Visual QA — 56/56

Superfícies: Dashboard, Queue, Workspace, Evidence, Timeline, Ticket, Asset e Command
Palette. Viewports: 1920x1080, 1600x900, 1440x900, 1366x768, 1280x720, 1024x768 e
768x900.

- [x] 56/56 combinações sem overflow de página.
- [x] Queue 768 sem overflow interno após correção responsiva.
- [x] Loading, empty, error, success e conflict.
- [x] FalsePositive, Resolved e Closed.
- [x] Text badges além de cor; Synthetic Demo Data visível.
- [x] Sem threat map, live attack, hacker terminal ou score fictício.

## 8. Teclado e acessibilidade

- [x] Skip link, landmarks, headings e labels semânticos.
- [x] Ctrl/Cmd+K, busca, ArrowDown, Escape e focus trap.
- [x] Escape restaura foco ao invocador do Command Palette.
- [x] focus-visible de 2 px observado.
- [x] Roles alert/status e reduced-motion preservados.
- [x] Sem leitor de tela externo nesta execução; limitação registrada.

## 9. Console, rede e conteúdo

- [x] Console do EDY HelpDesk: zero erros.
- [x] 364 mensagens de extensão/bridge separadas como ruído não pertencente ao app.
- [x] Zero falha de rede inesperada; 403/404/409 foram cenários intencionais.
- [x] Nenhuma chamada para EDY SIEM, Sentinel, Power BI, threat intel, email, Teams ou Slack.
- [x] Evidências/timeline renderizadas como texto; markup rejeitado pelos contratos.

## 10. Gates finais

- [x] npm run lint — PASS.
- [x] npm run typecheck — PASS.
- [x] npm test — 183/183 PASS.
- [x] npm run build — PASS.
- [x] npm audit --audit-level=high — 0 vulnerabilities.
- [x] Secret scan — PASS.
- [x] Storage QA — PASS.
- [x] Smoke Web/API/Worker — PASS.
- [x] PHASE-5-FINAL-REPORT.md atualizado com resultados reais.

Ready for Phase 6: YES, sujeito à aprovação explícita do usuário.
