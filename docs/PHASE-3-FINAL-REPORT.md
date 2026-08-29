# EDY HELPDESK — PHASE 3 FINAL REPORT

Data: 28/08/2026. Projeto: `<project-root>`.
Escopo: Assets & Knowledge Base, local-first. Sem publicação, commit, push ou integração externa.

## Architecture:

Modular monolith preservado: React/Vite → Express `/api/v1` → Prisma/SQLite.
Diagnostics Worker permanece processo separado e inativo para diagnósticos.
Integration Outbox e catálogo allowlisted permanecem preparados, sem execução.
`requiresElevation=false`; cliente não define scriptPath.

Conferidos por SHA-256: ARCHITECTURE.md, ROADMAP.md, SECURITY.md e os seis ADRs
estão idênticos ao baseline. Nenhum desses nove documentos foi editado.
As decisões de implementação estão no [contrato complementar](api/phase3-assets-knowledge.md).

## Phase 2 Regression:

Baseline executado antes das mudanças: **47/47 PASS**. Os 47 testes permanecem na
suíte final; somente o setup de banco de dois arquivos foi isolado, sem retirar suas
asserções. Login, Overview, Ticket Queue, Ticket Workspace, New Ticket, Users e
Command Palette foram inspecionados no Chrome; as áreas autenticadas foram revisadas
após restabelecer a API/sessão. Login teve inspeção de estrutura, não auditoria visual exaustiva.
Máquina de estados, SLA, Ticket.version e modelo de sessão preservados.

## Asset Model:

Inventário manual com UUID, assetCode, version, hostname, tipo, fabricante/modelo,
serial, OS/versão, CPU, RAM/storage em bytes, IPv4/MAC, departamento, responsável,
status, localização, datas de aquisição/garantia, notas, lastSeenAt e datas de ciclo de vida.
Criação exige apenas nome, tipo e departamento ativo. Dados técnicos são opcionais.
Os dois ativos anteriores foram preservados, incluindo IDs, tags e vínculos históricos.

## Asset Numbering:

**AST-YYYY-NNNNNN**, gerado por SequenceCounter na transação de criação.
UUID interno, código imutável por contrato e trigger. Teste de criação concorrente aprovado.
Migração histórica faz backfill AST-2026; novas criações usam o ano UTC corrente.

## Asset Queue:

Fila operacional com busca, tipo, status, departamento, usuário, OS, ordenação,
paginação e opção de incluir arquivados. Filtros persistem na URL. Identidade do
endpoint, responsável, sistema, estado e last seen aparecem sem inventário simulado.

## Asset Workspace:

Endpoint 360 com identidade, ownership, sistema/rede, metadados manuais, tickets
relacionados, atividade e edição. “Diagnostics unavailable” explicita que nenhuma
coleta, comando ou remediação está em execução. Ausência de lastSeenAt é apresentada
como não reportada, nunca como presença online.

## Asset Assignment:

Assign, reassign e unassign com controle de versão e auditoria de usuário anterior/novo.
Usuários arquivados não podem receber novas atribuições. User Workspace e inventário
refletem as relações persistidas, sem apagar histórico.

## Asset-Ticket Integration:

Ticket Workspace permite consultar, vincular, trocar e desvincular ativo em ticket
não Closed, respeitando escopo do técnico. AuditEvent + TicketHistory registram
ativo anterior/novo, ator, timestamp e versões. Ativo arquivado é recusado para novos vínculos.

## Asset Archiving:

Archive/restore exclusivo de Admin, sem exclusão física. archivedAt é independente
de Active/InStock/Maintenance/Retired/Lost. Tickets históricos mantêm suas referências.
Ativos arquivados são removidos das opções normais de novos tickets.

## Knowledge Model:

KnowledgeArticle com UUID, articleCode, title, summary, problem, symptoms,
diagnosticSteps, solution, validationSteps, category, tags, status, author,
version e timestamps. Texto puro escapado; HTML arbitrário não é renderizado.
KnowledgeArticleTicket implementa many-to-many com unicidade por par.

## Knowledge Numbering:

