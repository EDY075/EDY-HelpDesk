# EDY HelpDesk — Roadmap

**Versão:** 1.0  
**Atualizado:** 2026-08-29  
**Estado atual:** Fases 0–7 e Localization/Themes concluídas; auditoria final de release em andamento

## 1. Estratégia de entrega

O roadmap prioriza um fluxo vertical verificável:

```text
Ticket -> SLA -> Asset -> diagnóstico local read-only -> AuditEvent
```

Dashboard, relatórios e integrações serão adicionados somente quando existirem dados confiáveis para sustentá-los. Cada fase termina com critérios objetivos; uma tela sem persistência, autorização e teste não será considerada funcional.

## 2. Fase 0 — Architecture & Foundation Design

**Status:** concluída e incorporada à arquitetura v1.

### Entregas

- Arquitetura de monólito modular local-first.
- Modelo de domínio e relacionamentos.
- `DiagnosticAction` como catálogo allowlisted formal.
- Optimistic locking com `Ticket.version` e conflito `409` planejado.
- Arquivamento lógico por `archivedAt`.
- Ciclo de vida do ticket e modelo de SLA.
- Retenção para WindowsEvent, DiagnosticResult, exports e logs.
- AuditEvent append-only e preparação para hash encadeado futuro.
- Transactional Outbox e contratos de integração.
- Modelo de autenticação, RBAC e threat model.
- ADRs 001–006.

### Gate de saída

- Documentos consistentes e em UTF-8.
- Links dos ADRs válidos.
- Invariantes de diagnóstico repetidas em arquitetura e segurança.
- Baseline documental aprovado antes da implementação.
- Invariantes preservadas nas fases funcionais.

## 3. Fase 1 — Technical Foundation

**Status:** concluída.

### Escopo entregue

- Criar monorepo npm workspaces.
- Configurar React/TypeScript/Vite, sem desenvolver os módulos visuais completos.
- Configurar Node.js/Express/TypeScript.
- Configuração tipada e fail-closed de ambiente.
- Criar `.gitignore` e `.env.example` sem segredos.
- Logging estruturado, request ID e correlation ID.
- Zod, Problem Details, health/readiness e namespace `/api/v1`.
- Prisma/SQLite, migrations transacionais e seed sintético.
- Test runner, lint, formatting, typecheck e CI local.
- Seeds exclusivamente sintéticos para Portfolio Demo.

### Quality gates

- Build e typecheck sem erros.
- Lint e formatação aprovados.
- Testes unitários e smoke local aprovados.
- Nenhum bind fora de `127.0.0.1` por padrão.
- `.env`, banco, logs, exports e storage ignorados.
- Secret scan sem achados.
- Ausência de métricas hardcoded apresentadas como reais.
- Revisão do escopo antes de implementar módulos funcionais.

## 4. Fase 2 — Service Desk Core

**Status:** concluída.

### Escopo entregue

- Autenticação local e sessão server-side.
- RBAC Admin, Technician e Viewer.
- Departments, Users, Accounts e TicketCategories com `archivedAt`.
- Tickets, comentários, histórico, atribuição e transições.
- Optimistic locking em todas as mutações do agregado Ticket.
- SLA versionado, cálculo 24x7, pausas e violações.
- AuditEvent append-only cobrindo todas as ações sensíveis.

### Quality gates

- Matriz de autorização negativa por rota, ação e recurso.
- Viewer não executa mutações.
- Papel enviado por header/body não altera autorização.
- Dois técnicos editando a mesma versão geram um sucesso e um `409`, sem lost update.
- Transições inválidas são recusadas pelo domínio.
- `Resolved` exige solução; `Closed` permanece separado.
- Arquivados continuam visíveis no histórico e não recebem novas associações.
- Cálculos de SLA cobertos por testes de tempo, pausa, reabertura e timezone.

## 5. Fase 3 — Assets & Knowledge Base

**Status:** concluída.

### Escopo entregue

- Inventário de ativos e vínculo com usuários/departamentos.
- CPU, RAM e storage como dados de hardware do ativo.
- Artigos de conhecimento e tickets relacionados.
- Pesquisa, filtros e paginação.

### Quality gates

- Nenhum dado pessoal real nos seeds ou screenshots públicas.
- Asset arquivado preserva tickets e diagnósticos anteriores.
- Identificadores únicos não são reutilizados de forma ambígua.
- Artigos renderizados como conteúdo seguro, sem HTML arbitrário.
- Fluxos críticos testados com dados persistidos.

## 6. Fase 4 — Local Read-only Diagnostics

**Status:** concluída.

### Escopo entregue

- Diagnostics Worker como processo separado.
- Catálogo formal `DiagnosticAction`.
- Fila persistida de DiagnosticJob com claim atômico e recuperação.
- Scripts PowerShell read-only revisados e versionados.
- Windows, network, hardware e Event Logs System/Application.
- Validação de parâmetros e saída, redaction, timeout e limites.
- Retenção automatizada dos resultados.

### Quality gates bloqueantes

