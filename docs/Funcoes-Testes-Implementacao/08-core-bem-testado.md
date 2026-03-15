# Core: Modulos Bem Testados (Referencia)

## Modulos com Cobertura Excelente

Estes modulos ja possuem cobertura adequada e servem como referencia de qualidade.

### 1. Bus/Events - 25 testes

**Arquivos**: bus.ts, events.ts
**Cobertura**: Excelente

- Criacao, publish, subscribe, once, unsubscribe, clear
- Validacao Zod de schemas
- Eventos de todas as fases (FileChanged, IndexingStarted/Completed/Failed, MCP, Workspace, Remote)

### 2. Dependency Graph - 27 testes

**Arquivo**: dependency-graph.ts
**Cobertura**: Muito robusta

- Adicao de dependencias
- Deteccao de ciclos
- Calculo de metricas
- Grafos complexos

### 3. Storage/DB - 22 testes

**Arquivo**: storage/db.ts
**Cobertura**: Completa

- CRUD de sessoes, mensagens, projetos
- Cascade delete
- Listagem com filtros

### 4. Token Manager - 22 testes

**Arquivo**: tokens/manager.ts
**Cobertura**: Completa

- Tracking de uso
- Budget management
- Compaction logic

### 5. Permissions - 17 testes

**Arquivo**: permissions/permissions.ts
**Cobertura**: Boa

- Check, grant, revoke
- Regras de acesso

### 6. Config Manager - 16 testes

**Arquivo**: config/config.ts
**Cobertura**: Boa

- Get, set, listeners, reload, priority merge

### 7. Indexing Adapters

- **SQLite Text Search**: 14 testes (FTS5, ranking, filtros)
- **SQLite Vector Store**: 15 testes (insert, search, similarity)
- **Vector Store Contract**: 6 testes (validacao de implementacoes)
- **Context Builder**: 12 testes (token budgeting, assembly)
- **Context Formatters**: 14 testes (formatacao L0-L4)

### 8. Provider Layer - 23 testes

- **Provider**: 10 testes (listProviders, listModels, streamChat)
- **Model Swap**: 10 testes + 3 benchmarks

### 9. SubAgent - 13 testes

**Arquivo**: subagent/agent.ts

- Lifecycle (start, complete)
- Content streaming
- Abort handling
- Error handling
- Search Protocol injection
- Nudge mechanism
- MaxTurns limit

### 10. Tools Registry - 15 testes

**Arquivo**: tools/registry.ts

- Register, get, list, has

### 11. Skills Parser - 10 testes

**Arquivo**: skills/parser.ts

- Parsing de schemas de skills

### 12. Outros Modulos Indexing Testados

- **E2E Pipeline**: 7 testes
- **Indexing E2E**: 7 testes
- **Index Queue**: 6 testes
- **Index Metrics**: 7 testes
- **Manager**: 9 testes
- **Pipeline**: 8 testes
- **Enricher**: 14 testes
- **Watcher**: 6 testes
- **Workspace Registry**: 12 testes
- **LLM Priority Queue**: 4 testes
- **Remote Fetcher**: 10 testes
- **Result**: 16 testes
- **Retrieval Cache**: 9 testes
- **Tree-Sitter Languages**: 11 testes
- **Vector Store Chain**: 7 testes
- **Cross-Workspace Search**: 6 testes

## Padroes de Qualidade Observados

Estes modulos demonstram:

- Uso consistente de Vitest (describe, it, expect, vi)
- Factory patterns para mocks (makeSession, makeDeps, makeConfig)
- E2E com fixtures reais (arquivos temporarios)
- Contract tests para validar implementacoes
- Cleanup automatico (beforeEach/afterEach)
- Mocking de dependencias externas
- Comentarios estruturados
- Testes determinísticos

Usar como referencia ao criar novos testes.
