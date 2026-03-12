# Changes Log - Athion Assistent

## Feature: LM Studio Provider com Model Swap Sequential via lms CLI (2026-03-12)

**Status**: Concluído ✅ — swap sem OOM validado

### Problema resolvido

O `mlx-omni-server` causava OOM ao usar dois modelos grandes simultaneamente (35B + 40B > memória disponível).
O `llama-cpp-manager` via `keep_alive` não funcionava com LM Studio (API não suporta keep_alive).

### Solução implementada

Criado `packages/core/src/server/lm-studio-manager.ts` que usa o CLI `lms` para swap sequencial:

1. `lms unload <modelo-anterior>` — descarrega completamente
2. `Bun.sleep(1_500)` — aguarda OS liberar memória
3. `lms load <novo-modelo>` — carrega e aguarda pronto (bloqueante)

### Melhorias no bootstrap.ts

- `setupLmStudio()` separado de `setupLlamaCpp()` — cada provider tem sua própria função
- Detecta automaticamente o modelo carregado via `GET /api/v0/models` na primeira chamada (`ensureRunning`)
- Sem `keep_alive`, sem kill+restart — swap controlado pelo LM Studio app

### Validação

```
[2026-03-12 03:07:08] === detected loaded model: qwen/qwen3.5-35b-a3b ===
[2026-03-12 03:07:19] === swapping model: qwen/qwen3.5-35b-a3b → qwen3-coder-next-reap-40b-a3b-mlx ===
[2026-03-12 03:07:19] lms unload exit=0 — "Model unloaded."
[2026-03-12 03:07:33] lms load exit=0 — "Model loaded successfully in 12.68s. (20.31 GiB)"
```

- 45+ requests ao modelo agente sem OOM ✅
- Memória máxima: 21.81 GB (apenas 1 modelo por vez) ✅

### Config atual (`~/.athion/config.json`)

```json
{
  "provider": "lm-studio",
  "model": "qwen/qwen3.5-35b-a3b",
  "orchestratorModel": "qwen/qwen3.5-35b-a3b",
  "agentModel": "qwen3-coder-next-reap-40b-a3b-mlx",
  "lmStudioPort": 1235,
  "lmStudioApiKey": "sk-lm-..."
}
```

### Arquivos alterados

- `packages/core/src/server/lm-studio-manager.ts` — CRIADO
- `packages/core/src/bootstrap.ts` — separou setupLmStudio() / setupLlamaCpp()

---

## Fix: Respostas não chegavam ao UI — dist/core desatualizado (2026-03-11)

**Status**: Corrigido ✅

### Root Cause

O `packages/core/dist/` estava desatualizado — `bootstrap.js` era a versão OLD sem a
branch `mlx-omni`, e `dist/server/mlx-omni-manager.js` não existia.
A extensão usava o dist compilado, então as requisições iam para `setupVllmAndProxy()`
em vez de `setupMlxOmni()`, causando o provider errado (não chegava resposta no chat).

### Solução

```bash
bun run --cwd packages/core build   # Gerou dist/server/mlx-omni-manager.js + bootstrap.js correto
bun run --cwd packages/cli build    # Rebuilda CLI que usa @athion/core
bun run --cwd packages/vscode build # Rebuilda extensão
# Empacotar e instalar: athion-assistent-0.1.0.vsix
```

### Confirmação

- `curl http://localhost:10240/v1/chat/completions` → responde com tokens ✅
- `dist/bootstrap.js` agora tem `setupMlxOmni()` e importa `mlx-omni-manager` ✅
- Extensão 0.1.0.vsix instalada com sucesso ✅

---

## Feature: MLX Omni Server — Backend com Hotload Real (2026-03-11)

**Status**: Concluído ✅

### Problema

O vllm-mlx não tem hotload — cada `swapModel` exige kill+restart do processo (5–30s).
Migração para MLX Omni Server que usa LRU+TTL caching interno: hotload real sem restart.

### Como usar

Instalar o servidor:

```bash
pip install mlx-omni-server
```

Configurar o Athion:

```json
{
  "provider": "mlx-omni",
  "orchestratorModel": "Qwen3.5-35B",
  "agentModel": "Qwen3-Coder-Next-40B",
  "mlxOmniPort": 10240,
  "mlxOmniAutoStart": true
}
```

### Diferença fundamental vs vllm-mlx

|                  | vllm-mlx                | mlx-omni                          |
| ---------------- | ----------------------- | --------------------------------- |
| `swapModel`      | kill processo + restart | pre-warm HTTP (lazy load)         |
| Overhead de swap | 5–30s                   | 2–10s (1ª vez) / ~0ms (cache hit) |
| Processo único   | 1 processo por modelo   | 1 processo, N modelos em cache    |

### Arquivos Criados

**`packages/core/src/server/mlx-omni-manager.ts`** (NOVO):

- Implementa interface `VllmManager` (drop-in replacement)
- `swapModel()`: atualiza `currentModel` + pre-warm via POST ao servidor
- `ensureRunning()`: inicia `mlx_omni_server --port PORT` se `autoStart`
- `touch()`: no-op (TTL gerenciado pelo mlx-omni internamente)

### Arquivos Modificados

- **`packages/core/src/provider/registry.ts`**: adicionado provider `mlx-omni` com `ATHION_MLX_OMNI_URL`
- **`packages/core/src/config/schema.ts`**: campos `mlxOmniPort`, `mlxOmniAutoStart`, `mlxOmniTtlMinutes`
- **`packages/core/src/bootstrap.ts`**: quando `provider === 'mlx-omni'`, usa `setupMlxOmni()` em vez de `setupVllmAndProxy()`; define `ATHION_MLX_OMNI_URL`

### Testes

- 173 testes passando (sem regressões)
- Testes de swap existentes cobrem `ModelSwapProvider` que funciona com qualquer `VllmManager`

---

## Feature: Model Swap Automático — Orquestrador/Subagentes (2026-03-11)

**Status**: Concluído ✅

### Problema

Usuário não tem VRAM suficiente para rodar dois modelos vLLM simultaneamente.
Necessidade de usar `qwen3.5` para o orquestrador e `qwen3-coder-next` para subagentes,
com unload/load automático entre turnos.

### Configuração

```json
{
  "orchestratorModel": "qwen3.5",
  "agentModel": "qwen3-coder-next"
}
```

Se os dois forem iguais (ou não configurados), nenhum swap ocorre.

### Arquivos Criados

**`packages/core/src/provider/model-swap-provider.ts`** (NOVO):

- Wrapper em torno do `ProviderLayer`
- Intercepta `streamChat()` e chama `vllm.swapModel()` se o modelo difere do atual
- Emite eventos `model_loading` / `model_ready` antes/depois do swap

### Arquivos Modificados

- **`packages/core/src/config/schema.ts`**: campos `orchestratorModel` e `agentModel` opcionais
- **`packages/core/src/provider/types.ts`**: eventos `model_loading` / `model_ready` no `StreamEvent`
- **`packages/core/src/orchestrator/types.ts`**: mesmos eventos no `OrchestratorEvent`
- **`packages/core/src/orchestrator/orchestrator.ts`**: usa `orchestratorModel ?? model`; propaga novos eventos
- **`packages/core/src/subagent/manager.ts`**: usa `agentModel ?? model` como defaultModel
- **`packages/core/src/bootstrap.ts`**: cria vllm ANTES do orchestrator; instancia ModelSwapProvider quando dual-model configurado
- **`packages/shared/src/protocol.ts`**: `ChatEventNotification` com `model_loading` / `model_ready`
- **`packages/cli/src/serve/handlers.ts`**: repassa eventos de swap ao cliente
- **`packages/vscode/src/webview/app/hooks/chat-events.ts`**: exibe "⏳ Carregando modelo: X..." na UI durante swap

