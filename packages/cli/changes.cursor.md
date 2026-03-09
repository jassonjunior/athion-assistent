# Changes Log — Athion CLI

## Fase 3: CLI Terminal (Issue #4)

### Arquivos criados

**Entry point + Comandos:**

- `src/index.ts` — Entry point yargs com 6 subcomandos + default (chat)
- `src/commands/chat.ts` — Chat interativo + one-shot (-m). Imports dinâmicos para Ink
- `src/commands/config.ts` — Config CRUD (list, get, set) com parse automático de tipos
- `src/commands/agents.ts` — Lista subagentes disponíveis
- `src/commands/skills.ts` — Lista skills disponíveis
- `src/commands/sessions.ts` — Sessions CRUD (list, delete)
- `src/commands/serve.ts` — Stub para servidor HTTP (Fase 4)

**Tipos:**

- `src/types.ts` — ChatMessage, ToolCallInfo, SubAgentInfo, Theme, TokenInfo

**Hooks React:**

- `src/hooks/useChat.ts` — Consome AsyncGenerator do orchestrator, traduz eventos em estado React
- `src/hooks/useTheme.ts` — Carrega tema da config
- `src/hooks/useKeyboard.ts` — Atalhos (Ctrl+L = limpar)

**Componentes UI (Ink/React):**

- `src/ui/ChatApp.tsx` — Layout principal: StatusBar + MessageList + UserInput
- `src/ui/MessageList.tsx` — Renderiza histórico + streaming message
- `src/ui/StreamingMessage.tsx` — Texto com cursor piscante durante streaming
- `src/ui/UserInput.tsx` — Input ink-text-input com submit
- `src/ui/ToolCallDisplay.tsx` — Tool call com spinner/status
- `src/ui/SubAgentDisplay.tsx` — Subagente com progresso
- `src/ui/StatusBar.tsx` — Modelo, session, tokens
- `src/ui/Markdown.tsx` — Markdown básico (headers, bold, code, listas)

**Temas:**

- `src/themes/themes.ts` — 5 temas: default, dark, light, minimal, dracula
- `src/themes/index.ts` — Registry + getTheme()

### Arquivos modificados no core

- `packages/core/src/orchestrator/types.ts` — Adicionado `listSessions()` e `deleteSession()` ao Orchestrator
- `packages/core/src/orchestrator/orchestrator.ts` — Implementado `listSessions()` e `deleteSession()` delegando para SessionManager

### Decisões de design

1. **Sem Service Container** — `bootstrap()` já faz toda inicialização. Cada comando chama `bootstrap()` direto
2. **Imports dinâmicos no chat** — Ink/React carregados sob demanda. One-shot mode não carrega React
3. **Streaming via useChat** — Hook acumula texto via `streamingContentRef` + setState para re-render
4. **Tool calls inline** — Aparecem no meio da mensagem como cards com spinner
5. **Markdown simplificado** — Headers, bold, inline code, listas. Sem dependência externa

### Dependências adicionadas

- `yargs@18.0.0` — CLI argument parsing
- `ink@6.8.0` — React rendering engine para terminal
- `ink-text-input@6.0.0` — Input component
- `ink-spinner@5.0.0` — Spinner component
- `react@19.2.4` — React runtime (peer dep do Ink)
- `@types/yargs@17.0.35` (dev)
- `@types/react@19.2.14` (dev)
