# LOCALIZATION & THEMES — PROJECT MEMORY

## MEMORY: VULCAN / ORION / QA — 2026-08-29

### O que foi feito

Implementação e validação do passe final de localização pt-BR/en e dos temas Operations/Dark no EDY HelpDesk.

### Decisões importantes

- pt-BR é o idioma inicial determinístico quando não há preferência salva; English é o fallback.
- i18next/react-i18next organiza oito namespaces de tradução.
- A compatibilidade das telas legadas é centralizada em um localization boundary, sem espalhar condicionais de idioma.
- Operations permanece o tema principal; Dark altera somente design tokens.
- Conteúdo sintético persistido pode permanecer no idioma base; UI, labels e mensagens do sistema são localizados.
- Identificadores, enums persistidos, evidência bruta e termos técnicos permanecem estáveis.

### Problemas encontrados

- E2E anterior assumia inglês como idioma inicial.
- Formatadores residuais fixavam locale `en`.
- Contadores compostos, enums e labels de módulos antigos tinham lacunas de pt-BR.
- O contraste de `--text-muted` no Dark era 4.27:1.

### Soluções aplicadas

- Preferências persistentes com atualização de `html lang` e `data-theme`.
- Formatadores compartilhados baseados em `Intl`.
- Catálogo pt-BR profissional com 771 frases registradas.
- Matriz E2E ampliada para 50 testes e Responsive QA para 434 verificações.
- `--text-muted` Dark ajustado para contraste 4.58:1.

### Pendências / Follow-up

- Nenhuma pendência funcional deste passe.
- Publicação continua proibida até decisão explícita no Final Release Review.

### Arquivos afetados

- `apps/web/src/i18n/`
- `apps/web/src/locales/`
- `apps/web/src/components/`
- `apps/web/src/pages/`
- `apps/web/src/styles.css`
- `tests/e2e/`
- `README.md`
- `docs/LOCALIZATION-THEMES-FINAL-REPORT.md`
- `docs/screenshots/localization-themes/`
