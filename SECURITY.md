# EDY HelpDesk — Modelo de Segurança v1

**Status:** controles v1 implementados e testados; revisão final de release em andamento  
**Versão do documento:** 1.0  
**Atualizado:** 2026-08-29

## 1. Objetivo

Documentar as fronteiras de confiança, invariantes, controles implementados, riscos residuais e pré-requisitos antes de qualquer exposição pública. Este documento descreve a aplicação local-first v1; não é certificação de segurança, auditoria independente ou autorização para Internet production.

## 2. Modos de operação

### Portfolio Demo

- Somente dados sintéticos.
- Diagnósticos Windows reais desabilitados.
- Integrações externas desabilitadas.
- Nenhum token, credencial, path pessoal, hostname, IP, MAC ou Event Log real.
- Dashboard calculado a partir de registros sintéticos persistidos, nunca de valores hardcoded.

### Local Operational

- Autenticação obrigatória.
- Bind em `127.0.0.1` por padrão.
- Diagnóstico somente do endpoint local autorizado.
- Dados sensíveis sujeitos a autorização, minimização, redaction e retenção.
- Exposição LAN/Internet, TLS e agentes remotos ficam fora da v1 inicial.

## 3. Invariantes de segurança

1. Diagnostics Worker permanece separado da API HTTP.
2. A API apenas persiste jobs; não executa PowerShell diretamente.
3. O cliente envia somente `actionId`, `assetId` e parâmetros definidos pelo schema.
4. `scriptPath`, `scriptHash`, executável e argumentos internos nunca são controlados pelo cliente.
5. `requiresElevation = false` é invariável da v1, validada antes do enqueue e novamente no worker.
6. Não existem comando arbitrário, terminal, upload de script, `Invoke-Expression`, shell composto, UAC, WinRM ou remediação.
7. Ações desconhecidas, desabilitadas, elevadas, adulteradas ou inválidas falham fechadas.
8. Identidade e papel vêm da sessão no servidor, nunca de header/body do cliente.
9. AuditEvent é append-only.
10. Integrações externas permanecem desabilitadas; o Portfolio Demo impede sua ativação.

## 4. Fronteiras de confiança

```text
Browser não confiável
  -> API: sessão, CSRF, validação, limites, Origin/CORS e RBAC
    -> Prisma/SQLite: DTOs, autorização, transações e optimistic locking
    -> fila persistida: action/version, idempotência e claim atômico
      -> Diagnostics Worker: revalidação e baixo privilégio
        -> catálogo/scripts: ACL, raiz fixa, versão e SHA-256
          -> Windows/PowerShell: saída hostil, limitada e validada

API -> filesystem: paths internos, nomes gerados, ACL e retenção
API -> IntegrationOutbox: persistência local; adapters externos desabilitados
```

Event Logs, mensagens de erro do Windows e resultados PowerShell são input não confiável. Serão tratados como texto e nunca interpretados como HTML, template, comando ou query.

## 5. Autenticação e sessão

Modelo implementado:

- Sessão server-side.
- Cookie `HttpOnly`, `SameSite` e `Secure` em produção.
- Novo identificador aleatório a cada login; a sessão anterior autenticada é revogada.
- Expiração absoluta e por inatividade.
- Senhas com Argon2id.
- Mensagens de login não enumeráveis e rate limiting.
- CSRF em mutações autenticadas por cookie.
- CORS e Origin por allowlist exata.
- `trust proxy` desligado por padrão.
- API keys somente para futuras identidades machine-to-machine, nunca como papel de usuário.

JWT em localStorage, API key compartilhada, papel em header e autorização apenas no frontend são rejeitados.

## 6. RBAC

Autorização é deny-by-default e verifica permissão, ação e, quando aplicável, propriedade/escopo do recurso na API. A v1 é single-organization e não possui fronteira multi-tenant.

| Capacidade | Viewer | Technician | Admin |
|---|---:|---:|---:|
| Dashboard e KB autorizados | Ler | Ler | Gerenciar |
| Tickets | Ler no escopo | Criar e operar no escopo | Total |
| Comments/History | Ler no escopo | Criar e ler no escopo | Total |
| Users/Departments/Categories | Leitura sanitizada | Operação limitada | Total/arquivar/reativar |
| Assets | Leitura sanitizada | Operar no escopo | Total/arquivar/reativar |
| Executar diagnóstico | Não | Somente ação e ativo autorizados | Somente ação e ativo autorizados |
| Resultado diagnóstico | Sanitizado no escopo | No escopo | Total autorizado |
| SecurityCase | Sem evidência sensível | Criar e acompanhar no escopo | Total |
| Export | Relatórios não sensíveis permitidos | Relatórios permitidos e escopo técnico | Total autorizado |
| Audit global | Não | Não | Somente leitura/export controlado |
| Accounts/Roles/Settings/Integrations | Não | Não | Sim |