**KB-YYYY-NNNNNN**, SequenceCounter transacional, UUID interno e código imutável.
Teste de concorrência aprovado. Autor e código são definidos pelo servidor.

## Knowledge Search:

Busca em título, resumo, problema, sintomas, solução, tags e código. Filtros por
categoria, status e tag exata; ordenação por atualização ou título e paginação real.
Sem ranking fabricado, recomendação “AI” ou popularidade fictícia.

## Knowledge Workspace:

Central operacional e workspace de artigo com seções de suporte, autor, categoria,
tags, metadados de revisão e tickets relacionados. Editor estruturado com Draft,
Publish, Archive, Restore e Copy Article Link conforme permissão.
Restore retorna a Draft; nenhuma publicação é automática.

## Knowledge-Ticket Integration:

Related Knowledge permite busca manual, link/unlink de Published e abertura da
referência durante a resolução. Atualiza Ticket.version, história e auditoria.
Não copia solução automaticamente. Arquivar um artigo preserva a associação no banco,
mas o retira da lista operacional de referências Published.

## Knowledge Draft from Ticket:

**Adiado conforme a exceção autorizada no escopo.** É necessário um fluxo explícito
de seleção de campos, revisão e redação de dados pessoais antes de copiar texto de
ticket. Não há cópia de notas internas. Draft manual já está disponível.

## RBAC:

| Papel | Ativos | Knowledge | Relações em ticket |
|---|---|---|---|
| Viewer | Leitura | Somente Published | Leitura |
| Technician | Criar, editar, atribuir | Criar/editar Draft; ler artigos | Alterar apenas tickets atribuídos a si e não Closed |
| Admin | Inclui archive/restore | Inclui publicar, editar Published e archive/restore | Qualquer ticket não Closed |

Deny by default na API e filtragem de comandos na palette. CSRF, sessão, Argon2id,
CORS, Helmet, limites de payload e validação Zod continuam ativos.

## Optimistic Locking:

Asset.version e KnowledgeArticle.version implementados, além de Ticket.version.
Compare-and-swap transacional e HTTP 409 em conflitos. Testes simultâneos verificam
que apenas uma atualização com a mesma versão vence. No Chrome, o editor de ativo
recusou a versão antiga e exibiu “Reload latest version”, sem sobrescrever o registro.

## Audit:

Eventos para criação/edição/atribuição/reassignment/unassignment/archive/restore de
ativos; criação/edição/publicação/archive/restore de artigos; link/unlink de recursos.
Mutações e auditoria ficam na mesma transação. Anti-UPDATE e anti-DELETE em AuditEvent
confirmados por testes e inspeção SQLite. Hash encadeado não implementado nesta fase.
Respostas de autores/assignees/atores usam projeções públicas, sem credentialHash.

## Overview:

Hierarquia e métricas existentes preservadas. Não foram adicionados cards de inventário
ou conhecimento: as áreas próprias já oferecem o contexto necessário. Os indicadores
continuam calculados a partir dos tickets/SLA persistidos.

## User Workspace:

Informações do usuário, departamento, ativos atribuídos não arquivados, tickets abertos
e recentes. Visual compacto, dados persistidos. Limites explícitos: 25 abertos e 10 recentes.

## Command Palette:

Adicionados cinco comandos: Assets, Search Asset, Knowledge Base, Search Knowledge,
Create Knowledge Article. Total: 10 comandos antes da filtragem por papel.
Permissões cobertas por dois testes dedicados. Busca, setas, Enter, Escape,
focus trap e retorno de foco conferidos; seleção ativa acompanha a rolagem.

## Design System:

Dark premium, azul, tipografia, superfícies e densidade operacional preservados.
Correções justificadas: controles do shell com estilo nativo destoante, botão de
fechar sidebar no desktop, espaçamento do breadcrumb e texto secundário de baixo contraste.
O tom secundário passou de #647990 a #8195ad para melhorar legibilidade sem trocar a paleta.
Novas áreas usam o design existente; não houve redesign da Phase 2 por preferência.

## Responsive QA:

