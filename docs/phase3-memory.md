# MEMORY: jr — 2026-08-28 — Phase 3

## CONTEXTO VIVO

Projeto: EDY HelpDesk, `<project-root>`.
Tarefa: Phase 3 concluída; aguardar aprovação da Phase 4.
Execução: direta, sem ferramenta de criação de subagentes disponível.
Arquivos críticos: prisma/schema.prisma, migration assets_knowledge,
modules/inventory-knowledge, páginas Assets/Knowledge, docs/PHASE-3-FINAL-REPORT.md.
Arquitetura, ROADMAP, SECURITY e seis ADRs: preservados por hash.

## O que foi feito

Inventário e Knowledge Base persistidos, workspaces, relações com tickets/usuários,
RBAC, códigos transacionais, versionamento e auditoria. QA automatizado e Chrome.

## Decisões importantes

Publicação/arquivamento de artigos por Admin; técnicos editam Draft. Restore retorna
a Draft. Dados técnicos manuais. Draft a partir de ticket adiado até revisão/redação segura.
Nenhum recurso da Phase 4 ativado. Memória mantida somente no projeto, respeitando
a restrição de não escrever fora da pasta oficial.

## Problemas encontrados

Porta padrão ocupada; projeções amplas de Account; seed destrutivo em repetição;
fixtures de teste compartilhadas; contraste/nome acessível e estados de erro antigos.

## Soluções aplicadas

Preview em 8081/4173, sem interromper aplicativo alheio. Projeções públicas,
seed que não altera registros existentes, bancos isolados e feedback por tentativa.
Testes negativos de hashes/CSRF/RBAC, testes concorrentes e invariantes de auditoria.

## Conhecimento consolidado

- Dados de teste devem usar banco isolado dentro do projeto; seed não é reset.
- Relações Prisma com Account exigem select público explícito.
- SequenceCounter, criação e audit devem compartilhar a transação.
- Testar conflito no navegador além do teste da API revela problemas de feedback.
- Conferir conteúdo carregado antes de medir overflow; skeleton não comprova layout final.
- Errors de extensões do Chrome devem ser identificados, não tratados como evidência
  de console limpo ou automaticamente atribuídos ao produto.

## Pendências / Follow-up

Aprovação explícita para Phase 4. Limitações e evidências completas no relatório final.
Não houve GitHub, commit, push ou publicação. Nenhum arquivo material foi removido.

## Arquivos afetados

- prisma/schema.prisma; prisma/seed.ts; prisma/seed-phase3.ts.
- prisma/migrations/20260828230000_assets_knowledge/migration.sql.
- apps/api/src/modules/inventory-knowledge/ e integração em app/auth/service-desk/errors.
- apps/api/src/assets-knowledge.test.ts; command-access.test.ts; test-database.ts;
  setup de database.test.ts e service-desk.test.ts.
- apps/web/src/pages/AssetsPage.tsx; KnowledgePages.tsx; UserDetailPage.tsx;
  TicketDetailPage.tsx; DirectoryPages.tsx.
- apps/web/src/components/TicketResources.tsx; AppShell.tsx; CommandPalette.tsx.
- apps/web/src/App.tsx; lib/api.ts; lib/command-access.ts; styles.css.
- scripts/smoke-phase3.mjs; README.md; docs/phase3-preflight.md;
  docs/api/phase3-assets-knowledge.md; docs/PHASE-3-FINAL-REPORT.md; este registro.
- Backup local: archive/phase3-pre-migration/edy-helpdesk.db.

Resultado medido: 79/79 testes; lint/typecheck/build PASS; npm audit 0 vulnerabilidades;
secret scan e smoke PASS; 21 combinações responsivas sem overflow de página.
