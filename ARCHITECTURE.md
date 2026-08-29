# EDY HelpDesk — Arquitetura v1

**Status:** arquitetura implementada; candidata ao gate final de release  
**Versão do documento:** 1.0  
**Atualizado:** 2026-08-29  
**Próximo gate:** decisão de licença e revisão humana antes de publicação

## 1. Objetivo e escopo

O EDY HelpDesk é uma plataforma local-first de IT Help Desk / Service Desk para demonstrar engenharia de suporte de TI, administração de endpoints e diagnóstico Windows. O projeto é um portfólio/laboratório de engenharia; não representa experiência profissional atribuída ao autor. A fronteira de Security Escalation prepara fluxos de Blue Team sem transformar o produto em SIEM, RMM ou ferramenta ofensiva.

A v1 contém Web, API versionada, banco SQLite, Diagnostics Worker separado, scripts PowerShell read-only allowlisted, dashboards, relatórios e contratos de integração. Não existe publicação, deploy público nem conexão externa ativa. PostgreSQL possui projeção/DDL estáticos, mas o runtime contra servidor PostgreSQL real continua não validado.

## 2. Princípios

1. Funcionalidades demonstráveis usam dados persistidos reais; não há números estáticos no dashboard operacional.
2. O sistema é um monólito modular antes de qualquer extração para serviços.
3. O Diagnostics Worker é separado da API.
4. PowerShell só pode ser iniciado por ações cadastradas em catálogo autorizado (allowlisted).
5. Nenhum cliente fornece comando, script ou `scriptPath`.
6. Toda ação de diagnóstico da v1 possui `requiresElevation = false`.
7. Web, API e worker operam em localhost por padrão.
8. Dados públicos e do modo Portfolio Demo são exclusivamente sintéticos.
9. Mutações relevantes geram auditoria append-only.
10. Integrações usam contratos versionados e Transactional Outbox.

## 3. Arquitetura lógica

```text
Browser não confiável
        |
        | HTTP em localhost; HTTPS quando houver exposição autorizada
        v
React/Vite Web
        |
        | REST /api/v1
        v
Express API
  |-- autenticação, autorização, validação e rate limits
  |-- módulos de aplicação e domínio
  |-- AuditEvent append-only
  |-- IntegrationOutbox
  |-- fila persistente de DiagnosticJob
        |
        v
Diagnostics Worker separado e sem privilégio administrativo
        |
        | resolve actionId internamente
        v
DiagnosticAction allowlisted -> script PowerShell interno read-only
        |
        v
DiagnosticResult validado e sanitizado

Express API -> Prisma -> SQLite (v1)
Express API -> projeção PostgreSQL (estática; runtime ao vivo não validado)
IntegrationOutbox -> adapters opcionais/desabilitados -> Sentinel / SIEM
Express API -> export local minimizado/desabilitado no Demo -> SOC Analytics
```

### 3.1 Fronteiras dos processos

- **Web:** apresentação e interação. Não acessa Prisma, filesystem ou PowerShell.
- **API:** fronteira de confiança para identidade, autorização, validação e regras de domínio.
- **Diagnostics Worker:** consome jobs persistidos, resolve `DiagnosticAction` e executa um processo controlado.
- **Persistência:** repositórios e Unit of Work escondem detalhes do Prisma.
- **Integrações:** o outbox persiste envelopes mínimos para adapters compatíveis; o export analítico local usa contrato próprio. Sistemas externos nunca leem o banco operacional.

## 4. Contextos e módulos

| Módulo | Responsabilidade | Entidades centrais |
|---|---|---|
| Auth | Sessão, credenciais e autorização | Account, Role/Permission |
| Users | Solicitantes e estrutura organizacional | User, Department |
| Assets | Inventário e vínculo com usuários | Asset |
| Tickets | Ciclo completo do chamado | Ticket, TicketComment, TicketHistory |
| SLA | Políticas e relógio de atendimento | SlaPolicy, TicketSla |
| Diagnostics | Catálogo, fila, execução e resultados | DiagnosticAction, DiagnosticJob, DiagnosticResult |
| Event Logs | Consulta controlada a System/Application | WindowsEvent |
| Knowledge Base | Artigos e relacionamentos | KnowledgeArticle, KnowledgeArticleTicket |
| Security | Escalonamento de potenciais incidentes | SecurityCase, SecurityEvidence, SecurityTimelineEntry |
| Audit | Registro append-only de ações | AuditEvent |
| Reports | Exportações autorizadas | ExportJob |
| Integrations | Eventos e adaptadores externos | IntegrationOutbox |
| Dashboard | Projeções e métricas reais | consultas derivadas dos módulos |