### Build

- `packages/shared`, `packages/core`, `packages/cli` — todos compilam sem erros

## Feature: Feedback System — Frases de Loading (2026-03-11)

**Status**: Concluído

### O que foi feito

Sistema de frases humorísticas PT-BR que ciclam enquanto o modelo processa.

### Arquivos Criados

**`packages/vscode/src/webview/app/hooks/useFeedbackPhrase.ts`**:

- Hook React com 34 frases PT-BR
- Intervalo padrão: 5s (WebUI)
- Anti-repetição via guard loop (até 5 tentativas)
- Reset automático ao parar streaming

**`packages/cli/src/ui/hooks/useFeedbackPhrase.ts`**:

- Mesmo hook para CLI (Ink)
- Intervalo padrão: 15s (terminal)

**`packages/desktop/src/hooks/useFeedbackPhrase.ts`**:

- Mesmo hook para desktop (Tauri/React)
- Intervalo padrão: 5s

### Arquivos Modificados

**`packages/vscode/src/webview/app/components/MessageList.tsx`**:

- Importa `useFeedbackPhrase`
- Exibe frase ao lado do cursor `▌` durante streaming

**`packages/vscode/src/webview/app/styles/vscode.css`**:

- `.streaming-indicator` agora usa `display: flex` e `gap`
- `.feedback-phrase`: italic, dimmed, 11px

**`packages/cli/src/ui/MessageList.tsx`**:

- Importa `useFeedbackPhrase`
- Exibe frase quando não há streamingContent, tool ou agent ativos

**`packages/desktop/src/components/MessageList.tsx`**:

- Importa `useFeedbackPhrase`
- Exibe frase em italic ao lado do cursor animado

---

## Feature: Slash Commands + @Mentions no Webview VSCode (2026-03-11)

**Status**: Concluído

### Problema

- Extensão VSCode tinha comandos `/codebase`, `/use-skill`, `/clear-skill`, `/find-skills`, `/install-skill` mas faltavam: `/clear`, `/help`, `/agents`, `/skills`, `/model`, `/codebase-index`, `/codebase-search <query>`
- `@mentions` de arquivos não injetavam conteúdo no prompt (só autocomplete visual)
- Não havia suporte RPC para listar agentes na extensão

### Arquivos Modificados

**`packages/vscode/src/bridge/messenger-types.ts`**:

- Adicionado `{ type: 'agents:list' }` ao `WebviewToExtension`
- Adicionado `{ type: 'agents:list:result'; agents: AgentInfo[] }` ao `ExtensionToWebview`
- Adicionada interface `AgentInfo { name: string; description: string }`

**`packages/vscode/src/webview/chat-view-provider.ts`**:

- Importados `node:fs` e `node:path`
- Importado tipo `AgentInfo`
- Handler `chat:send` resolve `@mentions` via `resolveAtMentions()` antes de enviar ao bridge
- Handler `agents:list` chama RPC `agents.list` e retorna resultado ao webview
- Função `resolveAtMentions(content, wsRoot)` resolve `@arquivo` → conteúdo inline (max 200 linhas)

**`packages/vscode/src/webview/app/hooks/useChat.ts`**:

- Adicionados `pendingSkillsListRef` e `pendingModelRef` para distinguir quando `skill:list:result` e `config:result` foram disparados por slash commands
- Listener `skill:list:result` — condicional via flag (não interfere com outros consumidores)
- Listener `config:result` — condicional via flag
- Listener `agents:list:result` — exibe lista de agentes no chat
- Constante `HELP_TEXT` com todos os comandos documentados
- `/clear` — limpa mensagens sem adicionar ao histórico
- `/help` — mostra ajuda completa
- `/agents` → `post({ type: 'agents:list' })`
- `/skills` → `post({ type: 'skill:list' })` com flag ativa
- `/model` → `post({ type: 'config:list' })` com flag ativa
- `/codebase-index` — alias direto para `codebase:index`
- `/codebase-search <query>` — alias direto para `codebase:search`
- Exposto `clearMessages` no retorno do hook

### Fluxo @Mentions

````
Usuário digita: "@src/main.ts explique este arquivo"
→ sendMessage → post({ type: 'chat:send', content })
→ chat-view-provider.ts: resolveAtMentions() lê src/main.ts
→ content transformado: "[Conteúdo de src/main.ts]:\n```\n<conteúdo>\n```\n explique este arquivo"
→ bridge.request('chat.send', { content: resolvedContent })
→ LLM recebe o conteúdo do arquivo diretamente no prompt
````

### Fluxo /agents

```
Usuário: /agents
→ post({ type: 'agents:list' })
→ chat-view-provider.ts: bridge.request('agents.list')
→ post({ type: 'agents:list:result', agents: [...] })
→ useChat: listener exibe lista formatada no chat
```

---

## Feature: Slash Commands + @Mentions no CLI (2026-03-10)

**Status**: Concluído

### Problema

- Digitar `/` ou `@` no CLI não fazia nada
- WelcomeScreen mostrava comandos disponíveis mas não estavam implementados

### Implementação

**`packages/cli/src/hooks/useChat.ts`**:

- **Slash commands** interceptados antes de enviar ao LLM:
  - `/clear` — Limpa mensagens (+ Ctrl+L)
  - `/help` — Lista todos os comandos e menções
  - `/agents` — Lista agentes disponíveis com descrição
  - `/skills` — Lista skills disponíveis com descrição
  - `/model` — Mostra modelo e provider atual
  - `/codebase index` — Indexa projeto via CodebaseIndexer
  - `/codebase <query>` — Busca semântica no código
- **@mentions** — `@arquivo.ts` resolve para path absoluto e injeta conteúdo (max 200 linhas) no prompt enviado ao LLM
- `clearMessages()` exposto no retorno do hook
- Comando desconhecido (ex: `/foo`) passa direto ao LLM

**`packages/cli/src/ui/ChatApp.tsx`**:

- `Ctrl+L` agora chama `chat.clearMessages()` (antes era TODO)

### Fluxo

```
/help → interceptado → mostra ajuda localmente (não vai ao LLM)
@src/index.ts → resolve → injeta conteúdo do arquivo no prompt → envia ao LLM
mensagem normal → envia direto ao LLM
```

---

## Fix: Script ~/bin/athion — Remover FastAPI/mitmproxy (2026-03-10)

**Status**: Concluído

### Problema

- Script `~/bin/athion` iniciava proxy FastAPI Python na :1236 antes do CLI
- `isProxyHealthy(1236)` detectava FastAPI como saudável → CLI reutilizava → sem logging Bun

### Solução

- Removido start do mitmproxy e FastAPI do script
- Script agora só garante vllm-mlx na :1237
- Proxy Bun é iniciado pelo bootstrap do core (com logging completo)
- `tail -f ~/.athion/logs/proxy.log` agora funciona

---

## Fix: Suporte a Múltiplas Instâncias do Athion (2026-03-10)

