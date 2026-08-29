# ADR-004 — PowerShell Allowlist Model

- **Status:** Aceito
- **Data:** 2026-08-28

## Contexto

Receber comandos, scripts, paths ou argumentos livres transformaria o HelpDesk em terminal remoto e criaria risco crítico de RCE. Diagnóstico real precisa ser reproduzível, revisável e limitado.

## Decisão

Adotar catálogo controlado pelo servidor, representado por `DiagnosticAction`:

- `actionId`, `name`, `category`, `version`.
- `scriptPath` interno e `scriptHash` SHA-256.
- `requiredPermission`.
- `parameterSchema`, `outputSchema`.
- `timeoutMs`, `maxOutputBytes`.
- `requiresElevation`, `enabled`.

A única interface do cliente é `actionId`, `assetId` e parâmetros previstos pelo schema. O cliente nunca define `scriptPath`, executável, hash, timeout ou argumentos internos.

Versões publicadas são imutáveis. O worker valida hash antes de executar, restringe o path a uma raiz fixa e falha fechado para ação desconhecida, desabilitada, elevada, adulterada ou com schema inválido. `requiresElevation=false` é uma invariável da v1.

## Consequências

### Positivas

- Reduz drasticamente superfície de command injection.
- Cada resultado possui proveniência de ação/versão/hash.
- Novas ações passam por revisão e teste explícitos.

### Negativas

- Menor flexibilidade para diagnósticos improvisados.
- Alterar script ou schema exige nova versão do catálogo.
- ACL e verificação de integridade precisam ser operadas corretamente.

## Alternativas consideradas

- **Comando livre:** rejeitado.
- **Path enviado pelo cliente:** rejeitado.
- **Upload de script ou template de command line:** rejeitado.
- **Allowlist por regex do comando:** rejeitada por bypass e dificuldade de composição segura.

## Riscos e revisão

Um administrador local pode adulterar catálogo e script. ACL, hash e auditoria reduzem o risco, mas não tornam um host comprometido confiável. Assinatura Authenticode e WDAC poderão ser avaliados futuramente.
