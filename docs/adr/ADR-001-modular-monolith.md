# ADR-001 — Modular Monolith

- **Status:** Aceito
- **Data:** 2026-08-28

## Contexto

O EDY HelpDesk precisa entregar fluxos reais de Service Desk sem assumir a complexidade operacional de microserviços. Tickets, SLA, ativos, diagnósticos, auditoria e integrações têm limites de domínio próprios, mas inicialmente compartilham equipe, implantação e persistência.

## Decisão

Adotar um monólito modular em monorepo, local-first, com módulos de domínio isolados por contratos. Web, API e Diagnostics Worker serão processos separados; essa separação de processo não transforma o sistema em microserviços.

Dependências entre módulos passam por serviços de aplicação, contratos ou eventos. O dashboard consulta dados persistidos reais. A API será versionada em `/api/v1` e ligada a localhost por padrão.

## Consequências

### Positivas

- Menor custo operacional e cognitivo na v1.
- Transações consistentes entre domínio, auditoria e outbox.
- Fluxo completo demonstrável em portfólio.
- Fronteiras preparadas para extração futura quando houver evidência de necessidade.

### Negativas

- Falha da API afeta vários módulos.
- Disciplina arquitetural é necessária para evitar acoplamento por tabelas.
- Escala ocorre inicialmente como unidade única, exceto pelo worker separado.

## Alternativas consideradas

- **Microserviços desde o início:** rejeitados por complexidade, deploy e observabilidade prematuros.
- **Aplicação sem módulos:** rejeitada por acoplamento e dificuldade de evolução para o ecossistema EDY.
- **Serverless por função:** rejeitado para o cenário local Windows e jobs diagnósticos controlados.

## Critérios de revisão

Reavaliar somente se um módulo tiver requisitos independentes comprovados de escala, segurança, disponibilidade ou equipe. Extração não poderá quebrar contratos versionados nem a atomicidade necessária do outbox.