**Status**: Concluído

### Problema

- Abrir `athion` em dois terminais causava `EADDRINUSE` na porta 1236
- O `proxy.start()` matava o proxy da primeira instância e falhava ao rebind da porta

### Solução

Segunda instância detecta que o proxy já está saudável e **reutiliza** em vez de reiniciar.

**`packages/core/src/server/proxy/proxy.ts`**:

- `isProxyHealthy(port)` — health check via `/v1/models` com timeout 2s
- `createProxyReuse(port)` — proxy sem ownership (start/stop são noop)
- `ProxyServer.isOwner` — indica se este processo é dono do server

**`packages/core/src/bootstrap.ts`**:

- `setupVllmAndProxy()` verifica `isProxyHealthy()` antes de criar proxy
- Se saudável → `createProxyReuse()` (log: "reusing existing proxy")
- Se não → `createProxy()` normal (comportamento anterior)
- `proxy.start()` só é chamado quando `proxy.isOwner === true`

### Fluxo

```
Terminal 1: athion → bootstrap → proxy.start() → dono da porta 1236
Terminal 2: athion → bootstrap → isProxyHealthy(1236) → true → reutiliza proxy existente
```

---

## Fix Proxy Layer + Processos Zumbis (2026-03-10)

**Status**: Concluído

### Problema

- O proxy interno (`packages/core/src/server/proxy/proxy.ts`) não funcionava
- `proxyEnabled: false` como workaround temporário
- Causa raiz: 9 processos Bun zumbis na porta 1236 com `reusePort: true`, a maioria com `backendPort: 8000` (config antiga) — OS distribuía requests aleatoriamente entre processos com porta errada

### Correções

**proxy.ts** (`packages/core/src/server/proxy/proxy.ts`):

1. **try-catch em handleStreaming e handleNonStreaming** — fetch sem error handling causava erros HTML 500 em vez de JSON 502
2. **Cleanup de zumbis no start()** — mata todos os processos existentes na porta antes de iniciar
3. **Removido `reusePort: true`** — evita acúmulo de processos zumbis

**config.json** (`~/.athion/config.json`):

- `proxyEnabled: true` — proxy agora funciona corretamente

### Fluxo funcionando

CLI → Core bootstrap → Proxy (1236) → vllm-mlx (1237)

- Middlewares ativos: compression, think-stripper, tool-sanitizer, safety-guard
- Logs: request/response com tokens, latência, chunks

---

## UI/UX Polish — CLI + VS Code Extension (2026-03-10)

**Status**: Concluído

### VS Code Extension — Fix Race Condition

- **Bug**: `status:update` enviado antes do React montar → mensagem perdida → input bloqueado em "Conectando..."
- **Fix**: `chat-view-provider.ts` → no handler 'ready', reenvia `status:update` com status atual do bridge
- **Arquivo**: `packages/vscode/src/webview/chat-view-provider.ts`

### VS Code Extension — CSS Loading Fix

- **Bug**: `main.css` não era gerado porque `main.tsx` não importava o CSS
- **Fix**: Adicionado `import './styles/vscode.css'` em `packages/vscode/src/webview/app/main.tsx`
- esbuild agora gera `dist/webview/main.css` (4.5kb)

### CLI TUI — Polish Visual

- **WelcomeScreen** (`packages/cli/src/ui/WelcomeScreen.tsx`): Tela de boas-vindas com logo ASCII, modelo ativo, comandos disponíveis e atalhos de teclado
- **StatusBar**: Bordas round, layout justify-between, ícone ◆, tokens compacto "tok"
- **UserInput**: Bordas round, ícone ❯, HelpBar com atalhos (Enter/Ctrl+L/Ctrl+C)
- **MessageList**: Role icons (◇ Você / ◆ Athion), timestamp HH:MM, indent do conteúdo
- **ChatApp**: WelcomeScreen quando sem mensagens, MessageList quando conversando

---

## Fase 6 — Polish (2026-03-09)

**Branch**: `fase-6/polish`
**Status**: Em andamento

| #   | Task                                                                       | Prioridade | Status       |
| --- | -------------------------------------------------------------------------- | ---------- | ------------ |
| 6.1 | Testes unitários: bus, config, permissions, skills, storage, tokens, tools | Alta       | ✅ Concluído |
| 6.2 | Testes unitários: orchestrator, subagent, provider                         | Crítica    | ✅ Concluído |
| 6.3 | Testes E2E: CLI, VSCode, Desktop                                           | Alta       | ✅ Concluído |
| 6.4 | Telemetria OpenTelemetry                                                   | Média      | ✅ Concluído |
| 6.5 | i18n: 5 locales (pt-BR, en-US, es, fr, zh-CN)                              | Média      | ✅ Concluído |
| 6.6 | CI/CD: coverage + security + E2E jobs                                      | Média      | ✅ Concluído |
| 6.7 | Merge de feat/codebase-indexer                                             | -          | ✅ Concluído |

---

## Gaps — Plano de Implementação (2026-03-09)

**Plano completo**: `docs/plano-gaps-implementacao.md`
**Status**: ✅ TODOS OS 8 GAPS CONCLUÍDOS — 2026-03-09

| #   | Gap                                     | Complexidade | Status       |
| --- | --------------------------------------- | ------------ | ------------ |
| 1   | useSession + usePermission hooks (CLI)  | Baixa        | ✅ Concluído |
| 2   | PermissionPrompt componente (CLI TUI)   | Baixa        | ✅ Concluído |
| 3   | Pinned messages no summarize.ts         | Baixa        | ✅ Concluído |
| 4   | Tree-sitter no chunker (indexing)       | Alta         | ✅ Concluído |
| 5   | @mentions de arquivos/símbolos (VSCode) | Média        | ✅ Concluído |
| 6   | Deep links `athion://` (Tauri)          | Média        | ✅ Concluído |
| 7   | Documentação completa (READMEs + docs/) | Baixa        | ✅ Concluído |
| 8   | Publicação npm / Marketplace / builds   | Alta         | ✅ Concluído |

---

## Fase 1: Core Foundation (branch: fase-1/core-foundation)

### 2.1 Config Manager

**Status**: Concluído ✅
**Commit**: `ca8ef92`
**Path**: `packages/core/src/config/`
**Arquivos**:

- `schema.ts` — Zod schema com defaults (11 campos)
- `loader.ts` — Carrega global (~/.athion/config.json), project (.athion/config.json), env (ATHION\_\*)
- `config.ts` — `createConfigManager()` factory com merge 5 níveis, get/set/reload/onChanged
- `index.ts` — barrel export

**Decisoes**:

- Hierarquia 5 niveis: defaults < global < project < env < CLI args
- Provider padrao: `vllm-mlx`
- Model padrao: `qwen3-coder-reap-40b-a3b`
- Language padrao: `pt-BR`

---

### 2.2 Event Bus

**Status**: Concluído ✅
**Commit**: `a189e05`
**Path**: `packages/core/src/bus/`
**Arquivos**:

- `bus.ts` — `createBus()` factory com publish/subscribe/once/clear, validação Zod
- `events.ts` — 10 eventos pré-definidos (StreamStart, StreamContent, StreamToolCall, etc.)
- `index.ts` — barrel export

---

### 2.3 Storage

**Status**: Concluído ✅
**Commit**: `823310e`
**Path**: `packages/core/src/storage/`
**Arquivos**:

