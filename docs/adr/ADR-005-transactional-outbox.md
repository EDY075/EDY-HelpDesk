# ADR-005 — Transactional Outbox

- **Status:** Aceito
- **Data:** 2026-08-28

## Contexto

EDY Sentinel, EDY SIEM e EDY SOC Analytics serão integrados futuramente. Chamada HTTP síncrona dentro da mutação de ticket criaria acoplamento, perda de evento e inconsistência quando o destino estiver indisponível.

## Decisão

Persistir `IntegrationOutbox` na mesma transação da mudança de domínio e da auditoria aplicável.

Envelope mínimo:

- `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `source`.
- `correlationId`, `idempotencyKey`, payload mínimo.

O dispatcher futuro fará entrega at-least-once. Retry conserva `eventId`; consumidores são idempotentes. Estados planejados incluem pending, leased/processing, retry, delivered e dead-letter, com lease recuperável, backoff e limite de tentativas.

## Consequências

### Positivas

- A transação de negócio não depende da disponibilidade externa.
- Eventos não são silenciosamente perdidos após commit.
- Contratos versionados reduzem acoplamento.

### Negativas

- Entrega não é exatamente uma vez; duplicatas são possíveis.
- Requer dispatcher, observabilidade, retenção e dead-letter.
- Dados ficam temporariamente replicados no outbox.

## Alternativas consideradas

- **HTTP síncrono:** rejeitado por acoplamento e falha parcial.
- **Leitura direta do banco:** rejeitada por segurança e acoplamento de schema.
- **Kafka desde o início:** rejeitado por complexidade prematura.
- **Best-effort após commit:** rejeitado por janela de perda.

## Riscos e revisão

Payloads devem ser mínimos e pseudonimizados quando possível. TLS, M2M, egress allowlist e prevenção de replay serão gates antes de ativar qualquer adaptador real.
