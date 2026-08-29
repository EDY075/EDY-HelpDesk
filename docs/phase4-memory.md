# MEMORY: jr — 28/08/2026, Phase 4

## CONTEXTO VIVO

Projeto: EDY HelpDesk, `<project-root>`.
Tarefa: Local Read-Only Diagnostics e QA visual autenticado concluídos.
Próximo: aguardar aprovação do usuário. Phase 5 não autorizada/iniciada.

## O que foi feito

Catálogo de nove ações, schemas, collector fechado, host nativo Windows Job Object, Worker
isolado, jobs/resultados/eventos persistidos, registro local, modo segregado, UI e auditoria.
159 testes, 20 coletas reais, quatro testes de contenção, quatro de bootstrap e smokes.
QA autenticado: 7/7 superfícies e 49/49 combinações responsivas. Detalhes e limites no
`PHASE-4-FINAL-REPORT.md`.

## Decisões importantes

API nunca executa PowerShell; somente fila. Native host associa a árvore ao Job Object
atomicamente e trava escrita no script verificado. Nenhuma elevação ou command shell.
Banco Demo não muda para Operational; seeds não entram em Operational. Histórico guarda
interpretação, sem recalcular passado. Eventos têm somente retenção de 30 dias, fora do payload 90d.

## Problemas encontrados / soluções

Zod 3 no shared e 4 na API: schemas locais compatíveis, sem misturar instâncias.
Bundle do Worker: dependências nativas externalizadas por declarações explícitas.
Auditoria de success: teste de falha confirma rollback do resultado. Worker concorrente:
teste com duas instâncias e fake runner confirma uma execução e cancelamento transacional.
CLI operacional recebe typecheck próprio e testes de recusa a overwrite/Demo/path.
Freshness de área separada evita apresentar amostra antiga como atual.
QA visual corrigiu overlap do breadcrumb, pluralização de freshness, foco da Command Palette,
scroll na abertura do diálogo e controles mobile ocultos ainda presentes na ordem de Tab.

## Pendências / follow-up

Aguardar aprovação explícita antes da Phase 5. Não repetir coletas reais sem necessidade e não
publicar screenshots Operational. A auditoria WCAG formal/leitor de tela completo permanece fora
do gate desta fase. Ferramenta spawn_agent indisponível; não afirmar revisão independente do Squad.

## Arquivos afetados

- API diagnostics/auth wiring; Worker/native/collector; shared contracts; Prisma schema/migration/seed.
- Web EndpointHealth/Diagnostics/Asset/Ticket/AppShell e extensões do CSS existente.
- Scripts de build, QA, smoke, bootstrap, scanner; configuração de build/typecheck e ignore.
- README e documentação Phase 4. Documentos protegidos: 10/10 inalterados.

Registro mantido no projeto em respeito à instrução desta fase de não escrever fora da pasta oficial.