- `schema.ts` — Drizzle tables: sessions, messages, permissions (cascade delete)
- `db.ts` — `createDatabaseManager()` com CRUD completo, WAL pragmas
- `index.ts` — barrel export

**Dependencias**: `drizzle-orm`, `bun:sqlite`

---

### 2.4 Provider Layer

**Status**: Concluído ✅
**Commit**: `410eef8`
**Path**: `packages/core/src/provider/`
**Arquivos**:

- `types.ts` — StreamEvent union, TokenUsage, ProviderInfo, ModelInfo, StreamChatConfig, InterruptStrategy
- `registry.ts` — 6 providers (vllm-mlx, ollama, openai, anthropic, google, openrouter)
- `provider.ts` — `createProviderLayer()` com listProviders, listModels, streamChat (AsyncGenerator)
- `index.ts` — barrel export

**Dependencias**: `ai@^6.0.116`, `@ai-sdk/openai@^3.0.41`, `@ai-sdk/anthropic@^3.0.58`, `@ai-sdk/google@^3.0.43`

**Fixes aplicados**:

- `apiKey ?? ''` em todos providers (fix `exactOptionalPropertyTypes`)
- `messages` cast com `as Parameters<typeof streamText>[0]` (AI SDK v6 usa `ModelMessage[]`)
- `maxTokens` → `maxOutputTokens` (renomeado no AI SDK v6)
- `usage.inputTokens` / `usage.outputTokens` (nomes corretos no AI SDK v6)

---

### 2.5 Tool Registry

**Status**: Concluído ✅
**Commit**: `b1a5171`
**Path**: `packages/core/src/tools/`
**Arquivos**:

- `types.ts` — ToolResult, ToolDefinition (genérica com Zod), ToolRegistry interface
- `registry.ts` — `createToolRegistry()` factory + `defineTool()` helper
- `builtins.ts` — 5 tools: read_file, write_file, list_files, run_command, search_files
- `index.ts` — barrel export

**Fixes aplicados**:

- Spread condicional `...(cwd ? { cwd: resolve(cwd) } : {})` (fix `exactOptionalPropertyTypes` no Bun.spawn)
- Separar retorno success/error em branches distintos (fix ToolResult type)

---

### 2.6 Permission System

**Status**: Concluído ✅
**Commit**: `3603b9f`
**Path**: `packages/core/src/permissions/`
**Arquivos**:

- `types.ts` — PermissionDecision, PermissionScope, PermissionRule, PermissionCheck, PermissionManager
- `permissions.ts` — `createPermissionManager()` com glob matching e 3 níveis de prioridade
- `index.ts` — barrel export

**Decisões**:

- Glob matching sem dependências externas (regex com `*` e `**`)
- Prioridade: session rules → persistent rules → default 'ask'
- Integração com DatabaseManager para scope 'remember'

---

### 2.7 Skill Manager

**Status**: Concluído ✅
**Commit**: `6bd95ca`
**Path**: `packages/core/src/skills/`
**Arquivos**:

- `types.ts` — SkillDefinition, SkillManager interface
- `parser.ts` — `parseSkillFile()` extrai metadados de arquivos .md
- `manager.ts` — `createSkillManager()` com loadFromDirectory, register, findByTrigger
- `index.ts` — barrel export

---

### 2.8 Token Manager

**Status**: Concluído ✅
**Path**: `packages/core/src/tokens/`

---

## Fase 2: Orchestrator + SubAgents (branch: fase-2/orchestrator-subagents)

### 2.1 Orchestrator

**Status**: Concluído ✅
**Commit**: `4a91679`
**Path**: `packages/core/src/orchestrator/`
**Arquivos**:

- `types.ts` — OrchestratorEvent (8-variant union), Session, AgentDefinition, UserMessage, OrchestratorDeps
- `session.ts` — `createSessionManager()` bridge Storage ↔ Orchestrator (parts JSON ↔ simple strings)
- `prompt-builder.ts` — `createPromptBuilder()` monta system prompt com skills, tools, agents, contexto
- `tool-dispatcher.ts` — `createToolDispatcher()` verifica permissões e delega para ToolRegistry
- `orchestrator.ts` — `createOrchestrator()` streaming chat loop, multi-turn, loop detection
- `index.ts` — barrel export

### 2.2 SubAgent Manager

**Status**: Concluído ✅
**Commit**: `481ea9c`
**Path**: `packages/core/src/subagent/`
**Arquivos**:

- `types.ts` — SubAgentTask (task-based model), SubAgentConfig, SubAgentEvent (7-variant union)
- `agent.ts` — `runSubAgent()` AsyncGenerator com chat loop isolado e task status tracking
- `manager.ts` — `createSubAgentManager()` registry + spawn de subagentes
- `index.ts` — barrel export

### 2.3 Task Tool

**Status**: Concluído ✅
**Path**: `packages/core/src/tools/task-tool.ts`

- `createTaskTool()` — tool especial que delega tasks para subagentes via SubAgentManager
- Schema Zod: agent (string), description (string), steps (string[] opcional)
- Consome generator inteiro e retorna resultado final

### 2.4 Built-in Skills (7 arquivos .md)

**Status**: Concluído ✅
**Path**: `packages/core/skills/`
**Arquivos**:

- `code-review.md` — Revisão de código (segurança, bugs, performance)
- `refactor.md` — Refatoração preservando comportamento
- `explain.md` — Explicação de código e conceitos
- `test-writer.md` — Escrita de testes unitários/integração
- `debug.md` — Diagnóstico e correção de bugs
- `search.md` — Busca e análise read-only do codebase
- `coder.md` — Geração de código e modificação de arquivos

### 2.5 Built-in SubAgents

**Status**: Concluído ✅
**Path**: `packages/core/src/subagent/builtins.ts`

- 7 subagentes: search, coder, code-reviewer, refactorer, explainer, test-writer, debugger
- Cada um referencia uma skill e tem whitelist de tools
- `builtinAgents` array exportado para registro automático

### 2.6 Core Tools

**Status**: Concluído ✅ (já existiam da Fase 1)
**Path**: `packages/core/src/tools/builtins.ts`

- 5 tools: read_file, write_file, list_files, run_command, search_files
- - task tool (2.3)

### 2.7 Bootstrap + Barrel Exports

**Status**: Concluído ✅
**Path**: `packages/core/src/bootstrap.ts`, `packages/core/src/index.ts`

- `bootstrap()` — inicializa todos os módulos na ordem correta (6 níveis de dependência)
- `AthionCore` — interface com todas as instâncias prontas
- `index.ts` — re-exporta tudo publicamente

**Nota futura**: Implementar busca vetorial (embeddings + sqlite-vec) para o Search agent.

---

## Agente: Instrutor

**Status**: Concluído ✅
**Path**: `~/.claude/agents/instrutor.md`
**Data**: 2026-03-07

**Descrição**: Agente de ensino que MOSTRA código sem criar arquivos.

**Características**:

- Baseado no pair-programming-mentor
- NÃO cria/modifica arquivos (Edit, Write, Bash bloqueados)
- Apenas MOSTRA código formatado no chat
- Docstrings obrigatórias no formato JSDoc `/** */`
- Fluxo passo a passo com confirmação do usuário
- Ferramentas permitidas: Glob, Grep, Read, WebFetch, WebSearch, AskUserQuestion