- Nenhuma rota, DTO ou código aceita comando, script ou `scriptPath` do cliente.
- `requiresElevation = false` validado pela API e pelo worker.
- Worker usa conta sem privilégio e diretório controlado.
- Hash divergente, action desabilitada ou schema inválido falham fechados.
- Timeout encerra a árvore de processos.
- Concorrência e tamanho de saída são limitados.
- Event Logs limitados a System/Application, janela e paginação.
- Falha de provider vira `partial`/`unavailable`, nunca dado inventado.
- Portfolio Demo mantém diagnósticos reais desabilitados.
- Testes adversariais cobrem injection, traversal, tampering, replay e DoS.

## 7. Fase 5 — Security Escalation

**Status:** concluída.

### Escopo entregue

- `Ticket 1 -> 0..1 SecurityCase` com unicidade no banco e domínio.
- Severidade, motivo, evidência estruturada e timeline.
- Escalonamento idempotente.
- Eventos de outbox para criação e atualização de casos.
- Nenhuma integração real com SIEM nesta fase inicial.

### Quality gates

- Segunda escalada não cria caso duplicado.
- Evidências passam por validação, minimização e redaction.
- Viewer não acessa evidência sensível.
- Ticket e SecurityCase preservam ciclos próprios.
- Mudança, auditoria e evento de outbox são atômicos.

## 8. Fase 6 — Dashboard & Reports

**Status:** concluída.

### Escopo entregue

- Cards e gráficos derivados de dados operacionais reais.
- Fórmulas, janela, timezone e denominadores documentados.
- Exportações CSV/JSON assíncronas e autorizadas.
- Expiração automática de arquivos.

### Quality gates

- Zero valores hardcoded tratados como métricas reais.
- Testes com datasets conhecidos validam agregações.
- CSV neutraliza células iniciadas por `=`, `+`, `-` ou `@`.
- Downloads respeitam papel, escopo e expiração.
- Arquivo exportado expira em 7 dias; metadados seguem retenção definida.
- Responsividade verificada em 1920x1080, 1366x768, 1440x900 e tablet.

## 9. Fase 7 — Integration Adapters

**Status:** concluída como baseline e contratos locais; destinos externos permanecem desabilitados.

### Escopo entregue

- Dispatcher do Transactional Outbox.
- Descoberta read-only e contratos versionados para EDY Sentinel, EDY SIEM e EDY SOC Analytics.
- Configuração fail-closed, destinos privados/loopback e segredos somente por ambiente.
- Retry com backoff, lease recuperável, idempotência e dead-letter.
- Métricas agregadas/pseudonimizadas para Analytics.

### Quality gates

- Nenhum sistema externo lê o banco operacional.
- Entrega at-least-once não produz efeitos duplicados.
- Retry mantém o mesmo `eventId`.
- Payloads contêm somente dados mínimos.
- Falha externa não bloqueia a transação do ticket.
- Testes de contrato, idempotência e replay aprovados; nenhum destino incompatível foi habilitado.

## 10. Fase 8 — PostgreSQL & Production Readiness

**Status:** baseline parcial concluído. SQLite, runbooks, backup/restore, E2E, performance e observabilidade foram validados; servidor PostgreSQL real, TLS, reverse proxy e secret manager continuam pendentes.

### Escopo restante antes de produção real

- Testar migrations e repositórios contra PostgreSQL.
- Ensaio de migração SQLite -> PostgreSQL.
- Reconciliação por contagens, integridade referencial e checksums lógicos.
- Validar backup/restore e migração no provider PostgreSQL.
- Validar acessibilidade com leitor de tela externo e operação sob proxy TLS.
- Revisão de deploy; nenhuma publicação automática.

### Quality gates

- Rollback ensaiado.
- Zero divergência inexplicada de registros.
- Suíte de integração passa nos dois bancos durante a transição.
- Métricas e SLA produzem o mesmo resultado lógico.
- Revisão de segurança sem issues Critical/High abertas.
- Aprovação explícita antes de qualquer exposição pública.

## 11. Riscos de roadmap

| Risco | Resposta |
|---|---|
| Escopo virar um SIEM/RMM incompleto | Manter o fluxo vertical e os non-goals |
| UI antecipar backend e parecer mock | Só considerar tela pronta com persistência e teste |
| Diagnósticos atrasarem o núcleo de suporte | Entregar Service Desk antes do worker |
| Métricas sem semântica | Definir fórmula antes do componente visual |
| SQLite virar dependência permanente | Gates de portabilidade desde a Fase 1 |
| Integração externa criar acoplamento | Outbox e contratos antes dos adaptadores |

## 12. Non-goals até autorização própria

Shell remoto, WinRM, remediação, elevação administrativa, AD/LDAP/Entra/SSO, multi-tenancy, anexos binários, coleta do Security log, e-mail/Teams, microserviços, Kafka, cloud, GitHub público, scanner de vulnerabilidade e qualquer função ofensiva.

## 13. Próximo gate

**Próximo gate:** decisão explícita de licença, revisão do relatório final e autorização separada antes de qualquer GitHub/publicação. Funcionalidades pós-v1 exigem novo escopo aprovado.
