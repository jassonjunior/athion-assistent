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

## Codebase Indexer

O indexador opera em modo híbrido FTS5 + vetorial:

- **FileWalker**: percorre o workspace respeitando `.gitignore` (parser próprio, sem dependências externas).
- **Chunker**: chunking heurístico por linguagem com suporte a tree-sitter (TypeScript, Python, Rust, Go, JavaScript).
- **EmbeddingService**: chama qualquer endpoint OpenAI-compatible (`ATHION_EMBEDDING_URL`) para gerar embeddings.
- **Busca híbrida**: FTS5 (40%) + cosine similarity vetorial (60%) com re-ranking por score médio.

```bash
# Habilitar embeddings semânticos
ATHION_EMBEDDING_URL=http://localhost:1234 athion codebase index .
```

## Instalação

```bash
bun add @athion/core
```

Requisito: **Bun >= 1.0** (usa `bun:sqlite` nativo).