**Ativação**: Usar quando pedir para ensinar/mostrar código sem criar arquivos

- "me ensine X, mas não crie nada"
- "só me mostra como fazer"
- "quero entender X, apenas mostrando"

---

## Fix: Function Calling no Provider Layer + Filtragem de Tools

**Status**: Concluído ✅
**Data**: 2026-03-08

### Problema

O modelo vllm-mlx estava gerando XML (`<search><search_files>`) em vez de function calls reais porque:

1. `provider.ts` usava `textStream` (só texto) em vez de `fullStream` (texto + tool calls)
2. Nenhuma tool definition era passada para o AI SDK
3. O system prompt listava TODAS as tools (read_file, write_file, etc.) em vez de apenas `task`

### Correções

**`packages/core/src/provider/provider.ts`**:

- `part.textDelta` → `part.text` (API AI SDK v6)
- `part.args` → `part.input` (API AI SDK v6)
- `convertTools()`: `parameters` → `inputSchema` (API AI SDK v6)
- Usa `fullStream` para capturar eventos `tool-call`

**`packages/core/src/orchestrator/prompt-builder.ts`**:

- `buildToolsSection()` agora filtra para mostrar apenas `task` tool no system prompt
- Modelo principal delega via `task`, subagentes recebem tools específicas

**`packages/core/src/orchestrator/orchestrator.ts`**:

- `runStreamTurn()` agora busca a tool `task` do registry e passa como `ProviderToolDef`
- Habilita function calling real via AI SDK `tools` parameter

---

## Fix: Token Control + Context Window + Paginação

**Status**: Concluído ✅
**Data**: 2026-03-08

### Problema

- Context window configurado como 85K no schema, mas deveria ser 50K
- Bootstrap usava `contextLimit: 128_000` hardcoded ignorando config
- Compaction threshold era 0.8 (80%), deveria disparar em 45K (90% de 50K)
- `search_files` retornava até 200 resultados sem paginação
- `read_file` retornava arquivo inteiro sem suporte a leitura parcial
- Tool results grandes (>10K chars) explodiam o contexto
- Compaction só era verificada no `prepareChat()`, não entre turnos
- Subagente não tinha controle de tokens

### Correções

**`packages/core/src/config/schema.ts`**:

- `contextWindow` default: 85000 → 50000

**`packages/core/src/bootstrap.ts`**:

- `contextLimit` agora usa `config.get('contextWindow')` em vez de hardcoded 128K
- `compactionThreshold`: 0.8 → 0.9 (dispara em 45K com janela de 50K)

**`packages/core/src/tools/builtins.ts`**:

- `read_file`: adicionado `offset`/`limit` para leitura parcial (default: 200 linhas)
- Retorna metadata: `totalLines`, `fromLine`, `toLine`, `hasMore`
- `search_files`: adicionado `offset`/`limit` para paginação (default: 50 resultados, max 100)
- Retorna metadata: `total`, `offset`, `limit`, `hasMore`

**`packages/core/src/subagent/agent.ts`**:

- Tool results truncados em 10K chars com `truncateResult()`
- Estimativa de tokens antes de cada chamada ao provider (`estimateTokens()`)
- Se estimativa > 85% do limite, faz sliding-window nas mensagens

**`packages/core/src/orchestrator/orchestrator.ts`**:

- Tool results truncados em 10K chars com `truncateResult()`
- Compaction check entre turnos (não só no prepareChat): verifica `needsCompaction()` no início de cada iteração do while loop

---

## Fix: SubAgent Result Flow + Orchestrator Events + forceTextOnly

**Status**: Concluído ✅
**Data**: 2026-03-08

### Problema

1. `task.result` do subagente continha apenas o último texto (pré-tool-calls), não o resultado completo
2. Eventos `subagent_start`/`subagent_complete` existiam no type mas nunca eram emitidos
3. Modelo re-invocava `task` 3-6x após receber resultado — não confiava no resultado
4. Safety guard bloqueava chamadas legítimas do subagente (mesma tool para arquivos diferentes)
5. `Bun.serve` timeout padrão de 10s matava requests para modelo local

### Correções

**`packages/core/src/subagent/agent.ts`**:

- `resultParts: string[]` acumula todo conteúdo (texto + tool results) ao longo dos turnos
- Tool results incluídos no acumulador: `[toolName] resultado` (truncado em 3K)
- `task.result = resultParts.join('\n')` no final — resultado completo e rico

**`packages/core/src/orchestrator/orchestrator.ts`**:

- `forceTextOnly: boolean` no `ChatContext` — após task bem sucedida, próximo turno sem tools
- `runStreamTurn()` não passa tools quando `ctx.forceTextOnly = true` → força resposta texto
- `handleToolCalls()` emite `subagent_start` antes e `subagent_complete` após dispatch
- Rejeita tools que não sejam `task` com mensagem de erro explicativa

**`packages/core/src/orchestrator/prompt-builder.ts`**:

- Prompt reforçado: "You can ONLY use the task tool"
- Instrução para não re-invocar task para o mesmo trabalho

**`packages/core/src/tokens/manager.ts`**:

- Loop detection: mínimo de ações mudou de `loopThreshold * 2` (6) para `loopThreshold` (3)

**`packages/core/src/server/proxy/middleware/safety-guard.ts`**:

- `LOOP_THRESHOLD`: 3 → 5
- `MAX_TURNS`: 15 → 25
- Loop detection agora compara `toolName:targetPath` em vez de apenas `toolName`
- `extractTarget()` extrai path/file dos args da tool call (campos: path, file, pattern, command, description)
- Mesma tool para arquivo diferente = chamada diferente (não é loop)

**`packages/core/src/server/proxy/proxy.ts`**:

- `idleTimeout: 255` em ambos `Bun.serve()` (máximo do Bun, era default 10s)

### Teste E2E

- `bun scripts/test-agent-search.ts` — **PASSED ✅** (8/8 validações)
- Agent invoked ✓, Correct agent (search) ✓, Tool calls made ✓, Tool results received ✓
- All tools succeeded ✓, Has content response ✓, Stream finished ✓, No errors ✓
- Duração: 610s (modelo local Qwen3-Coder 40B)

---

## Feature: Agent Continuation Protocol

**Status**: Concluído ✅
**Data**: 2026-03-08

### Problema

Quando o subagente recebe uma task complexa (ex: "analise todos os arquivos .ts"), precisa rodar muitas tools e o contexto de 50K tokens se esgota. O sliding-window perde resultados anteriores, gerando resultado incompleto.

### Solução: Continuation Protocol

O agente detecta mecanicamente quando o contexto está cheio e sai com `status='partial'`. O task-tool re-spawna automaticamente com os resultados acumulados no prompt, até completar ou atingir 5 continuações.

### Alterações

**`packages/core/src/subagent/types.ts`**:

- `TaskStatus`: adicionado `'partial'`
- `SubAgentTask`: novos campos `accumulatedResults`, `continuationIndex`, `maxContinuations`, `remainingWork`
- `SubAgentEvent`: novo evento `continuation_needed`

**`packages/core/src/subagent/agent.ts`**:

- Detecção mecânica: se tokens > 80% → sliding-window → se ainda > 70% → sai com `partial`
- `buildAgentPrompt()`: se `continuationIndex > 0`, inclui "Previous Results" e "Remaining Work"
- `buildRemainingWorkSummary()`: sintetiza o que falta a partir dos steps pendentes
- `compressAccumulatedResults()`: trunca proporcionalmente se > 15K chars

