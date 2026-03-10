# Arquitetura do Athion Assistent

## Visão Geral

O Athion Assistent é um assistente de codificação com IA baseado em uma arquitetura **orquestrador + subagentes**. O núcleo (`@athion/core`) roda como um processo Bun separado e é acessado pelas três interfaces via JSON-RPC stdio.

```
┌────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                          │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │   @athion/cli   │  │  @athion/vscode  │  │ @athion/desktop │   │
│  │   (Ink TUI)     │  │ (Webview React)  │  │ (Tauri + React) │   │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
└───────────┼─────────────────── ┼ ─────────────────── ┼ ──────────┘
            │  JSON-RPC stdio    │  JSON-RPC stdio      │  JSON-RPC stdio
            ▼                    ▼                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                         TRANSPORT LAYER                            │
│                                                                    │
│              "athion serve" — Sidecar Bun (JSON-RPC)               │
│         (spawned via shell plugin / BunBridge / node spawn)         │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                           CORE LAYER                               │
│                       @athion/core (Bun)                           │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Orchestrator │  │ Provider     │  │ Tool Registry            │ │
│  │ (chat loop)  │  │ Layer        │  │ (5 nativas + task + idx) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘ │
│         │                 │                                        │
│  ┌──────▼───────┐  ┌──────▼──────────────────────────────────────┐│
│  │ SubAgent     │  │ Providers: vllm-mlx | ollama | openai       ││
│  │ Manager      │  │           anthropic | google | openrouter   ││
│  └──────────────┘  └─────────────────────────────────────────────┘│
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Permission   │  │ Token        │  │ Skill Manager            │ │
│  │ Manager      │  │ Manager      │  │ (7 skills .md builtin)   │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                         STORAGE LAYER                              │
│                                                                    │
│  ┌────────────────────────────┐  ┌────────────────────────────┐   │
│  │   data.db (bun:sqlite)     │  │   index.db (bun:sqlite)    │   │
│  │   drizzle-orm              │  │   FTS5 + vector BLOB       │   │
│  │   sessions, messages,      │  │   chunks, embeddings       │   │
│  │   permissions              │  │   (codebase indexer)       │   │
│  └────────────────────────────┘  └────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

## Camadas do Sistema

### 1. Presentation Layer

| Interface         | Stack                           | Comunicação com Core                  |
| ----------------- | ------------------------------- | ------------------------------------- |
| CLI               | Bun + Ink (React no terminal)   | Chama `bootstrap()` diretamente       |
| VS Code Extension | TypeScript + React (webview)    | `BunBridge` → `athion serve` stdio    |
| Desktop           | Tauri 2 + React 19 + Tailwind 4 | Plugin `shell` → `athion serve` stdio |

### 2. Transport Layer

Todas as interfaces (exceto CLI direto) spawnaam `athion serve`, que expõe o core via **JSON-RPC 2.0 sobre stdio**. O protocolo define métodos como `chat.send`, `chat.event`, `codebase.index`, `codebase.search`, `sessions.list`, entre outros.

### 3. Core Layer

O core é inicializado por `bootstrap()` e retorna `AthionCore`. Os módulos principais são:

- **Orchestrator**: gerencia o loop de chat multi-turn com streaming.
- **ProviderLayer**: abstração sobre AI SDK v6 para múltiplos LLMs.
- **ToolRegistry**: registro e execução de ferramentas com validação Zod.
- **PermissionManager**: controla quais tools o modelo pode invocar (allow/ask/deny/remember).
- **SubAgentManager**: spawna subagentes isolados para tasks especializadas.
- **TokenManager**: monitora uso do contexto e compacta quando necessário.

### 4. Storage Layer

| Banco      | Arquivo              | Conteúdo                                   |
| ---------- | -------------------- | ------------------------------------------ |
| `data.db`  | `~/.athion/data.db`  | Sessões, mensagens, permissões persistidas |
| `index.db` | `~/.athion/index.db` | Chunks de código, FTS5 index, vetores blob |

## Fluxo de Dados — Chat

```
1. Usuário digita mensagem no InputArea
         │
         ▼
2. sendMessage() → RPC: chat.send { sessionId, content }
         │
         ▼
