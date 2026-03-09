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