`DiagnosticAction.requiredPermission` precisa ser satisfeita além do papel geral. Ocultar botão na UI não substitui autorização server-side. Listagens também aplicam escopo para evitar IDOR/BOLA.

## 7. Segurança de DiagnosticAction

O catálogo é server-owned, versionado e revisado. Campos obrigatórios:

- `actionId`, `name`, `category`, `version`.
- `scriptPath` interno.
- `scriptHash` SHA-256.
- `requiredPermission`.
- `parameterSchema`, `outputSchema`.
- `timeoutMs`, `maxOutputBytes`.
- `requiresElevation`, `enabled`.

Controles:

- Unicidade por `actionId + version`; versões publicadas são imutáveis.
- `scriptPath` é absoluto ou resolvido dentro de raiz fixa controlada.
- Rejeitar traversal, symlink/reparse point fora da raiz e qualquer path do cliente.
- Hash verificado antes de cada execução.
- Scripts e catálogo protegidos por ACL; worker pode ler/executar, não escrever.
- `parameterSchema` fechado, equivalente a `additionalProperties: false`, com limites e enums.
- Na v1 não há destino de rede ou path arbitrário como parâmetro.
- Saída é JSON e precisa obedecer ao `outputSchema` antes da persistência.
- `enabled = false` impede novos jobs; jobs pendentes são revalidados ao executar.
- `requiresElevation = true` bloqueia a ação, mesmo se `enabled = true`.

## 8. Execução PowerShell segura

- Processo por job ou isolamento equivalente verificável.
- Conta Windows dedicada ou usuário local sem privilégio administrativo.
- Executável por caminho absoluto aprovado.
- `shell: false` e argumentos em array.
- `-NoProfile` e `-NonInteractive`.
- Sem `-Command` derivado de input, concatenação de linha ou script temporário.
- Working directory fixo, stdin fechado e ambiente mínimo/sanitizado.
- Timeout encerra toda a árvore de processos.
- Cancelamento, concorrência baixa, fila limitada e backpressure.
- Limites independentes de stdout/stderr e `maxOutputBytes` combinado.
- Exit code, duração, bytes, registros e redactions auditados.
- Event Logs limitados a System/Application, janela temporal, paginação e máximo de eventos.
- Gateway e DNS são obtidos da configuração local; ping/DNS arbitrário fica fora da v1.

Execution Policy é camada complementar, não fronteira de segurança. Constrained Language Mode somente será considerado quando imposto por política confiável do Windows; não será simulado dentro do próprio processo.

## 9. Validação da API

- Namespace `/api/v1`.
- Schemas Zod `.strict()` para params, query e body.
- DTOs explícitos; `req.body` nunca segue diretamente ao Prisma.
- UUIDs canônicos, enums, comprimentos, ranges e paginação máxima.
- Sort/filter por campos allowlisted.
- Máquina de estados validada no domínio.
- `Ticket.version` impede lost updates; conflitos respondem `409`.
- Idempotency key para diagnóstico, escalada e export.
- Body limit e rate limit específico para ações caras.
- Problem Details externo sem stack trace.
- React renderiza mensagens como texto; `dangerouslySetInnerHTML` não será usado para comentários ou logs.
- CSV neutraliza células iniciadas por `=`, `+`, `-` ou `@`.

## 10. AuditEvent

AuditEvent é append-only:

- Sem endpoint ou repository method de update/delete.
- Mutação e auditoria compartilham transação quando aplicável.
- Ação sensível falha fechada se auditoria obrigatória não puder ser persistida.
- Campos: timestamp UTC, ator/tipo/papel snapshot, ação, recurso/id, resultado/motivo, requestId, correlationId, origem minimizada e campos alterados com redaction.
- Diagnóstico adiciona actionId, versão/hash, duração, exit code, contagem de bytes/registros e redactions.
- Login, falha, logout, acesso negado, conflito concorrente, mutação, export, diagnóstico e escalada são auditados.
- Senha, cookie, token, connection string e payload sensível nunca entram no evento.
- CR/LF e caracteres de controle são tratados para impedir log forging.

Integridade futura por hash encadeado será um ADR próprio quando necessária. A arquitetura admite `previousHash`, `eventHash`, canonicalização e âncoras sem alterar eventos históricos. Isso não está implementado na v1 e não há alegação de tamper-proof.

## 11. Retenção e privacidade

Defaults configuráveis da v1:

