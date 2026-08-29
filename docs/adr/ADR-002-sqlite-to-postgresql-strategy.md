# ADR-002 — SQLite to PostgreSQL Strategy

- **Status:** Aceito
- **Data:** 2026-08-28

## Contexto

SQLite reduz a barreira para executar o portfólio localmente, mas concorrência, operação multiusuário e crescimento futuro podem exigir PostgreSQL. Prisma ajuda na portabilidade, porém não elimina diferenças de tipos, collations, JSON, concorrência e funções SQL.

## Decisão

Usar SQLite inicialmente e tratar PostgreSQL como migração planejada, nunca automática no startup.

- Acesso por Prisma e repositórios; o domínio não depende de SQL específico.
- UUIDs independentes de autoincremento.
- Timestamps UTC e durações inteiras.
- Schemas JSON validados na aplicação; texto JSON no SQLite poderá virar `jsonb`.
- Códigos humanos por `SequenceCounter` transacional.
- Migrations versionadas; `db push` não será estratégia de produção.
- SQLite com foreign keys, transações curtas e avaliação de WAL/`busy_timeout`.
- Antes da troca: suíte PostgreSQL, ensaio, contagens, integridade referencial, checksums lógicos e rollback.

## Consequências

### Positivas

- Instalação local simples e custo inicial zero.
- Modelo preparado para uma mudança verificável.
- Incompatibilidades aparecem em testes, não por suposição.

### Negativas

- Algumas capacidades específicas do PostgreSQL serão adiadas.
- Testar dois bancos aumenta o trabalho na fase de migração.
- SQLite continua sujeito a locks e proteção baseada no arquivo local.

## Alternativas consideradas

- **PostgreSQL desde o início:** rejeitado pelo custo operacional para a fundação local.
- **SQLite permanente:** rejeitado por limitar evolução multiusuário.
- **Migração automática ao iniciar:** rejeitada pelo risco de perda e rollback difícil.

## Riscos e revisão

Reavaliar quando concorrência, volume, disponibilidade ou integração exigirem servidor de banco. A migração só será aprovada com backup, dry-run, reconciliação e rollback ensaiados.
