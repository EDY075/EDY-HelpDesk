# Phase 6 Memory — Dashboard & Reports

## O que foi feito

Dashboard operacional, sete áreas analíticas, Operations Center, Report Center,
ExportJob, CSV/JSON seguros, contrato EDY SOC Analytics e QA autenticada foram concluídos.

## Decisões importantes

- KPIs e charts usam somente banco persistido; ausência de denominador produz `null`.
- Datas são interpretadas em America/Sao_Paulo e consultadas como intervalo UTC half-open.
- CSV neutraliza formula injection com apóstrofo; paths e nomes são server-defined.
- Retenção é 7 dias; download expira, mas remoção física automática foi adiada.
- Viewer: Ticket/SLA/Asset/Knowledge; Technician acrescenta Diagnostic/Security; Admin
  acrescenta Audit Summary.

## Problemas encontrados e soluções

- Origin de preview divergente: API reiniciada para localhost:4173 durante QA.
- Overflow de Reports em 1024/768: colunas secundárias foram ocultadas nesses breakpoints.
- Gate legado esperava 5 migrations: atualizado para o baseline real de 6.

## Verificação

217/217 testes, 77/77 responsive QA, lint/typecheck/build PASS, 0 vulnerabilidades,
secret scan PASS, DB integrity ok e todos os smokes Phase 3–6 PASS.

## Pendência

Aguardar aprovação explícita para Phase 7 — Integrations & Production Readiness.