Os módulos compartilham a Unit of Work Prisma do monólito, mas mantêm DTOs, rotas, regras de domínio e contratos explícitos. Extrações futuras devem preservar essas fronteiras e nunca expor tabelas diretamente a sistemas externos.

## 5. Modelo de domínio

### 5.1 Entidades

- `Department`: organização dos usuários e ativos.
- `User`: pessoa solicitante, sem identidade autenticável obrigatória.
- `Account`: identidade autenticável, papel e vínculo opcional com usuário.
- `Asset`: endpoint ou equipamento inventariado.
- `TicketCategory`: classificação configurável do chamado.
- `Ticket`, `TicketComment`, `TicketHistory`: agregado operacional do chamado.
- `SlaPolicy`, `TicketSla`: política versionada e estado materializado do SLA.
- `DiagnosticAction`, `DiagnosticJob`, `DiagnosticResult`: catálogo, execução e resultado.
- `WindowsEvent`: evento Windows coletado de forma controlada.
- `KnowledgeArticle`, `KnowledgeArticleTicket`: conhecimento e relacionamento com tickets.
- `SecurityCase`, `SecurityEvidence`, `SecurityTimelineEntry`: caso de segurança e sua trilha.
- `AuditEvent`: auditoria append-only.
- `IntegrationOutbox`: entrega assíncrona futura.
- `ExportJob`: geração e expiração de CSV/JSON.
- `SequenceCounter`: geração transacional de códigos humanos.

IDs internos são UUID. Códigos humanos, como `HD-2026-000001` e `SEC-2026-000001`, são separados e imutáveis. Datas são persistidas em UTC e formatadas conforme o locale ativo; cálculos operacionais preservam o timezone documentado.

### 5.2 Arquivamento lógico

`User`, `Department`, `TicketCategory`, `Account` e `Asset` não serão fisicamente apagados quando possuírem histórico ou referências.

Estratégia da v1: `archivedAt` nullable como fonte única de verdade.

- `archivedAt = null`: registro operacionalmente ativo.
- `archivedAt != null`: registro arquivado.
- Registros arquivados não aparecem por padrão em novos seletores, não autenticam e não recebem novas associações.
- Histórico e referências existentes permanecem legíveis.
- Arquivar e reativar exigem permissão administrativa e geram auditoria.
- Identificadores únicos não são reutilizados; deve-se reativar o registro anterior quando apropriado.
- Não haverá endpoint genérico de exclusão física na v1.

### 5.3 Ticket e optimistic locking

Campos principais:

- `id` UUID e `ticketNumber` humano imutável.
- `title`, `description`, `requesterId`, `categoryId`, `priority`, `status`.
- `assigneeAccountId?`, `assetId?`, `slaPolicyId`, `ticketSlaId`.
- `solution?`, `resolvedAt?`, `closedAt?`.
- `version` inteiro positivo, iniciado em `1`.
- `createdAt`, `updatedAt`.

Toda mutação concorrente exige `version`. A persistência faz operação atômica equivalente a `WHERE id = :id AND version = :expectedVersion`, incrementando `version` na mesma alteração. Se nenhuma linha for alterada, a API responde `409 Conflict`; o estado atual não é sobrescrito. Status, prioridade, atribuição, categoria, ativo e solução obedecem ao lock. O histórico registra versão anterior e nova.

### 5.4 Ciclo de vida do ticket

```text
New -> Assigned -> In Progress -> Waiting User -> In Progress
                         |       -> Waiting Third Party -> In Progress
                         v
                      Resolved -> Closed
                         |
                         +------> In Progress (reabertura autorizada)
```

Regras:

- `Assigned` e `In Progress` exigem técnico responsável não arquivado.
- `Waiting User` e `Waiting Third Party` exigem justificativa.
- `Resolved` exige solução, técnico e `resolvedAt`.
- `Closed` exige ticket previamente resolvido e define `closedAt`.
- Reabrir exige permissão e motivo, preserva solução e estados anteriores no histórico e retorna a `In Progress`.
- Toda transição gera `TicketHistory` e `AuditEvent`.
- Transição não será feita por patch irrestrito do campo `status`.

### 5.5 Relação com segurança

Na v1 a cardinalidade é explícita:

```text
Ticket 1 -> 0..1 SecurityCase
```

Um `SecurityCase` pertence exatamente a um ticket e `ticketId` é único. Repetir a escalada é idempotente e não cria um segundo caso. Ticket e caso possuem ciclos próprios; não haverá sincronização automática irrestrita de status. Evidências serão registros estruturados e sanitizados; anexos binários ficam fora da v1.

### 5.6 SLA

`SlaPolicy` é versionada e não altera retroativamente tickets existentes. `TicketSla` materializa a versão aplicada, prazos, primeira resposta, resolução, pausas acumuladas e violações.

Regras da v1:

