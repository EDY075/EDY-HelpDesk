# EDY SIEM — contrato preparado pela Phase 5

Data: 28/08/2026. Versão do contrato: `1`.

## Estado e limite da integração

Este documento define somente o envelope, o payload mínimo e a fronteira do adaptador
entre EDY HelpDesk e um EDY SIEM futuro. A Phase 5 **não possui transporte externo**,
endpoint de destino, credencial M2M, dispatcher de rede nem confirmação de entrega.
Os eventos permanecem na `IntegrationOutbox` local e, no Portfolio Demo, contêm apenas
dados sintéticos identificados como tal.

`Processed` nunca deve ser interpretado como "entregue ao EDY SIEM" enquanto não existir
um adaptador externo aprovado. Se houver processamento local na Phase 5, esse estado
significa apenas validação local do envelope. `Failed` e `DeadLetter` também se referem
somente a falha local de preparação/validação. O estado inicial de um envelope novo é
`Pending`.

## Eventos preparados

| `eventType` | Gatilho de domínio | Conteúdo específico esperado |
|---|---|---|
| `security.case.created` | Escalonamento idempotente de Ticket | snapshot inicial sanitizado do caso |
| `security.case.updated` | Atribuição, severidade, status, reopen, false positive ou close | estado resultante e resumo da mudança |
| `security.case.evidence_added` | Evidência sanitizada anexada | resumo e referência interna da evidência |
| `security.case.resolved` | Transição válida para `Resolved` | resumo da resolução e estado resultante |

Uma mutação pode produzir no máximo os eventos compatíveis com a mudança confirmada.
Replays idempotentes retornam o resultado persistido e não geram um novo envelope.
Tentativas negadas, payloads inválidos e conflitos de versão geram auditoria quando
aplicável, mas não um evento de integração que represente sucesso.

## Envelope versionado

```json
{
  "eventId": "d222e246-90cb-4e45-93d7-3c719745e311",
  "eventType": "security.case.created",
  "schemaVersion": 1,
  "occurredAt": "2026-08-28T19:00:00.000Z",
  "source": "edy-helpdesk",
  "correlationId": "2e12bd0c-9d72-4380-86c6-ac8b407c3a4b",
  "idempotencyKey": "security-case:SEC-2026-000001:created:v1",
  "payload": {}
}
```

- `eventId`: UUID estável do evento; não muda em uma futura retentativa.
- `eventType`: um dos eventos versionados definidos acima.
- `schemaVersion`: inteiro positivo. Alteração incompatível exige nova versão.
- `occurredAt`: data/hora UTC do fato de domínio, não do consumo futuro.
- `source`: valor fixo `edy-helpdesk`.
- `correlationId`: acompanha a requisição/fluxo que originou a mudança.
- `idempotencyKey`: chave única e determinística para impedir duplicação lógica.
- `payload`: projeção allowlisted, mínima e sanitizada; não é cópia da linha do banco.

Persistência do fato de domínio, `AuditEvent` aplicável e envelope ocorre na mesma
transação local. O Outbox não substitui a trilha de auditoria append-only.

## Payload mínimo

```json
{
  "caseCode": "SEC-2026-000001",
  "sourceTicketCode": "HD-2026-000184",
  "severity": "High",
  "status": "Investigating",
  "summary": "Synthetic account activity requiring analyst review.",
  "asset": {
    "reference": "asset_0123456789abcdef"
  },
  "evidenceSummaries": [
    {
      "type": "DiagnosticFinding",
      "summary": "Controlled validation requires analyst review."
    }
  ],
  "timelineTimestamps": ["2026-08-28T19:00:00.000Z"],
  "correlationId": "2e12bd0c-9d72-4380-86c6-ac8b407c3a4b"
}
```

Campos obrigatórios: `caseCode`, `sourceTicketCode`, `severity`, `status`, `summary`,
`evidenceSummaries`, `timelineTimestamps` e `correlationId`. `asset` é `null` quando
o Ticket não possui ativo. O envelope é estrito e não aceita campos adicionais. A natureza
sintética é indicada na origem dos registros e na UI; não amplia o payload mínimo do SIEM.

