# Changes Log — Athion VS Code Extension

## Fase 4: IDE Extension (Issue #5)

### Arquivos criados

**Bridge (IPC):**

- `src/bridge/core-bridge.ts` — JSON-RPC client, spawna Bun child process
- `src/bridge/protocol.ts` — Tipos JSON-RPC 2.0, methods, notifications
- `src/bridge/messenger.ts` — Extension ↔ Webview postMessage tipado
- `src/bridge/messenger-types.ts` — WebviewToExtension, ExtensionToWebview unions

**Extension Core:**

- `src/extension.ts` — activate/deactivate, inicializa CoreBridge + WebviewProvider
- `src/commands/index.ts` — 14 comandos registrados com keybindings
- `src/context/selection-context.ts` — Extrai seleção do editor com metadata

**Inline Completion (FIM):**

- `src/completion/inline-provider.ts` — InlineCompletionItemProvider com debounce
- `src/completion/context-builder.ts` — Prefix/suffix para FIM prompt

**Diff Viewing:**

- `src/diff/diff-manager.ts` — Decorações + accept/reject por bloco

**Webview (React Chat):**

- `src/webview/chat-view-provider.ts` — WebviewViewProvider com CSP e nonce
- `src/webview/app/main.tsx` — Entry React
- `src/webview/app/App.tsx` — Layout principal
- `src/webview/app/hooks/useChat.ts` — Estado do chat via Messenger
- `src/webview/app/hooks/useMessenger.ts` — postMessage abstraction
- `src/webview/app/components/MessageList.tsx` — Lista com auto-scroll
- `src/webview/app/components/CodeBlock.tsx` — Code block com copiar
- `src/webview/app/components/ToolCallCard.tsx` — Tool call com status
- `src/webview/app/components/InputArea.tsx` — Textarea com Ctrl+Enter
- `src/webview/app/components/DiffView.tsx` — Diff inline
- `src/webview/app/styles/vscode.css` — CSS com variáveis --vscode-\*

**Build:**

- `esbuild.config.mjs` — Bundle extensão (Node/CJS)
- `esbuild.webview.mjs` — Bundle webview (browser/IIFE)
- `resources/icon.svg` — Ícone da extensão

**Testes:**

- `scripts/test-stdio-e2e.ts` — Teste E2E JSON-RPC stdio com modelo

### Arquivos modificados

**CLI (serve command):**

- `packages/cli/src/commands/serve.ts` — Reescrito: suporta --mode=stdio
- `packages/cli/src/serve/stdio-server.ts` — JSON-RPC server sobre stdin/stdout
- `packages/cli/src/serve/handlers.ts` — Handlers para cada método RPC

### Decisões de design

1. **JSON-RPC 2.0 over stdio** — Padrão LSP/MCP. Sem problemas de porta/firewall
2. **esbuild** — Extensão (14kb CJS) + Webview (196kb com React bundlado)
3. **CSS `--vscode-*`** — Herda tema do VS Code automaticamente
4. **Codebase Indexer adiado** — Fase 6 (binários nativos complexos)
5. **EventEmitter manual** — Evita problemas de tipos com node:events no contexto VS Code
6. **React/react-dom em devDependencies** — Só usado no build do webview

### Testes E2E

- ping → pong ✓
- session.create ✓
- chat.send com streaming ✓ (6 chunks, 1.5s)
- config.list ✓
- agents.list ✓ (7 agentes)
- tools.list ✓ (6 tools)