- Calendário contínuo 24x7, cálculo em UTC.
- Relógios iniciam na criação do ticket.
- Primeira resposta cumprida não reinicia.
- `Waiting User` pausa o relógio de resolução.
- `Waiting Third Party` é configurável; o padrão inicial não pausa.
- `Resolved` para o relógio de resolução; `Closed` não altera o resultado.
- Reabertura retoma o relógio preservando tempo consumido e violações já ocorridas.
- “SLA At Risk” significa prazo restante menor ou igual ao limiar configurado e ainda não violado.
- “SLA Compliance” = tickets encerrados dentro do prazo / tickets encerrados elegíveis na janela.
- “Average Resolution Time” = `resolvedAt - createdAt - pausas aplicáveis`.

### 5.7 DiagnosticAction

`DiagnosticAction` formaliza o catálogo allowlisted e controlado pelo servidor.

| Campo | Regra |
|---|---|
| `actionId` | identificador público estável, por exemplo `network.gateway.validate` |
| `name` | nome legível |
| `category` | windows, network, hardware ou eventlog |
| `version` | versão imutável da ação |
| `scriptPath` | caminho interno, resolvido exclusivamente no worker |
| `scriptHash` | SHA-256 esperado do arquivo aprovado |
| `requiredPermission` | permissão necessária para enfileirar a ação |
| `parameterSchema` | schema JSON fechado e versionado |
| `outputSchema` | schema JSON fechado e versionado |
| `timeoutMs` | tempo máximo de execução |
| `maxOutputBytes` | limite combinado de saída persistível |
| `requiresElevation` | obrigatoriamente `false` na v1 |
| `enabled` | desabilita novos jobs sem apagar histórico |

A unicidade será `actionId + version`; versões publicadas são imutáveis. O cliente informa somente `actionId`, `assetId` e parâmetros previstos pelo schema. `scriptPath`, hash, timeout, limite de saída e permissões nunca são aceitos do cliente. `DiagnosticJob` conserva snapshot de actionId, versão e hash. Ação ausente, desabilitada, adulterada, elevada ou incompatível falha fechada.

### 5.8 Diagnósticos

`DiagnosticJob` registra solicitação, ator, ativo, action/version, parâmetros sanitizados, estado e timestamps. Estados: `queued`, `running`, `succeeded`, `partial`, `failed`, `timed_out`, `cancelled`.

`DiagnosticResult` registra resumo validado, referência ao job, contagens, duração, exit code, bytes, redaction aplicada e timestamps. Ausência de permissão ou provider é `unavailable`/`partial`, nunca valor saudável inventado.

### 5.9 Auditoria

`AuditEvent` é append-only e não terá operações de update/delete. Registra ator, papel, ação, recurso, resultado, motivo, timestamp UTC, request/correlation ID e diff sanitizado. Login, falha, acesso negado, conflito de versão, mutações, diagnóstico, export e escalada são eventos obrigatórios.

A arquitetura permite futuramente uma cadeia com `previousHash` e `eventHash`, serialização canônica e âncoras. Essa integridade adicional não será implementada agora e a v1 não será descrita como tamper-proof.

## 6. Persistência

### 6.1 SQLite inicial

- Uso local e de portfólio.
- Foreign keys habilitadas.
- Transações curtas.
- WAL e `busy_timeout` avaliados na implementação.
- Índices para status/prioridade/datas de ticket, SLA, ativos, auditoria, jobs e outbox.

### 6.2 Preparação para PostgreSQL

- Repositórios escondem queries específicas.
- UUID, UTC e tipos portáveis.
- Schemas JSON são validados na aplicação; poderão migrar de texto para `jsonb`.
- Sem dependência do domínio em enums, collations ou funções exclusivas do SQLite.
- Migrations Prisma versionadas; `db push` não é estratégia de produção.
- A migração terá ensaio, contagens, integridade referencial, checksums lógicos e rollback.

## 7. Contrato da API v1

- Namespace obrigatório `/api/v1`.
- Schemas Zod estritos e OpenAPI em `docs/api/openapi-v1.yaml`.
- Paginação, filtros e ordenação por allowlist.
- Problem Details sanitizado para erros.
- `requestId`, `correlationId` e idempotency key em diagnósticos, escaladas e exports.
- Comandos específicos para atribuição, transição, escalada e diagnóstico.
- Nenhuma rota `/exec`, terminal, shell ou atualização irrestrita de status.

A superfície executável está sob `/api/v1`; os contratos detalhados vivem em `docs/api/`. Não existe rota de shell, terminal ou execução arbitrária.

## 8. Métricas reais do dashboard