**`packages/core/src/tools/task-tool.ts`**:

- Loop de continuação em `executeTask()`: até MAX_CONTINUATIONS (5)
- Se `partial` → reseta status, continua loop
- Se `completed` → consolida `accumulatedResults + currentResult`
- Se esgotou continuações → retorna resultado parcial com nota

**`packages/core/src/orchestrator/types.ts`**:

- Novo evento `subagent_continuation` no `OrchestratorEvent`

**`packages/core/src/orchestrator/orchestrator.ts`**:

- `runStreamTurn()`: quando `forceTextOnly=true`, ignora eventos `tool_call` alucinados pelo modelo local
- Modelo Qwen3 gera tool calls mesmo sem tools definidas no request — fix com `continue` no loop de stream

### Fluxo

```
task-tool → spawn [RUN 0] → trabalha → contexto cheio → partial
         → spawn [RUN 1] → prompt com resultados anteriores → trabalha → completed
         → retorna resultado consolidado (orchestrator não sabe da continuação)
```

### Teste E2E

- `bun scripts/test-agent-search.ts` — **PASSED ✅** (8/8 validações, 20.5s)

---

## Feature: Test UI — Visualização de Testes com Flow Diagram

**Status**: Concluído ✅
**Data**: 2026-03-08

### Descrição

Módulo de visualização de testes em tempo real com:

- **Flow Diagram** estilo n8n (ReactFlow) — cada etapa vira um node no grafo
- **Terminal Log** — log em tempo real com token tracking por evento
- **Token Bar** — barra de progresso de uso de tokens

### Arquitetura

```
packages/test-ui/
  src/
    server/
      index.ts          → Bun.serve() com WebSocket
      test-runner.ts     → Bootstrap instrumentado + execução de testes
      protocol.ts        → Tipos do protocolo WS (compartilhado server/client)
    app/
      App.tsx            → Layout split (flow + log) com 3 modos de visualização
      hooks/
        useWebSocket.ts  → Conexão WS com reconnect automático
        useFlowGraph.ts  → Construção dinâmica de nodes/edges a partir dos eventos
        useTokenTracker.ts → Tracking de tokens em tempo real
      components/
        FlowPanel.tsx    → Container ReactFlow com MiniMap e Controls
        LogPanel.tsx     → Terminal-like log com cores por tipo de evento
        TokenBar.tsx     → Barra de progresso de tokens (verde/amarelo/vermelho)
        TestSelector.tsx → Dropdown de testes + botões Run/Stop/Clear
      nodes/
        BaseNode.tsx     → Componente base com Handle, status, tokens
        index.ts         → Registry de 13 tipos de node
      layout/
        dagre-layout.ts  → Auto-layout top-to-bottom via dagre
      styles/
        theme.css        → Tema dark Catppuccin Mocha
```

### Instrumentação do SubAgentManager

O `task-tool.ts` drena os eventos do subagente (`for await (const _event of generator)`).
Para capturar esses eventos sem modificar o core, o test-runner substitui o `spawn()` do
SubAgentManager por um wrapper que intercepta cada evento antes de yieldar:

```typescript
Object.assign(core.subagents, {
  spawn: async function* (config, task, signal) {
    for await (const event of original.spawn(config, task, signal)) {
      emitSubAgentEvent(event) // → WebSocket
      yield event // → propaga normalmente para task-tool
    }
  },
})
```

### Tipos de Node no Flow

- startNode, setupNode, userMessageNode, systemPromptNode
- llmResponseNode, toolCallNode, toolResultNode
- subAgentNode (grupo), subStartNode, continuationNode
- completeNode, finishNode, errorNode

### Como rodar

```bash
cd packages/test-ui
bun run dev          # Server :3457 + Vite :3456
```

### Stack

- React 19 + @xyflow/react 12 + dagre (layout)
- Bun.serve (WebSocket nativo)
- Vite 6 (dev server + build)
- Tema Catppuccin Mocha (dark)

---

## Feature: Smart Compaction via LLM (Issue #16 — Fase 2)

**Status**: Em progresso
**Data**: 2026-03-08

### Descrição

Implementar compactação de contexto usando o LLM para gerar resumos estruturados (estilo Claude Code).
Quando 90% da janela de contexto é consumida, o sistema chama o LLM para resumir mensagens antigas, preservando decisões, paths, erros e estado atual.

### Alterações

**`packages/core/src/provider/types.ts`**:

- Novos tipos: `GenerateConfig` (chamada não-streaming), `GenerateResult` (texto + usage)

**`packages/core/src/provider/provider.ts`**:

- Novo método `generateText()` na interface `ProviderLayer` — chamada não-streaming via AI SDK `generateText()`
- Usado internamente para summarização (não precisa de streaming)

**`packages/core/src/tokens/summarize.ts`** (novo):

- `SummarizationService` — encapsula a chamada ao LLM para gerar resumos
- `createSummarizationService({ provider, providerId, modelId })` — factory
- Reutiliza prompts de `compression-prompt.ts` (já existiam para o proxy)
- Divide mensagens: system (preservadas) + antigas (resumidas) + recentes (6 preservadas)
- Fallback seguro: se LLM falhar, retorna mensagens originais

**`packages/core/src/tokens/types.ts`**:

- `TokenManager.compact()` agora retorna `Promise<>` (async para chamar LLM)

**`packages/core/src/tokens/manager.ts`**:

- `compact()` tornado async
- Nova estratégia `compactSummarize()` que chama `SummarizationService`
- Fallback para sliding-window se summarizer falhar ou não estiver configurado
- Aceita `summarizer` opcional no config

**`packages/core/src/orchestrator/session.ts`**:

- `SessionManager.compress()` tornado async (propaga o async do compact)

**`packages/core/src/orchestrator/orchestrator.ts`**:

- `prepareChat()` tornado async (chama `await session.compress()`)
- `chat()` usa `await` no compress entre turnos

**`packages/core/src/bootstrap.ts`**:

- Cria `SummarizationService` com provider/model do config
- Estratégia mudada de `'sliding-window'` → `'summarize'`
- Injeta `summarizer` no `createTokenManager()`

### Fix: Fuzzy Match de Agent Names

**`packages/core/src/tools/task-tool.ts`**:

- `fuzzyMatchAgent()` — encontra agente por similaridade quando LLM erra nome
- Match por prefix, suffix e substring (ex: "code-review" → "code-reviewer")
- Fix para o teste code-reviewer que falhava quando LLM mandava nome errado

### Testes

- `test-agent-search` — **PASSED ✅** (com strategy 'summarize')
- `test-e2e` — **PASSED ✅**
- Todos 8 testes — **PASSED ✅** (incluindo code-reviewer com fuzzy match)

---

## Feature: Codebase Indexer — Busca Semântica do Codebase

**Status**: Concluído ✅
**Data**: 2026-03-09
**Branch**: `fase-6/polish`

### Descrição

Módulo de indexação e busca semântica do codebase implementado do zero sem binários nativos:

- **FileWalker**: percorre diretório respeitando `.gitignore` (parser próprio sem dependências)
- **Chunker**: chunking heurístico por linguagem (regex, sem tree-sitter nativo)
- **EmbeddingService**: chama `/v1/embeddings` (OpenAI-compatible — LM Studio, Ollama, OpenAI)
- **DbStore**: SQLite direto (bun:sqlite) com FTS5 + vetores BLOB
- **Vector Similarity**: cosine similarity em JS (float32 serializado)
- **CodebaseIndexer**: orquestra tudo — indexação completa, incremental, busca híbrida

### Estratégia de Busca

1. **FTS5** (rápido, exact/keyword) — sempre disponível
2. **Vector similarity** (semântico) — disponível se `ATHION_EMBEDDING_URL` configurado
3. **Híbrida**: FTS(40%) + Vector(60%) com re-ranking por score médio

### Arquivos Criados

**`packages/core/src/indexing/`**:

- `types.ts` — `CodeChunk`, `SearchResult`, `IndexerConfig`, `IndexStats`
- `file-walker.ts` — walker com gitignore parsing próprio, `detectLanguage()`
- `chunker.ts` — chunking semântico + sliding-window, `generateChunkId()`
- `embeddings.ts` — `EmbeddingService`, `cosineSimilarity()`, serialização float32
- `db-store.ts` — SQLite + FTS5 + índice de vetores (sem drizzle)
- `manager.ts` — `CodebaseIndexer` class + `createCodebaseIndexer()` factory
- `index.ts` — barrel exports

### Arquivos Modificados

**`packages/core/src/tools/builtins.ts`**:

- `createSearchCodebaseTool(indexer)` — tool `search_codebase` dinâmica
- Prioridade: semântico primeiro, grep como fallback

**`packages/core/src/subagent/builtins.ts`**:

- Todos os agentes (search, coder, code-reviewer, refactorer, explainer, test-writer, debugger)
  adicionaram `search_codebase` como primeira tool da lista

**`packages/core/src/bootstrap.ts`**:

- `BootstrapOptions`: novos campos `workspacePath`, `indexDbPath`
- `AthionCore`: novo campo `indexer: CodebaseIndexer | null`
- Cria `CodebaseIndexer` se `workspacePath` fornecido
- Registra `search_codebase` tool automaticamente
- Usa `ATHION_EMBEDDING_URL` e `ATHION_EMBEDDING_MODEL` env vars

**`packages/core/src/index.ts`**:

- Re-exporta `createCodebaseIndexer` e tipos do módulo indexing

**`packages/core/src/tools/index.ts`**:

- Re-exporta `createSearchCodebaseTool`

**`packages/shared/src/protocol.ts`**:

- Novos `RpcMethod`: `codebase.index`, `codebase.search`, `codebase.status`, `codebase.clear`

**`packages/cli/src/commands/codebase.ts`** (novo):

- Subcomandos: `index [path]`, `search <query>`, `status`, `clear`
- Suporte a `--db` para custom path do banco
- Progresso em tempo real durante indexação

**`packages/cli/src/index.ts`**:

- Registra comando `codebase` no CLI

**`packages/cli/src/serve/handlers.ts`**:

- `handleCodebaseIndex` — indexa com progresso via notificações
- `handleCodebaseSearch` — busca e retorna resultados formatados
- `handleCodebaseStatus` — status do índice
- `handleCodebaseClear` — limpa o índice

**`packages/vscode/src/bridge/messenger-types.ts`**:

- `WebviewToExtension`: `codebase:index`, `codebase:search`
- `ExtensionToWebview`: `codebase:result`, `codebase:indexed`, `codebase:error`
- Interface `CodebaseSearchResult`

**`packages/vscode/src/commands/index.ts`**:

- `athion.indexCodebase` — indexa workspace com progress notification
- `athion.searchCodebase` — input box + busca + exibe no chat

**`packages/vscode/package.json`**:

- Registra novos comandos no `contributes.commands`

**`packages/vscode/src/webview/chat-view-provider.ts`**:

- Handlers para `codebase:index` e `codebase:search` do webview

**`packages/vscode/src/webview/app/hooks/useChat.ts`**:

- Intercep slash command `/codebase [query]` no `sendMessage`
- `/codebase index` → indexa workspace
- `/codebase <query>` → busca e mostra resultados no chat
- Eventos `codebase:result`, `codebase:indexed`, `codebase:error`

**`packages/test-ui/src/server/protocol.ts`**:

- `WsClientMessage`: `codebase:index`, `codebase:search`
- `WsServerMessage`: `codebase:progress`, `codebase:indexed`, `codebase:results`, `codebase:error`

**`packages/test-ui/src/server/index.ts`**:

- Handlers WebSocket para `codebase:index` e `codebase:search`

### Fixes de Build (pré-existentes)

**`packages/core/tsconfig.json`**:

- Adicionado `exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"]` para evitar falha no build

**`packages/core/src/server/proxy/compression.ts`**:

- Fixes de `exactOptionalPropertyTypes` e tipagem de `res.json()`

**`packages/core/src/server/proxy/middleware/safety-guard.ts`**:

- Fix de variável não utilizada (`toolName` → `_toolName`)

### Como Usar

**CLI**:

```bash
# Indexar workspace atual
athion codebase index .

# Buscar semanticamente
athion codebase search "função de autenticação JWT"

# Status do índice
athion codebase status

# Com embeddings (semântico)
ATHION_EMBEDDING_URL=http://localhost:1234 athion codebase index .
```

**VS Code**:

- `Athion: Index Codebase` — indexa o workspace aberto
- `Athion: Search Codebase` — input box para busca
- No chat: `/codebase index` ou `/codebase <query>`

**Chat App**:

- WebSocket: `{ type: 'codebase:index' }` ou `{ type: 'codebase:search', query: '...' }`

---

## Gap 7: Documentação Completa (READMEs + docs/)

**Status**: Concluído ✅
**Data**: 2026-03-09

### Arquivos Criados

- `packages/core/README.md` — Módulos, API pública (`bootstrap`/`AthionCore`), providers, token manager, codebase indexer
- `packages/cli/README.md` — Comandos, flags globais, atalhos TUI, permissões, variáveis de ambiente
- `packages/vscode/README.md` — Instalação, comandos palette, @mentions, slash commands, configuração settings.json
- `packages/desktop/README.md` — Build Tauri, features (system tray, hotkey), deep links `athion://`, layout
- `docs/architecture.md` — Diagrama ASCII completo, 4 camadas, fluxo de chat, fluxo de tool calls, tabela de módulos

---

## Testes E2E — Codebase Indexer + search_codebase (2026-03-09)

**Status**: Concluído ✅

### Scripts criados

- `packages/core/scripts/test-codebase-indexer.ts` — Testa indexação + FTS + tool
- `packages/core/scripts/test-search-agent-tools.ts` — Smoke test: registry + subagente
- `packages/core/scripts/test-agent-search-codebase.ts` — E2E com LLM (search agent)

### Resultados

**test-codebase-indexer.ts — PASSED ✓**

- 262 arquivos indexados em 1.1s
- 2164 chunks gerados (FTS-only, sem embeddings)
- FTS retornou resultados para todas as queries válidas
- Tool `search_codebase` criada, executada, retornou results com file/startLine/score/content
- Mensagem de fallback presente quando query retorna vazio

**test-search-agent-tools.ts — PASSED ✓**