| Dado | Retenção | Segurança e descarte |
|---|---:|---|
| WindowsEvent | 30 dias | limite de coleta, sanitização e purge em lotes |
| DiagnosticResult detalhado | 90 dias | metadados mínimos do job por até 365 dias; hold quando virar evidência |
| Arquivo exportado | 7 dias | nome não previsível, ACL e remoção automática |
| Metadados de ExportJob | 90 dias | sem conteúdo exportado |
| Logs operacionais | 30 dias | rotação por tempo/tamanho e redaction |
| AuditEvent | mínimo 365 dias | sem purge pela aplicação v1; arquivamento governado futuro |

Purga é idempotente, limitada por tipo e auditada por intervalo/contagem. Não copia o conteúdo removido para auditoria e não apaga TicketHistory ou entidades referenciadas. Legal hold poderá suspender a purga no futuro.

PII, hostnames, IPs, MACs, paths de perfil e mensagens de Event Log são minimizados por contexto. Portfolio Demo não contém nenhum deles em formato real. SQLite e diretórios de storage terão ACL local; criptografia em repouso e cofre de segredos serão decisões de produção posteriores.

## 12. Transactional Outbox e integrações

- Mudança de domínio, AuditEvent e IntegrationOutbox são atômicos quando pertencem à mesma ação.
- Envelope: `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `source`, `correlationId`, `idempotencyKey`, payload mínimo.
- Dispatcher preparado para entrega at-least-once; consumidores devem ser idempotentes.
- Retry conserva o mesmo `eventId`.
- Claim concorrente, backoff, limite de tentativas e dead-letter implementados.
- Sistemas externos nunca acessam SQLite diretamente.
- TLS, credencial M2M, rotação, egress allowlist e prevenção de replay antes de habilitar destinos.
- Nenhum token de operador será reutilizado como credencial de integração.

## 13. Threat model resumido

| Ameaça | Nível | Controle v1 | Risco residual |
|---|---:|---|---|
| RCE/injeção PowerShell | Crítico | catálogo fechado, schemas, sem shell/eval | comprometimento local do catálogo |
| Adulteração de script/manifesto | Crítico | ACL e SHA-256 por execução | administrador local pode alterar ambos |
| Escalada de privilégio do worker | Crítico | conta sem admin e `requiresElevation=false` | comprometimento do host |
| RBAC/IDOR | Alto | autorização ação+recurso e testes negativos | sessão válida comprometida |
| Lost update entre técnicos | Alto | optimistic locking e `409` | usuário precisa reconciliar conflito |
| CSRF/session theft | Alto | cookies seguros, CSRF, Origin e rate limit | navegador/host comprometido |
| DoS por logs/processo/saída | Alto | limites, fila, timeout e kill-tree | provider Windows lento |
| Stored XSS/log injection | Alto | render como texto, CSP e logging estruturado | conteúdo hostil ainda exige cuidado |
| Vazamento em export/log/result | Alto | autorização, redaction, ACL e retenção | acesso local ao host |
| Replay/dupla execução | Alto | idempotency key, claim atômico e estados | falha durante confirmação |
| CSV formula injection | Alto | neutralização de prefixos perigosos | consumidor externo pode transformar arquivo |
| SQLite/file theft | Alto | loopback, ACL e minimização | sem criptografia de campo na v1 |
| DNS rebinding/proxy incorreto | Alto | bind loopback, Origin exata, CORS e `trust proxy` desligado | futura exposição exige reverse proxy/TLS e novo threat model |
| Supply chain | Alto | lockfile, SCA, versões fixadas e CI | dependência legítima comprometida |
| Duplicidade/exfiltração do outbox | Alto | idempotência e payload mínimo | destino futuro comprometido |

O threat model detalhado e testes adversariais serão produzidos antes de habilitar diagnósticos na Fase 4.

## 14. Gates de segurança e risco residual

- A release é bloqueada por qualquer finding Critical ou High aberto.
- Catálogo, hash, traversal, action disabled, schema, timeout, output overflow, kill-tree e audit failure têm testes automatizados/operacionais.
- A ausência de rota `/exec`, `Invoke-Expression`, shell composto, WinRM, elevação e remediação é verificada estaticamente.
- Contratos, idempotência, minimização, retry e dead-letter são testados; adapters incompatíveis ficam desabilitados.
- TLS, reverse proxy, secret manager, autenticação M2M, egress controlado e live PostgreSQL são pré-requisitos de produção, não capacidades desta release local.
- Leitor de tela externo, DAST independente e teste sob proxy TLS permanecem riscos informacionais documentados.

## 15. Referências arquiteturais

- [ADR-003 — Diagnostics Worker Isolation](docs/adr/ADR-003-diagnostics-worker-isolation.md)
- [ADR-004 — PowerShell Allowlist Model](docs/adr/ADR-004-powershell-allowlist-model.md)
- [ADR-005 — Transactional Outbox](docs/adr/ADR-005-transactional-outbox.md)
- [ADR-006 — Authentication and RBAC](docs/adr/ADR-006-authentication-and-rbac.md)