- Open Tickets: tickets ainda não encerrados.
- Tickets Waiting: `Waiting User` ou `Waiting Third Party`.
- Resolved Today: `resolvedAt` dentro do dia exibido no timezone selecionado.
- SLA At Risk: SLA em execução dentro do limiar e ainda não violado.
- Critical Tickets: prioridade Critical e estado aberto.
- Security Escalations: tickets com `SecurityCase` na janela.
- Average Resolution Time e SLA Compliance seguem as fórmulas da seção de SLA.

Cada métrica documentará janela, filtros, timezone, denominador e estado vazio. Portfolio Demo usará somente seeds sintéticos persistidos; diagnóstico e integrações reais estarão desabilitados.

## 9. Retenção e ciclo de dados

Defaults da v1, configuráveis por ambiente e auditáveis:

| Dado | Retenção padrão | Tratamento |
|---|---:|---|
| `WindowsEvent` | 30 dias | coleta limitada; mensagem sanitizada; purga em lotes |
| `DiagnosticResult` detalhado | 90 dias | metadados mínimos do job podem permanecer por 365 dias |
| Arquivo exportado CSV/JSON | 7 dias | arquivo removido; metadados de `ExportJob` permanecem por 90 dias |
| Logs operacionais | 30 dias | rotação por tamanho/tempo; sem segredos ou payload completo |
| `AuditEvent` | mínimo 365 dias | sem purge pela aplicação v1; arquivamento governado futuro |

WindowsEvent e DiagnosticResult possuem purge em lotes no Worker; exports expiram e ficam indisponíveis após sete dias. Logs são enviados de forma estruturada a stdout/stderr e sua rotação/retenção é responsabilidade do host, conforme o runbook. AuditEvent não é purgado pela aplicação. Legal hold permanece evolução futura.

## 10. Integrações opcionais

O envelope versionado contém `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `source`, `correlationId`, `idempotencyKey` e payload mínimo.

- **EDY Sentinel:** indisponível na descoberta atual; nenhum adapter ativo.
- **EDY SIEM:** contrato descoberto é incompatível; o adapter permanece desabilitado e fail-closed.
- **EDY SOC Analytics:** disponível somente como export local minimizado, versionado e pseudonimizado; não é conexão ativa.

Mudança de domínio, auditoria e `IntegrationOutbox` são persistidos atomicamente quando aplicável. O dispatcher implementa contrato validado, idempotência, retry, backoff e dead-letter. Destinos reais continuam bloqueados por incompatibilidade/indisponibilidade e por falta de TLS/M2M aprovados. Nenhuma integração externa fica habilitada no Portfolio Demo.

## 11. Estrutura implementada

```text
EDY-HelpDesk/
|-- apps/{web,api,diagnostics-worker}/
|-- packages/{contracts,domain,config,test-utils}/
|-- prisma/
|-- scripts/diagnostics/
|-- tests/
|-- docs/{adr,api,database,integrations,operations,security}/
|-- storage/
|-- archive/
|-- .env.example
|-- .gitignore
|-- ARCHITECTURE.md
|-- ROADMAP.md
`-- SECURITY.md
```

`storage/`, `archive/`, caches, builds, bancos, logs e artefatos de teste são locais e ficam fora do conjunto público. `docs/screenshots/` contém somente capturas aprovadas do Portfolio Demo.

## 12. ADRs

- [ADR-001 — Modular Monolith](docs/adr/ADR-001-modular-monolith.md)
- [ADR-002 — SQLite to PostgreSQL Strategy](docs/adr/ADR-002-sqlite-to-postgresql-strategy.md)
- [ADR-003 — Diagnostics Worker Isolation](docs/adr/ADR-003-diagnostics-worker-isolation.md)
- [ADR-004 — PowerShell Allowlist Model](docs/adr/ADR-004-powershell-allowlist-model.md)
- [ADR-005 — Transactional Outbox](docs/adr/ADR-005-transactional-outbox.md)
- [ADR-006 — Authentication and RBAC](docs/adr/ADR-006-authentication-and-rbac.md)

## 13. Non-goals da primeira implementação

- Shell remoto, RMM, WinRM ou comandos arbitrários.
- Remediação, alteração do Windows ou elevação administrativa.
- AD, LDAP, Entra ID, SSO, microserviços, Kafka ou multi-tenancy.
- Coleta do Windows Security log e anexos binários.
- Integrações externas ativas com Sentinel, SIEM, Power BI, e-mail ou Teams.
- PostgreSQL de produção, cloud, publicação pública ou GitHub.
- Scanner de vulnerabilidade ou capacidade ofensiva.

## 14. Gate de release

A v1 somente pode ser marcada após lint, typecheck, testes, E2E, build, integridade de banco, dependency audit, secret/privacy scan, clean install e smoke final. Publicação continua condicionada a uma decisão explícita de licença e revisão humana; nenhum Git, remote, push ou release é criado automaticamente.
