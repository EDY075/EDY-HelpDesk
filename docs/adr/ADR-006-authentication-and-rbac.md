# ADR-006 — Authentication and RBAC

- **Status:** Aceito
- **Data:** 2026-08-28

## Contexto

Papéis controlados pelo frontend ou por headers não autenticados permitem falsificação. O HelpDesk contém tickets, ativos, diagnósticos, evidências e exports com diferentes sensibilidades, exigindo identidade revogável e autorização por recurso.

## Decisão

Usar autenticação por sessão server-side e cookies seguros. Senhas locais serão protegidas com Argon2id; mutações usarão proteção CSRF. Autorização será deny-by-default, baseada em permissões, ação e escopo do recurso.

Papéis iniciais:

- **Admin:** contas, papéis, configuração, SLA, auditoria, integrações e operação integral.
- **Technician:** tickets, comentários, ativos e diagnósticos allowlisted no escopo, escalada e exports permitidos.
- **Viewer:** leitura autorizada, sem mutações, diagnósticos, export, auditoria global ou configurações.

Identidade, autoria e papel vêm exclusivamente da sessão validada. Middleware e serviços de aplicação autorizam; listagens filtram por escopo. Mudança de papel, login, falha, logout, acesso negado, export, diagnóstico e mutações são auditados.

## Consequências

### Positivas

- Sessões podem ser revogadas e papéis não são forjáveis pelo cliente.
- Autorizações horizontais ficam explícitas e testáveis.
- `DiagnosticAction.requiredPermission` integra-se ao mesmo modelo.

### Negativas

- Sessão exige armazenamento, expiração e limpeza.
- Cookies autenticados exigem CSRF e política rigorosa de Origin.
- A matriz de permissões precisa acompanhar novas rotas e módulos.

## Alternativas consideradas

- **Papel em header/body:** rejeitado por spoofing.
- **Autorização somente na UI:** rejeitada.
- **JWT em localStorage:** rejeitado pela exposição a XSS e revogação mais difícil.
- **API key humana compartilhada:** rejeitada por ausência de identidade individual.

## Riscos e revisão

Sessão de técnico comprometida ainda permite ações no escopo. Rate limit, reautenticação para ações críticas, expiração, auditoria e testes negativos reduzem o risco. OIDC poderá substituir autenticação local futuramente sem alterar o modelo de autorização.
