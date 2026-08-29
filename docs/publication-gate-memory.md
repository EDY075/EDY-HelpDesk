# Publication Gate Memory

## MEMORY: jr — 2026-08-29

### O que foi feito

Gate local de licença e publicação da versão 1.0.0, sem Git ou publicação remota.

### Decisões importantes

- Licença oficial: MIT, aviso `Copyright (c) 2026 Edmilson Gomes`.
- Todos os packages first-party permanecem privados, com metadata `1.0.0 / MIT`.
- README apresenta quatro screenshots principais; o conjunto público completo fica limitado a oito.
- Três screenshots não selecionados e sem referências foram preservados em `archive/screenshots/release-1.0.0-unselected/`.
- A autorização técnica não substitui a autorização explícita do proprietário para publicar.

### Problemas encontrados

- O secret scan inicialmente classificou o nome do titular no copyright como dado pessoal proibido.

### Soluções aplicadas

- Exceção delimitada somente à linha jurídica exata `Copyright (c) 2026 Edmilson Gomes`, mantendo as demais detecções.
- Privacy scan separado confirmou zero paths ou identificadores locais no conjunto publicável.

### Pendências / Follow-up

- Publicação, criação de repositório, commit, push e GitHub Release continuam fora deste gate.
- PostgreSQL ao vivo, TLS/proxy, secret manager e integrações externas permanecem limites conhecidos.

### Arquivos afetados

- `LICENSE`
- `README.md`
- `package.json`
- `package-lock.json`
- `apps/*/package.json`
- `packages/*/package.json`
- `docs/RELEASE-NOTES-1.0.0.md`
- `docs/PUBLICATION-GATE-REPORT.md`
- `scripts/secret-scan.mjs`
- `archive/screenshots/release-1.0.0-unselected/`
