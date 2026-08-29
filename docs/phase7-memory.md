# Phase 7 Project Memory

## MEMORY: jr — 2026-08-28 22:24 -03:00

### O que foi feito

Concluída a Phase 7 — Integrations & Production Readiness do EDY HelpDesk. Foram adicionadas descoberta read-only de projetos EDY, contratos/adapters controlados, exportação analítica segura, UI de integrações, preparação PostgreSQL, E2E Playwright, backup/restore, retenção, observabilidade, hardening, code splitting, documentação e QA autenticado final.

### Decisões importantes

- Manter SQLite como provider padrão e funcional.
- Marcar PostgreSQL ao vivo como **NOT VALIDATED** por ausência de servidor local aprovado; schema, DDL, client e build foram validados estaticamente.
- Manter Sentinel indisponível, SIEM incompatível e SOC Analytics como Export Ready; nunca simular `Connected`.
- Manter todas as integrações desabilitadas por padrão e permanentemente bloqueadas no Portfolio Demo.
- Declarar `1.0.0-rc.1` como release candidate local de portfólio, sem autorização de publicação.
- Não criar licença sem decisão do proprietário.

### Problemas encontrados

- Nove achados internos de hardening em sessão, RBAC, redirects, cookies, logs e payload SIEM.
- Exemplos de configuração PostgreSQL pareciam credenciais.
- Bundle compilado do Worker falhava ao carregar o driver PostgreSQL empacotado.
- Portfolio Demo apresentava ausência de heartbeat do Worker como falha operacional.
- Uma descrição sintética antiga dizia que o fluxo SecurityCase estava inativo.

### Soluções aplicadas

- Corrigidos os nove achados e adicionados testes de regressão.
- Removidos exemplos de credenciais; URL real agora é exigida externamente.
- Externalizados `pg` e `@prisma/adapter-pg` nos bundles de API/Worker e validado o startup do artefato.
- Demo agora mostra Worker `Disabled / Not required in Portfolio Demo`.
- Seed sintético atualizado para refletir o workflow governado atual.

### Pendências / Follow-up

- Validar deploy, seed, constraints e transações em PostgreSQL local quando houver servidor aprovado.
- Realizar teste com leitor de tela externo.
- Definir licença.
- Aprovar ou rejeitar publicação, GitHub e promoção de `1.0.0-rc.1` para `1.0.0`; nenhuma dessas ações está autorizada ainda.

### Arquivos afetados

- `apps/`
- `packages/`
- `prisma/`
- `scripts/`
- `tests/`
- `docs/`
- `.env.example`
- `.gitignore`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- lockfile do npm

### Quality Gate

- Tests: 248/248 PASS
- E2E: 17/17 PASS
- Responsive QA: 154/154 PASS
- Lint / Typecheck / Build: PASS
- Dependency audit: 0 vulnerabilities
- Secret scan / database integrity / backup-restore / smokes: PASS
- Security Critical / High: 0 / 0
- PostgreSQL live: NOT VALIDATED