**21/21 combinações sem overflow horizontal de página**, após confirmar o conteúdo carregado.

| Viewport | Asset Workspace | Knowledge Article | Ticket Workspace |
|---|---|---|---|
| 1920×1080 | PASS | PASS | PASS |
| 1600×900 | PASS | PASS | PASS |
| 1440×900 | PASS | PASS | PASS |
| 1366×768 | PASS | PASS | PASS |
| 1280×720 | PASS | PASS | PASS |
| 1024×768 | PASS | PASS | PASS |
| 768×900 | PASS | PASS | PASS |

Medição DOM: scrollWidth igual a clientWidth em todas as 21 combinações. Revisão
visual por screenshots em desktop e 768px, sem atribuir certificação a essas medições.
A tabela da fila de tickets existente mantém sua rolagem interna em telas estreitas.

## Accessibility:

Labels de formulário e nomes acessíveis inspecionados; corrigido o nome do menu de
conta quando o texto visual fica oculto em telas menores. Focus visible e reduced
motion preservados no CSS. Palette: Tab/Shift+Tab contidos no diálogo, Escape fecha
e devolve foco ao acionador. Contraste medido do tom secundário sobre #0e1b2e:
**3,85:1 antes → 5,63:1 depois**. Esta é validação direcionada, não certificação WCAG
integral nem teste completo com leitor de tela.

## API:

**19 novos contratos método/rota** sob `/api/v1`, detalhados no documento de API.
Erros seguros via Problem Details; versões, permissões e relações validadas no servidor.
Nenhuma API de execução, telemetria, integração ou comando remoto foi adicionada.

## Database:

Uma migração aditiva, **3 migrações aplicadas no total**. Backup pré-migração retido em
`archive/phase3-pre-migration/edy-helpdesk.db`, ignorado pelo Git.
Prisma schema validado e client gerado. SQLite integrity_check: **ok**;
foreign_key_check: **0 violações**.

Dataset observado: **7 ativos, 7 artigos Published, 6 usuários, 3 contas, 7 tickets,
4 departamentos, 7 categorias e 6 vínculos artigo-ticket**. DiagnosticAction: **0**;
IntegrationOutbox: **0**. Todos os registros demonstrativos são sintéticos.
O seed repetido não reseta conteúdo existente, versões, SLA, credenciais ou contadores.

## Tests:

**79/79 PASS**: API 60, Worker 3, Config 5, Contracts 3, Domain 6, Test Utils 2.
São 47 testes anteriores + 30 de Assets/Knowledge + 2 de permissões da palette.
Cobertura inclui criação, códigos concorrentes, CAS, atribuições, archive/restore,
filtros, vínculos, publicação, RBAC, CSRF, auditoria append-only, projeções sem hashes
e seed não destrutivo. Bancos de testes isolados em storage/test-runs; banco do preview
não é usado como fixture destrutiva.

## Lint:

**PASS** — `npm run lint`, incluído no `npm run check` final.

## Typecheck:

**PASS** — todos os workspaces em `npm run typecheck`.

## Build:

**PASS** — packages, API, Worker e Web em `npm run build`.

## Dependency Audit:

**0 vulnerabilities** — `npm run audit:dependencies` / npm audit, execução final.
Não foram alteradas dependências de runtime para implementar a fase.

## Secret Scan:

**PASS** — scanner local do projeto para padrões de segredo/dados pessoais no código
e documentação versionável. `.env`, storage e backups permanecem ignorados; o teste
não equivale a uma auditoria forense de todos os arquivos da máquina.

## Smoke Test:

**PASS** — API health/readiness, Web HTTP 200 e dez leituras autenticadas de domínio
(12 rotas GET de API contando health/readiness). Login/logout da sessão de teste aprovados.
Comando: `node --env-file=.env scripts/smoke-phase3.mjs`.
Worker: processo separado com heartbeats `idle`, `diagnosticExecutionEnabled=false`.
No Chrome, uma parada controlada da API gerou estado de erro com Retry; após reinício,
Retry recuperou o Endpoint 360. IPv4 inválido gerou erro inline seguro.

