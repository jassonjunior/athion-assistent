# Changes Log — Athion Core

## Issue #15 — Plugin System

### Arquivos criados

- `src/plugins/types.ts` — Interfaces do sistema de plugins
  - `PluginContext`: bus, config, tools, provider, log — o que o plugin acessa
  - `PluginDefinition`: name, version, onLoad, onUnload — contrato do plugin
  - `LoadedPlugin`: tracking interno (tools registradas, bus listeners)
  - `PluginManager`: load, unload, reload, loadFromDirectory, list, get, has

- `src/plugins/manager.ts` — Implementação do PluginManager
  - `createPluginManager(deps)` — factory function
  - Tracking automático: wrapa tools.register e bus.subscribe para rastrear
  - Cleanup automático no unload (mesmo se plugin não fizer)
  - Rollback no load se onLoad falhar
  - Hot-reload com cache-busting
  - loadFromDirectory busca index.ts/js ou plugin.ts/js

- `src/plugins/index.ts` — Exports públicos do módulo

- `src/plugins/scaffold.ts` — Gerador de template para novos plugins
  - `scaffoldPlugin(options)` — cria diretório com index.ts, package.json, README.md
  - Convenção de nome: `athion-plugin-<name>` no package.json
  - Flag `withExampleTool` para incluir tool funcional no template

- `src/plugins/installer.ts` — Busca e instala plugins do npm
  - `createPluginInstaller(options)` — factory function
  - `search(query)` — busca pacotes `athion-plugin-*` no npm
  - `install(name)` — instala via bun no diretório de plugins
  - `uninstall(name)` — remove pacote e diretório
  - `listInstalled()` — lista plugins instalados localmente

- `src/plugins/examples/hello-world/index.ts` — Plugin de exemplo funcional
  - Registra tool `greet` (saudação multilíngue pt/en/es)
  - Escuta evento `config.changed` no bus
  - Lê config atual no onLoad
  - Cleanup completo no onUnload

### Arquivos modificados

- `src/bus/events.ts` — Adicionados 3 eventos:
  - `plugin.loaded` (name, version, toolsRegistered[])
  - `plugin.unloaded` (name)
  - `plugin.error` (name, error)

- `src/bus/index.ts` — Exporta PluginLoaded, PluginUnloaded, PluginError

- `src/bootstrap.ts` — Integração do PluginManager:
  - Novo campo `pluginsDir` em BootstrapOptions (default: ~/.athion/plugins)
  - Novo campo `plugins` em AthionCore
  - PluginManager criado entre SubAgents e Orchestrator (nível 5.5)
  - Plugins carregam tools antes do orchestrator montar o prompt

- `src/index.ts` — Exporta createPluginManager, PluginContext, PluginDefinition, PluginManager

### Tool Level System (orchestrator vs agent)

- `src/tools/types.ts` — Adicionado campo `level?: 'orchestrator' | 'agent'` em ToolDefinition
  - `getToolLevel(tool)` — retorna level efetivo (default: 'orchestrator')
  - `isOrchestratorTool(tool)` — helper para filtrar tools acessíveis pelo orchestrator

- `src/tools/builtins.ts` — Core tools marcadas com `level: 'agent'`
  - read_file, write_file, list_files, run_command, search_files → agent only

- `src/orchestrator/prompt-builder.ts` — Usa `isOrchestratorTool()` para filtrar tools no prompt
  - Sem mais lista hardcoded AGENT_ONLY_TOOLS

- `src/orchestrator/orchestrator.ts` — Usa `isOrchestratorTool()` em 2 pontos:
  - `runStreamTurn()` — envia só tools orchestrator-level ao provider
  - `handleToolCalls()` — bloqueia chamadas a tools agent-only

- `src/orchestrator/tool-dispatcher.ts` — Usa `getToolLevel()` para permission check
  - Tools orchestrator-level (plugins) são trusted, skip permission
  - Tools agent-level passam por permission check normal

### Testes