3. Core Orchestrator.chat(sessionId, message)
   ├── prepareChat(): carrega histórico do banco
   ├── buildPrompt(): skills + tools + context
   └── runStreamTurn(): chama Provider.streamChat()
         │
         ▼
4. Provider.streamChat() → AsyncGenerator<StreamEvent>
   Eventos emitidos: content | tool_call | usage | finish
         │
         ▼
5. Orchestrator transforma StreamEvent → OrchestratorEvent
   e emite via JSON-RPC notification: chat.event { type, ... }
         │
         ▼
6. UI recebe notificação → atualiza estado → re-render
```

## Fluxo de Tool Calls

```
1. LLM emite evento tool_call { name: "task", input: { agent, description } }
         │
         ▼
2. Orchestrator → ToolDispatcher.dispatch(toolName, args)
         │
         ▼
3. PermissionManager.check(toolName, args)
   ├── Regra de sessão encontrada  → allow/deny imediato
   ├── Regra persistente encontrada → allow/deny imediato
   └── Nenhuma regra               → retorna "ask"
         │
         ▼
4. Se "ask" → onPermissionRequest callback → UI exibe prompt
   Usuário responde: y (once) | s (session) | r (remember) | n (deny)
         │
         ▼
5. Tool executa (ex: SubAgentManager.spawn() para a "task" tool)
         │
         ▼
6. Tool result → adicionado ao histórico de mensagens
         │
         ▼
7. Próximo turno do LLM com o resultado da tool no contexto
```

## Módulos do Core

| Módulo                | Arquivo principal                  | Responsabilidade                                                   |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `config`              | `src/config/config.ts`             | Merge de 5 fontes: defaults → global → project → env → CLI         |
| `bus`                 | `src/bus/bus.ts`                   | Pub/sub com validação Zod e tipagem forte dos eventos              |
| `storage`             | `src/storage/db.ts`                | CRUD de sessões, mensagens e permissões via drizzle-orm            |
| `provider`            | `src/provider/provider.ts`         | `streamChat()` + `generateText()` sobre AI SDK v6                  |
| `tools`               | `src/tools/registry.ts`            | `register()`, `resolve()`, `execute()` com schema Zod              |
| `permissions`         | `src/permissions/permissions.ts`   | Glob matching, 3 níveis de prioridade, scope session/remember      |
| `skills`              | `src/skills/manager.ts`            | Carrega `.md`, extrai metadados, busca por trigger                 |
| `tokens`              | `src/tokens/manager.ts`            | Estima tokens, detecta loop, compacta (summarize/sliding/truncate) |
| `orchestrator`        | `src/orchestrator/orchestrator.ts` | Loop while multi-turn, forceTextOnly, loop detection               |
| `subagent`            | `src/subagent/agent.ts`            | Chat loop isolado, continuation protocol (até 5 continuações)      |
| `indexing`            | `src/indexing/manager.ts`          | FileWalker + Chunker + FTS5 + vector similarity                    |
| `plugins`             | `src/plugins/`                     | Carrega plugins externos de `~/.athion/plugins`                    |
| `server/proxy`        | `src/server/proxy/proxy.ts`        | Proxy HTTP com safety-guard e compressão de contexto               |
| `server/vllm-manager` | `src/server/vllm-manager.ts`       | Gerencia ciclo de vida do processo vllm-mlx                        |

## Subagentes Builtin

O orquestrador principal delega tasks especializadas para 7 subagentes, cada um com um conjunto restrito de tools:

| Subagente       | Tools Principais                                             |
| --------------- | ------------------------------------------------------------ |
| `search`        | `search_codebase`, `read_file`, `list_files`, `search_files` |
| `coder`         | `search_codebase`, `read_file`, `write_file`, `run_command`  |
| `code-reviewer` | `search_codebase`, `read_file`, `list_files`                 |
| `refactorer`    | `search_codebase`, `read_file`, `write_file`                 |
| `explainer`     | `search_codebase`, `read_file`, `list_files`                 |
| `test-writer`   | `search_codebase`, `read_file`, `write_file`                 |
| `debugger`      | `search_codebase`, `read_file`, `write_file`, `run_command`  |

O orquestrador principal recebe apenas a `task` tool, forçando-o a sempre delegar para um subagente especializado em vez de agir diretamente.
