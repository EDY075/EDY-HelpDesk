# Phase 5 — Security API v1

Implementation contract, 2026-08-28. Base: `/api/v1`. Este documento complementa e
não substitui a arquitetura, segurança ou ADRs aprovados.

> Estado da tabela de rotas: **IMPLEMENTADO E VERIFICADO** em 28/08/2026. Os paths/métodos
> abaixo foram conferidos no router e nos testes. Não há
> `POST` genérico para criar SecurityCase: criação ocorre somente por escalonamento de Ticket.

## Invariantes

- Ticket 1 → 0..1 SecurityCase; `ticketId` é único no Case.
- UUID é identidade interna; `SEC-YYYY-NNNNNN` é código imutável para humanos.
- Toda mutation de Case/evidence exige a versão atual e incrementa `SecurityCase.version`.
- Writes usam compare-and-increment e retornam 409 quando a versão estiver stale.
- Case, evidence e timeline não possuem exclusão física no fluxo v1.
- Timeline e AuditEvent são append-oriented/append-only conforme seus limites aprovados.
- Case creation, timeline, audit e outbox do escalonamento formam uma única transação.
- Nenhum endpoint executa contenção, PowerShell, consulta nova de Event Log ou chamada externa.

## Authentication, CSRF e erros

Todas as rotas exigem sessão server-side. Mutations exigem Origin aprovado e
`X-CSRF-Token`; o escalonamento também exige `X-Idempotency-Key` UUID. DTOs JSON são
strict e rejeitam campos desconhecidos. Request/correlation IDs e Problem Details
`application/problem+json` existentes permanecem válidos.

- `200`: leitura/update ou replay idempotente concluído.
- `201`: escalonamento ou evidência criada pela primeira vez.
- `400`: schema, severity, status, reason ou referência inválida.
- `401`: sessão ausente/inválida.
- `403`: capability insuficiente; denial é auditado.
- `404`: Ticket, Case, asset, diagnostic job ou Windows event invisível/inexistente.
- `409`: version stale, transição inválida, duplicidade incompatível ou conflito idempotente.

Mensagem de conflito para o frontend: `This security case was updated by another analyst.`
O cliente deve oferecer `Reload latest version`; não faz merge/retry automático.

## RBAC

| Operação | Viewer | Technician | Admin |
|---|---:|---:|---:|
| Security dashboard/queue/detail sanitizado | Permitido | Permitido | Permitido |
| Escalate Ticket | Negado | Permitido conforme escopo do Ticket | Permitido |
| Assign/reassign analyst | Negado | Permitido | Permitido |
| Change severity/status | Negado | Permitido | Permitido |
| Add manual/diagnostic/event evidence | Negado | Permitido | Permitido |
| Resolve/reopen/false-positive/close | Negado | Permitido | Permitido |

As permissões foram verificadas no módulo RBAC e por testes autenticados. "Security Analyst" pode ser rótulo/capability, nunca uma nova role
incompatível com Admin/Technician na v1. Enforcement é server-side; ocultar botão não autoriza.

## Inventário de rotas implementadas

| Method | Path real | Permission | DTO / resultado |
|---|---|---|---|
| GET | `/security/dashboard` | `security.read` | métricas reais e distribuições |
| GET | `/security/analysts` | `security.read` | Admin/Technician ativos |
| GET | `/security/cases` | `security.read` | search, filtros, sort e paginação |
| GET | `/security/cases/:id` | `security.read` | workspace sanitizado |
| GET | `/tickets/:id/security-case` | `security.read` | Case do Ticket ou `null` |
| GET | `/assets/:id/security-cases` | `security.read` | Cases e contagem aberta do ativo |
| POST | `/tickets/:id/security-escalations` | `security.manage` | escalonamento idempotente |
| POST | `/security/cases/:id/assignments` | `security.manage` | assign/reassign/unassign |
| POST | `/security/cases/:id/severity` | `security.manage` | severity + reason + version |
| POST | `/security/cases/:id/status-transitions` | `security.manage` | transição/reopen/close |
| POST | `/security/cases/:id/resolution` | `security.manage` | resolução explícita |
| POST | `/security/cases/:id/false-positive` | `security.manage` | classificação com reason |
| POST | `/security/cases/:id/evidence` | `security.manage` | ManualNote/DiagnosticFinding/EventLog |

