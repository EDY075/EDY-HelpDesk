## MEMORY: jr — 2026-08-29

### O que foi feito

Auditoria final local de release, saneamento do escopo público, promoção de `1.0.0-rc.1` para `1.0.0`, validação completa e preparação documental sem publicação.

### Decisões importantes

- `1.0.0` está tecnicamente pronta para tag local.
- GitHub público permanece bloqueado até decisão explícita de licença.
- O navegador não deve traduzir automaticamente a UI porque `pt-BR` e `en` são idiomas nativos do produto.
- Evidências de instalação limpa e arquivos históricos permanecem em áreas ignoradas/arquivadas; nada foi apagado.

### Problemas encontrados

- Entrada órfã de ESLint no lock e seed dependente de pacote interno já compilado.
- Mensagem interna em log genérico de erro 500.
- Repositório público poderia incluir arquivos arquivados e ocultar screenshots documentais.
- Tradução automática do Chrome interferia na UI nativa.
- Drawer móvel permitia scroll do conteúdo de fundo.

### Soluções aplicadas

Lock regenerado, `predb:seed` adicionado, logging sanitizado e testado, `.gitignore` endurecido, documentação saneada, `notranslate` aplicado e scroll/foco móvel corrigidos com E2E.

### Pendências / Follow-up

- Escolher licença antes de GitHub público.
- Validar PostgreSQL ao vivo antes de alegar cutover de produção.
- Adotar rate limiting compartilhado/bounded antes de exposição multi-instância.

### Arquivos afetados

- `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `SECURITY.md`
- `.gitignore`, `package.json`, `package-lock.json`
- `apps/api/src/platform/errors.ts`, `apps/web/index.html`, `apps/web/src/components/AppShell.tsx`
- `tests/e2e/`, `scripts/secret-scan.mjs`, `docs/`