- Sem `workspacePath`: `search_codebase` NÃO registrada, `indexer = null`
- Com `workspacePath`: `search_codebase` registrada como 1ª tool do search agent
- Resolvida corretamente do ToolRegistry para o subagente (linha 51 de `agent.ts`)
- Execução via `tools.execute('search_codebase', ...)` retorna resultados reais

**test-agent-search-codebase.ts — Parcial (LLM lento)**

- Bootstrap: ✓ (`search_codebase` registrada)
- Orchestrator delegou corretamente: `task(agent: "search")` ✓
- `subagent_start: search` emitido ✓
- LLM 40B no MLX muito lento para completar o turn (timeout)

### Observações

- A busca FTS é instantânea (~0ms); o gargalo é o LLM
- FTS5 com tokenizer trigram pode retornar resultados parciais (esperado)
- `embeddingBaseUrl: ''` no bootstrap não ativa embeddings (verificar se precisa ser `undefined`)

---

## Feature: /find-skills + Skill Explícita em CLI, VSCode e Desktop (2026-03-10)

**Status**: Concluído ✅

### Descrição

Implementação de dois sistemas paralelos de skills:

1. **Implícito**: skills ativadas automaticamente por triggers de keywords (já existia)
2. **Explícito**: usuário escolhe e ativa uma skill que persiste para as próximas mensagens

### Novos Comandos (todos os 3 surfaces)

- `/find-skills [query]` — busca skills no npm registry (`athion-plugin-*`)
- `/install-skill <nome>` — instala skill do registry
- `/use-skill <nome>` — ativa skill explicitamente
- `/clear-skill` — desativa skill ativa

### Auto-load de Skills Claude Code

Skills do Claude Code em `~/.claude/skills/` carregadas automaticamente.
Suporte a formato YAML frontmatter (`---`) além do formato Athion original.

### Arquivos Modificados

**`packages/core/src/skills/parser.ts`**:

- Dual-format parser: detecta `---\n` para YAML frontmatter ou usa parser Athion
- `SKILL.md` → nome vem do diretório pai
- `parseYamlFrontmatter()` manual sem dependências

**`packages/core/src/bootstrap.ts`**:

- Auto-load de `~/.claude/skills/` e `~/.athion/skills/`

**`packages/core/src/skills/types.ts` + `manager.ts`**:

- `setActive(name)`, `getActive()`, `clearActive()` adicionados

**`packages/core/src/orchestrator/prompt-builder.ts`**:

- Bloco `# ACTIVE SKILL` injetado com máxima prioridade antes das outras skills

**CLI (`packages/cli/src/`)**:

- `ui/SkillsMenu.tsx`: ação "Usar skill" (toggle), "Desativar skill ✓" quando ativa, indicador `●`
- `ui/StatusBar.tsx`: mostra `● skillName` quando skill ativa
- `ui/ChatApp.tsx`: `activeSkill` state, conecta SkillsMenu com core.skills
- `ui/UserInput.tsx`: autocomplete com `/use-skill`, `/clear-skill`, `/find-skills`, `/install-skill`
- `hooks/useChat.ts`: handlers para todos os novos slash commands

**VSCode (`packages/vscode/src/`)**:

- `bridge/messenger-types.ts`: novos tipos para skill:setActive, skills:find, etc.
- `webview/chat-view-provider.ts`: handlers RPC
- `webview/app/hooks/useChat.ts`: `activeSkill` state + slash commands

**Desktop (`packages/desktop/src/`)**:

- `src-tauri/src/commands.rs`: novos Rust commands
- `src-tauri/src/lib.rs`: registro dos commands
- `bridge/tauri-bridge.ts`: funções de bridge
- `hooks/useChat.ts`: `activeSkill` + slash commands

**`packages/cli/src/serve/handlers.ts`**:

- Handlers RPC: `plugin.search`, `plugin.install`, `skill.list`, `skill.setActive`, `skill.clearActive`

**`packages/core/src/index.ts`**:

- Exporta `createPluginInstaller`, `PluginSearchResult`, `InstallResult`

### Fluxo de Ativação Explícita

```
Usuário: /use-skill commit
→ core.skills.setActive('commit')
→ PromptBuilder injeta "# ACTIVE SKILL: commit\n<instruções>"
→ Todo response usa instruções da skill

Usuário: /clear-skill
→ core.skills.clearActive()
→ Modo automático (trigger-based) retoma
```

---

## Feature: Esc aborta streaming no CLI (2026-03-10)

**Status**: Concluído ✅
**Branch**: `fase-6/polish`

### Arquivos modificados

**`packages/cli/src/hooks/useChat.ts`**:

- Adicionado `abortRef = useRef(false)` para cancelamento sem stale closure
- `abortRef.current = false` no início de cada `sendMessage`
- `if (abortRef.current) break` dentro do `for await` do stream
- `abort()` exposto no retorno do hook — seta `abortRef.current = true`

**`packages/cli/src/hooks/useKeyboard.ts`**:

- Adicionado `onAbort?: () => void` ao interface `UseKeyboardOptions`
- `key.escape` → chama `onAbort()`

**`packages/cli/src/ui/ChatApp.tsx`**:

- Passa `onAbort: chat.abort` para `useKeyboard`

**`packages/cli/src/ui/UserInput.tsx`**:

- `key.escape` no `useInput` fecha o autocomplete (`setFileSuggestions([])`)
- Hint de teclado atualizado: `Esc abortar` adicionado

### VSCode e Desktop

- Botão "Parar" já existia e estava corretamente conectado ao `abort()` em ambos os surfaces
- VSCode: `chat.abort()` → `post({ type: 'chat:abort' })` → handler no `chat-view-provider.ts`
- Desktop: `abort()` → `bridge.chatAbort(sessionId)` → sidecar interrompe o stream

---

## Fix: VSCode Extension CoreBridge not connected (2026-03-11)

**Status**: Concluído ✅
**Branch**: `fase-6/polish`

### Problema

Após instalar a extensão 0.0.2 via `.vsix`, o VSCode mostrava:

```
Failed to create session: CoreBridge not connected
Connecting to '.../main.js.map' violates Content Security Policy
```

**Root cause**: `CoreBridge` resolvia o CLI path como `resolve(extensionPath, '..', 'cli', 'src', 'index.ts')`. Quando instalado em `~/.vscode/extensions/athion.athion-assistent-0.0.2/`, esse path não existe.

### Correção

**`packages/vscode/src/bridge/core-bridge.ts`**:

- Removido `extensionPath` do constructor (não era mais necessário)
- `cliPath` agora é `string | undefined` — quando undefined, spawn usa `athion serve --mode=stdio` (global binary com `shell: true`)
- Quando `cliPath` fornecido: `spawn(bunPath, [cliPath, 'serve', '--mode=stdio'])` (dev/monorepo)

**`packages/vscode/src/extension.ts`**:

- Adicionado `detectCliPath(extensionPath)` que tenta:
  1. `<workspaceRoot>/packages/cli/dist/index.js` (monorepo aberto no VS Code)
  2. `resolve(extensionPath, '..', 'cli', 'dist', 'index.js')` (dev)
  3. `resolve(extensionPath, '..', '..', 'packages', 'cli', 'dist', 'index.js')` (fallback)
- Se nenhum encontrado → passa `undefined` ao CoreBridge → usa global `athion`

**`packages/vscode/src/webview/chat-view-provider.ts`**:

- CSP: adicionado `connect-src ${webview.cspSource}` para evitar erro nos `.map` files