Filtros/listas devem usar `page` a partir de 1 e `pageSize` limitado pelo servidor, retornar
`{data, pagination: {page, pageSize, total, totalPages}}` e manter ordenação estável.

## Escalation contract

Criação é exclusivamente uma ação sobre Ticket. Request mínimo:

```json
{
  "reason": "Account activity requires security review.",
  "severity": "High",
  "summary": "Potentially relevant findings require analyst triage."
}
```

O servidor deriva `ticketId`, source ticket code, asset opcional, actor, timestamps e code.
O cliente não envia Case UUID/code, analyst, status, `createdBy`, `version`, outbox ou audit.
O servidor valida, em ordem transacional:

1. sessão, Origin, CSRF, RBAC e escopo do Ticket;
2. Ticket existente e ativo para a ação;
3. idempotency key UUID e unicidade da chave de escalonamento;
4. ausência/presença do Case único daquele Ticket;
5. reason/severity/summary estritos e sanitizados;
6. sequência anual e criação do Case;
7. timeline `Case created`/`Escalated from HelpDesk`;
8. AuditEvent e `security.case.created` na Outbox.

Ticket já escalado retorna o Case persistido sem novos efeitos, independentemente de uma
nova tentativa do cliente. Reuso da chave de idempotência em outro Ticket retorna 409.
Não existe segundo Case, timeline de sucesso, audit de sucesso ou envelope para o replay.

## Queue, search e dashboard

Filtros aprovados: `status`, `severity`, assigned analyst, source category, `assetId`,
created-from/to. Search cobre SEC code, ticket code, title, asset e summary. Sorting:
newest, oldest, severity e recently updated. Parâmetros desconhecidos/valores inválidos
são rejeitados; filtros apropriados persistem na URL da Web.

Dashboard deriva do banco: Open Security Cases, High/Critical, Unassigned, Resolved Today,
cases by severity e cases by status. Não existe parâmetro para gerar threat map, live attacks,
risk score ou AI score.

## Severity

Severity aceita somente `Low`, `Medium`, `High`, `Critical`. O frontend pode apresentar a
seleção, mas não infere nem altera o valor fora de uma mutation autorizada. Findings podem
ser destacados como "Potentially relevant"/"Requires analyst review" sem classificar ataque.

| Severity | Guia de seleção humana |
|---|---|
| Low | Sinal isolado de baixo impacto, ainda relevante para registro/revisão. |
| Medium | Indício plausível ou recorrente com impacto limitado/incerto. |
| High | Evidência confiável ou impacto potencial relevante que exige prioridade. |
| Critical | Impacto grave/abrangente ou comprometimento ativo sustentado por contexto; exige seleção explícita. |

O guia não é um motor automático. Mudança de severity exige version atual e reason; registra
actor, previous/new severity, timeline, audit e outbox sanitizados.

## Status workflow

Estados: `New`, `Triaged`, `Investigating`, `Contained`, `Resolved`, `Closed`,
`FalsePositive`. Matriz inicial:

| From | To permitido | Dados adicionais |
|---|---|---|
| New | Triaged, Investigating, FalsePositive | reason para FalsePositive |
| Triaged | Investigating, FalsePositive | reason para FalsePositive |
| Investigating | Contained, Resolved, FalsePositive | resolutionSummary para Resolved; reason para FalsePositive |
| Contained | Investigating, Resolved, FalsePositive | resolutionSummary para Resolved; reason para FalsePositive |
| Resolved | Closed, Investigating | reason para reopen |
| FalsePositive | Closed, Investigating | reason para reopen |
| Closed | Investigating | reason para reopen |