- `scripts/test-plugin-system.ts` — 54 testes unitários (load, unload, reload, events, scaffold, hello-world)
- `scripts/test-plugin-e2e.ts` — Teste E2E com LLM: modelo chama tool greet do plugin com sucesso
- `scripts/test-tool-level-e2e.ts` — Teste E2E do Tool Level System com LLM (2 cenários):
  - Cenário A: modelo chama tool orchestrator-level (greet) direto → sucesso
  - Cenário B: modelo tenta read_file → bloqueado por handleToolCalls → redireciona via task → sucesso
  - Valida os 3 pontos de segurança: prompt-builder filtra, orchestrator bloqueia, dispatcher skip permission

### Decisões de design

1. **Plugin não acessa orchestrator nem DB** — segurança. Interage via bus, tools, config.
2. **Tracking via wrapper** — tools.register e bus.subscribe são interceptados silenciosamente.
3. **Cleanup automático** — no unload, tudo é removido mesmo sem onUnload.
4. **Eventos no bus** — outros módulos podem reagir sem acoplamento direto.
5. **loadFromDirectory silencioso** — diretório inexistente não é erro (primeira execução).
6. **Tool level como fonte da verdade** — sem listas hardcoded. Cada tool declara seu nível.
7. **Plugin tools são trusted** — admin instalou, skip permission check.
8. **Default level='orchestrator'** — plugins não precisam declarar level, funciona automaticamente.

---

## Agent Continuation Protocol + Summarize no SubAgent

### Arquivos modificados

- `src/subagent/agent.ts` — Duas melhorias:
  1. **Summarize via LLM no subagente**: quando contexto > 80%, usa o SummarizationService para resumir histórico (preservando semântica). Fallback para sliding-window se summarizer não disponível ou falhar
  2. **Turn-based continuation**: quando o agente esgota `maxTurns` mas ainda estava fazendo tool calls, sai com `status='partial'` para re-spawn automático
  - Novo campo `summarizer?: SummarizationService` em `SubAgentDeps`
  - Nova função `applySlidingWindow()` extraída para reuso
  - Flag `agentDone` para distinguir término natural vs esgotamento de turnos

- `src/subagent/manager.ts` — Passa `summarizer` para o subagente via `SubAgentDeps`
  - Novo campo `summarizer?: SummarizationService` em `SubAgentManagerDeps`

- `src/bootstrap.ts` — Cria `summarizer` e passa para `createSubAgentManager`
  - Subagentes agora compartilham o mesmo serviço de summarização do orchestrator

### Testes

- `scripts/test-continuation-e2e.ts` — Teste E2E do Continuation Protocol com LLM:
  - Reduz `maxTurns` do search agent para 3 no teste, forçando continuação
  - Cria 20 arquivos TypeScript temporários (289KB)
  - Valida que o task-tool re-spawna o agente automaticamente
  - Resultado: 4 continuações, resultado consolidado, transparente para orchestrator

### Decisões de design

1. **Summarize > sliding-window** — subagente agora preserva contexto semântico ao compactar
2. **Dois gatilhos de continuação**: context-based (contexto cheio) + turn-based (maxTurns esgotado)
3. **Transparente para orchestrator** — task-tool consolida resultado de todas as runs
4. **Fallback gracioso** — se summarize falhar, usa sliding-window mecânico

---

## Issue #16 — Smart Compaction via LLM (anterior)

- `src/tokens/summarize.ts` — SummarizationService com fallback para sliding-window
- `src/provider/provider.ts` — generateText() para chamadas não-streaming
- `src/tokens/manager.ts` — compact() agora async, estratégia 'summarize'
- `src/orchestrator/session.ts` — compress() async
- `src/orchestrator/orchestrator.ts` — prepareChat() async
- `src/bootstrap.ts` — summarizer wired, strategy = 'summarize'

## Correções anteriores

- `src/subagent/builtins.ts` — Renomeado agent 'code-reviewer' → 'code-review' (alinhado com skill)
- `src/tools/task-tool.ts` — fuzzyMatchAgent() para nomes aproximados
- `scripts/test-e2e-summarize.ts` — E2E test validando compaction em todos os agentes
