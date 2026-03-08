# Changes Log - Athion Assistent

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