Self-transition e qualquer aresta ausente são inválidas. A implementação e a UI compartilham
esta matriz. `Contained` registra somente progresso do processo: não isola
endpoint, não altera firewall/conta/processo/serviço e não chama Diagnostics Worker.

Resolver exige `resolutionSummary`; `classification` e `lessonsLearned` são opcionais e
sanitizados. `Closed` é posterior/separado. FalsePositive exige reason e nunca apaga Case,
evidence, timeline ou audit.

## Assignment

O analyst opcional deve referenciar conta ativa Admin/Technician. Assign/reassign/unassign
exige version atual e registra previous/new analyst em
timeline/audit/outbox sem copiar perfil completo da conta.

## Evidence

Tipos iniciais: `TicketContext`, `DiagnosticFinding`, `EventLog`, `ManualNote`. Campos de
resposta: evidenceId, securityCaseId, type, title, summary, source, sourceReference,
createdBy e createdAt. Texto é plain text, limitado e sanitizado; HTML e segredos são
rejeitados/redigidos. Não há endpoint DELETE de evidence na v1.

### DiagnosticFinding

Seleciona um DiagnosticResult existente e autorizado. O snapshot novo contém somente
`actionId`, result summary, structured findings, severity, `collectedAt` e
`diagnosticJobId`. O servidor lê esses valores; o cliente envia apenas a referência e
version atual do Case. Não copia payload/stdout/stderr bruto e não modifica o resultado.

### EventLog

Seleciona um WindowsEvent System/Application já coletado, autorizado e vinculado a um
resultado acessível. Persiste snapshot sanitizado. Não aceita log `Security`, evento
arbitrário fornecido pelo cliente nem dispara uma nova consulta.

### ManualNote/TicketContext

ManualNote recebe title/summary plain text e source restrito. TicketContext é criado pelo
servidor durante a escalada a partir do Ticket existente; o endpoint de evidência rejeita
`TicketContext` fornecido pelo cliente. Dados pessoais e comentários internos sem necessidade
são excluídos.

Evidence add incrementa Case.version e cria timeline, audit e
`security.case.evidence_added` na mesma transação.

## Timeline e AuditEvent

Timeline contém timestamp, actor, action, summary e metadata sanitizada para Case created,
assignment, severity/status change, evidence added, resolved, reopened, false positive e
closed. Não armazena payload completo de evidence ou credenciais. AuditEvent permanece
append-only e registra as mesmas mutações relevantes, security escalation e RBAC denial.

Case view não gera AuditEvent na policy v1 para evitar ruído de leitura. Hash encadeado
continua preparação futura, sem implementação nesta fase.

## Transactional Outbox e EDY SIEM

Eventos versionados: `security.case.created`, `security.case.updated`,
`security.case.evidence_added` e `security.case.resolved`. Envelope e redaction estão em
[EDY-SIEM-CONTRACT.md](../integrations/EDY-SIEM-CONTRACT.md).

O Outbox é local. Não existe API pública de entrega, callback falso, endpoint EDY SIEM,
dispatcher HTTP ou credencial externa na Phase 5. `Processed` não prova entrega externa.

## Ticket, Asset e Portfolio Demo

Ticket detail retorna Security Status real: Not escalated ou code/severity/status e referência
para o Case. Asset detail retorna Open/Recent Cases reais. Nenhuma leitura cria Case ou executa
diagnóstico. Portfolio Demo usa somente Case/evidence/timeline/outbox sintéticos identificados;
Operational não recebe seed e Demo não executa ação real.

## Explicitamente fora da Phase 5

EDY SIEM/Sentinel/Power BI reais; threat intel; email/Teams/Slack; AD/Entra/EDR; isolamento,
account disable, password reset, process kill, service stop, firewall/Defender changes;
comandos remotos, malware/IOC enrichment e active response.
