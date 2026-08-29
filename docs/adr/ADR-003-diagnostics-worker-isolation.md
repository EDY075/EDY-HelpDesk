# ADR-003 — Diagnostics Worker Isolation

- **Status:** Aceito
- **Data:** 2026-08-28

## Contexto

PowerShell e providers do Windows podem ser lentos, falhar por versão/permissão e aumentar o impacto de uma falha da API. Executar coleta na thread HTTP ameaça disponibilidade e mistura fronteiras de privilégio.

## Decisão

Executar diagnósticos em Diagnostics Worker separado da API.

- A API valida autorização e parâmetros e persiste `DiagnosticJob`.
- O worker faz claim atômico e revalida actionId, versão, permissão lógica, `enabled`, hash, schemas e `requiresElevation=false`.
- O worker usa conta sem privilégio administrativo, working directory e ambiente controlados.
- Há concorrência limitada, timeout, cancelamento, kill-tree e limites de saída.
- Estados: queued, running, succeeded, partial, failed, timed_out e cancelled.
- API continua disponível se o worker estiver parado; jobs órfãos serão reconciliados sem execução duplicada.

## Consequências

### Positivas

- Isolamento de disponibilidade e privilégio.
- Jobs assíncronos, auditáveis e recuperáveis.
- Timeout não bloqueia requisições HTTP.

### Negativas

- Lifecycle, heartbeat, recovery e backpressure adicionais.
- Resultado deixa de ser síncrono.
- Persistência precisa resolver claims e leases corretamente no SQLite.

## Alternativas consideradas

- **Executar no processo Express:** rejeitado por acoplamento e DoS.
- **Shell remoto/WinRM:** rejeitado por risco e escopo.
- **Serviço privilegiado:** rejeitado; v1 não exige elevação.
- **Redis/fila externa:** adiado até haver necessidade operacional.

## Riscos e revisão

Crash entre execução e confirmação pode exigir reconciliação. O desenho será revisto antes da Fase 4 com testes de replay, job órfão, timeout, kill-tree e indisponibilidade do worker.