## Known Limitations:

- Create Knowledge Draft from Ticket adiado por necessidade de revisão/redação segura.
- Inventário manual/sintético, sem coleta, estado online ou diagnóstico real.
- Busca local por campos, sem full-text avançado ou ranking de “mais relacionados”.
- Listas contextuais limitadas: 50 tickets/atividades no ativo, 50 vínculos no artigo;
  User Workspace 25 abertos/10 recentes. Sem paginação adicional dessas listas contextuais.
- Tags deliberadamente limitadas a letras ASCII, dígitos, espaços e hífens nesta versão.
- PostgreSQL, testes de carga, Lighthouse e auditoria completa com leitor de tela não
  executados; não há alegação de aprovação desses gates adicionais.
- Revisão executada diretamente: criação de subagentes não estava disponível; não é
  apresentada como revisão independente do squad.
- Console do Chrome contém erros de uma extensão externa e mensagens de canal de
  extensão; não se declara console global limpo. Falhas intencionais 400/409 e a parada
  da API fazem parte do QA. O smoke final não apresentou falhas nas rotas verificadas.
- Bancos de teste e backup foram mantidos localmente, sem limpeza destrutiva.

## Issues Found:

1. Porta 8080 ocupada por Steam: usado 8081 apenas no processo da API; aplicação alheia intacta.
2. Projeções de Account podiam expor credentialHash: corrigidas e cobertas por teste negativo.
3. Seed antigo regravava registros/SLA/contadores: upserts tornados não destrutivos; teste de repetição.
4. Testes de foundation tocavam o banco configurado: fixtures agora isoladas no projeto.
5. Email opcional de User não era aceito como null no frontend: contrato corrigido.
6. Controles do shell destoavam do design; breadcrumb e sidebar tinham inconsistências: corrigidos.
7. Novo controle de paginação removia o próprio parâmetro page: corrigido.
8. Menu de conta perdia nome acessível em tela menor; texto secundário tinha contraste insuficiente: corrigidos.
9. Mensagem antiga de validação podia permanecer junto de um conflito novo: estado de feedback
   dos novos editores agora é limpo a cada tentativa/reload, mantendo o alerta atual.

Não há falha aberta nos quality gates executados. As limitações acima permanecem explícitas.

## Screens Recommended:

Preview somente local: `http://127.0.0.1:4173`. Autenticação com conta sintética local.

1. [Overview](http://127.0.0.1:4173/overview).
2. [Assets](http://127.0.0.1:4173/assets).
3. [Endpoint 360 — Finance](http://127.0.0.1:4173/assets/2acceba1-0f9f-4330-be52-cd9095d34be0).
4. [User Workspace — Morgan](http://127.0.0.1:4173/users/ea5ef633-9669-45d2-9544-d3ded45f48e0).
5. [Ticket com Asset e Knowledge](http://127.0.0.1:4173/tickets/58446f9b-7190-4c03-97b1-08a0bab8f573).
6. [Knowledge Base](http://127.0.0.1:4173/knowledge).
7. [Knowledge Article — DNS](http://127.0.0.1:4173/knowledge/c0e96bc2-6eae-4650-9164-0d50aae82d75).
8. Command Palette: Ctrl/Cmd + K em qualquer workspace autenticado.

Os UUIDs acima pertencem ao banco local validado; um seed em banco novo pode gerar outros.
No QA, o ticket HD-2026-000004 foi ligado ao ativo Finance AST-2026-000003 e ficou
com essa associação sintética, com história/auditoria. O ativo recebeu uma gravação de
mesmo conteúdo para testar conflito de versão; não foi coletado nenhum dado real.

## Ready for Phase 4: YES

Pronto para solicitar aprovação de **PHASE 4 — LOCAL READ-ONLY DIAGNOSTICS**.
Isso não autoriza nem inicia a fase seguinte. Nenhum PowerShell de diagnóstico,
Event Viewer, AD/LDAP/Entra, Sentinel/SIEM, Power BI, mensageria, e-mail ou deploy foi implementado.
