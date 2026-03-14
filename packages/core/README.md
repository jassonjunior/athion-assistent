# @athion/core

Biblioteca TypeScript que implementa o núcleo do Athion Assistent: orquestrador principal, sistema de subagentes, gerenciamento de tokens e indexação semântica do codebase. É consumida pelo CLI, pela extensão VS Code e pelo app desktop.

## Módulos

| Módulo         | Caminho             | Responsabilidade                                                |
| -------------- | ------------------- | --------------------------------------------------------------- |
| `config`       | `src/config/`       | Carrega e mescla configuração de 5 fontes (defaults → CLI args) |
| `bus`          | `src/bus/`          | Event bus pub/sub com validação Zod                             |
| `provider`     | `src/provider/`     | Camada de abstração sobre múltiplos LLM providers (AI SDK v6)   |
| `tools`        | `src/tools/`        | Registry de ferramentas + 5 tools nativas + `task` tool         |
| `permissions`  | `src/permissions/`  | Controle allow/ask/deny por glob, scopes session e remember     |
| `skills`       | `src/skills/`       | Carrega arquivos `.md` de skills com metadados e triggers       |
| `tokens`       | `src/tokens/`       | Gerenciamento de contexto e compactação                         |
| `orchestrator` | `src/orchestrator/` | Loop de chat multi-turn com streaming e tool dispatch           |
| `subagent`     | `src/subagent/`     | Execução isolada de agentes especializados via `task` tool      |
| `indexing`     | `src/indexing/`     | Indexação FTS5 + vetorial do codebase                           |
| `plugins`      | `src/plugins/`      | Carregamento dinâmico de plugins externos                       |
| `storage`      | `src/storage/`      | SQLite via `bun:sqlite` + drizzle-orm (sessões, mensagens)      |

## API Pública

### `bootstrap(options)`

Inicializa todos os módulos na ordem correta e retorna uma instância `AthionCore` pronta para uso.

```typescript
import { bootstrap } from '@athion/core'

const core = await bootstrap({
  dbPath: '~/.athion/data.db',
  workspacePath: process.cwd(), // habilita indexação do codebase
  cliArgs: {
    provider: 'vllm-mlx',
    model: 'qwen3-coder-reap-40b-a3b',
  },
})

for await (const event of core.orchestrator.chat(sessionId, { content: 'hello' })) {
  if (event.type === 'content') process.stdout.write(event.content)
}
```

### Interface `AthionCore`

| Propriedade    | Tipo                      | Descrição                                           |
| -------------- | ------------------------- | --------------------------------------------------- |
| `bus`          | `Bus`                     | Event bus global                                    |
| `config`       | `ConfigManager`           | get/set/reload de configurações                     |
| `provider`     | `ProviderLayer`           | streamChat + generateText para qualquer provider    |
| `skills`       | `SkillManager`            | Registro e busca de skills por trigger              |
| `tools`        | `ToolRegistry`            | Register/resolve/execute de tools                   |
| `plugins`      | `PluginManager`           | Plugins dinâmicos carregados de `~/.athion/plugins` |
| `subagents`    | `SubAgentManager`         | Spawn e registry de subagentes                      |
| `orchestrator` | `Orchestrator`            | `chat()` AsyncGenerator principal                   |
| `permissions`  | `PermissionManager`       | Verifica e persiste decisões de permissão           |
| `vllm`         | `VllmManager`             | Gerencia processo vllm-mlx local                    |
| `proxy`        | `ProxyServer \| null`     | Proxy HTTP com safety-guard e compressão            |
| `indexer`      | `CodebaseIndexer \| null` | Indexador (disponível se `workspacePath` fornecido) |

## Providers Suportados

| ID           | Descrição                            |
| ------------ | ------------------------------------ |
| `vllm-mlx`   | Modelo local via MLX (Apple Silicon) |
| `ollama`     | Modelos locais via Ollama            |
| `openai`     | GPT-4o e derivados                   |
| `anthropic`  | Claude 3.5/3.7                       |
| `google`     | Gemini Pro/Flash                     |
| `openrouter` | Roteador multi-provider              |