Desde a Phase 7, `asset.reference` é um pseudônimo determinístico unilateral. UUID interno,
asset code, hostname, IP, MAC e serial não atravessam a fronteira SIEM.

O payload não afirma detecção, ataque, causa raiz ou comprometimento. `Contained` é
somente estado de processo; não representa ação técnica no endpoint.

## Redaction e minimização

O payload é construído por allowlist. Serializar a entidade inteira e remover campos
depois é proibido. Antes da persistência no Outbox:

1. selecionar somente os campos definidos neste contrato;
2. converter evidências em resumos estruturados e limitados;
3. aplicar redaction a texto livre e metadados;
4. rejeitar HTML e renderizar conteúdo como texto;
5. rejeitar o envelope se a validação do schema ou a sanitização falhar.

Nunca incluir:

- passwords, hashes de senha, cookies, tokens, chaves de API ou cabeçalhos de autenticação;
- stdout/stderr bruto, `scriptPath`, argumentos de processo ou caminhos internos;
- evento Windows completo, coleção completa de Event Logs ou Security Event Log;
- descrição integral do Ticket, comentários internos ou dados pessoais sem necessidade;
- e-mail, telefone, endereço, identificadores de sessão ou dados de navegador;
- payload original de diagnóstico, segredo mascarado parcialmente ou HTML arbitrário.

Referências de ativo devem usar somente o pseudônimo aprovado e nunca caminhos ou URLs com
credenciais. Evidência diagnóstica contém somente `actionId`, summary, findings
estruturados, severity, `collectedAt` e `diagnosticJobId`. Evidência de Event Log é um
snapshot sanitizado de evento System/Application já coletado; nenhuma nova consulta é
executada para preparar o envelope.

## Idempotência, ordenação e evolução

- A unicidade de `eventId` e `idempotencyKey` impede dois envelopes para o mesmo fato.
- Uma futura entrega será at-least-once; o consumidor deve deduplicar por `eventId`.
- `occurredAt` e timestamps da timeline são a ordenação de negócio; ordem de entrega
  não deve ser presumida.
- Campos opcionais podem ser adicionados na mesma versão somente se consumidores os
  ignorarem com segurança. Mudanças incompatíveis exigem `schemaVersion` nova.
- Payload inválido permanece local como falha observável; não é enviado parcialmente.

## Fronteira do adaptador

A aplicação de domínio prepara um envelope e o persiste na Outbox. Um adaptador futuro
receberá exclusivamente esse envelope validado. Ele não terá acesso direto às tabelas de
Ticket, diagnóstico, sessão ou auditoria. Na Phase 5, a fronteira termina na persistência
local; não há resolução DNS, socket, HTTP, fila remota ou leitura de credencial de SIEM.

Antes de habilitar entrega real, uma fase futura deve aprovar autenticação M2M, TLS,
allowlist de egress/destino, timeout, retry/backoff, dead-letter, prevenção de replay,
observabilidade, retenção, testes de contrato e resposta a indisponibilidade. A ativação
de qualquer um desses controles está fora da Phase 5.

## Retenção e exposição

O Outbox é dado operacional privado. Não aparece no Portfolio público, não é exportado
automaticamente e não é uma API externa. Retenção/purge deve preservar a auditoria e
seguir política aprovada antes de remover envelopes processados. `AuditEvent` continua
append-only e não é apagado por um futuro purge do Outbox.

## Limitações declaradas

- Contrato preparado não equivale a integração testada.
- Nenhum SIEM recebeu dados na Phase 5.
- Não há garantia de entrega, latência ou disponibilidade externa.
- Redaction é controle em camadas, não prova de ausência universal de PII em texto livre.
- Não há threat-intelligence enrichment, correlação externa, active response ou contenção.