## Token Manager

Estratégias de compactação ativadas automaticamente ao atingir 90% da janela de contexto (padrão: 50K tokens):

- **`summarize`** (padrão): chama o LLM para gerar um resumo estruturado das mensagens antigas, preservando decisões, paths e erros.
- **`sliding-window`**: descarta mensagens mais antigas, mantendo as N mais recentes.
- **`truncate`**: trunca o conteúdo das mensagens individualmente.

**Mensagens fixadas** (pinned): prefixar o conteúdo com `[PINNED]\n` garante que a mensagem nunca seja removida nem resumida durante a compactação.

## Codebase Intelligence

Sistema de indexação hierárquica 5 níveis com busca semântica, enriquecimento LLM e re-indexação reativa.

### Arquitetura

```
FileWatcher ──► IndexQueue ──► CodebaseIndexer ──► VectorStorePort (Qdrant/SQLite)
                    │                  │                    │
                    │            TextSearchPort         DualWriteManager
                    │                  │                    │
                Event Bus ◄──── IndexMetrics         Reconciliation
```

### Índice Hierárquico (L0-L4)

| Nível | Nome             | Descrição                             | Geração     |
| ----- | ---------------- | ------------------------------------- | ----------- |
| L0    | `repo_meta`      | Linguagem, framework, arquitetura     | LLM (1x)    |
| L1    | `modules`        | Propósito e API pública por diretório | LLM         |
| L2    | `file_summaries` | Propósito, exports por arquivo        | LLM         |
| L3    | `symbols`        | Chunks de código (funções, classes)   | Tree-sitter |
| L4    | `patterns`       | Convenções, naming, anti-patterns     | LLM         |

### Context Builder

O `ContextAssembler` monta prompts hierárquicos com budget de tokens:

1. **L0** (repo_meta) — sempre incluído (~200 tokens)
2. **L4** (patterns) — sempre incluído (~300 tokens)
3. **Impact Analysis** — se DependencyGraph disponível
4. **L2** (file summaries) — arquivos relevantes
5. **L3** (symbols) — chunks de código
6. **Task** — instrução do usuário

### Busca Multi-Nível

- **FTS5**: trigram tokenizer para busca por palavras-chave
- **Vector Search**: cosine similarity via Qdrant (HNSW) ou SQLite (brute-force)
- **Hybrid**: FTS(40%) + Vector(60%) com re-ranking
- `search_codebase` retorna `contextBundle` com L0+L4+L2

### File Watcher

Re-indexação reativa via `CodebaseWatcher`:

- Debounce 1.5s por arquivo (editores fazem múltiplos writes)
- `IndexQueue` com concorrência limitada (default: 2)
- Eventos via Bus: `file_changed`, `indexing_started/completed/failed`
- `IndexMetrics` agrega estatísticas (filesProcessed, avgDurationMs, failureRate)

### Configurações

| Config                             | Default                 | Descrição                    |
| ---------------------------------- | ----------------------- | ---------------------------- |
| `codebaseVectorStoreType`          | `sqlite`                | `sqlite` ou `qdrant`         |
| `codebaseQdrantUrl`                | `http://localhost:6333` | URL do Qdrant                |
| `codebaseEnrichmentEnabled`        | `true`                  | Enriquecimento LLM (L0-L4)   |
| `codebaseEnrichmentMaxConcurrency` | `1`                     | Concorrência de enrichment   |
| `codebaseWatcherEnabled`           | `true`                  | File watcher reativo         |
| `codebaseWatcherDebounceMs`        | `1500`                  | Debounce do watcher          |
| `codebaseContextBudgetTokens`      | `8000`                  | Budget de tokens do contexto |

### Variáveis de Ambiente

```bash
ATHION_EMBEDDING_URL=http://localhost:1234  # Endpoint OpenAI-compatible para embeddings
ATHION_EMBEDDING_MODEL=nomic-embed-text     # Modelo de embeddings (default)
```

## Instalação

```bash
bun add @athion/core
```

Requisito: **Bun >= 1.0** (usa `bun:sqlite` nativo).
