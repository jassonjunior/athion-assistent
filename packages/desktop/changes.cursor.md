# Changes Log — Athion Desktop App

## Fase 5: Desktop App + OS Integration (Tauri 2.x)

### Arquivos criados

**Rust Backend (src-tauri/):**

- `src/main.rs` — Entry point Tauri
- `src/lib.rs` — Module declarations, plugins, setup
- `src/sidecar.rs` — SidecarManager: spawna Bun, JSON-RPC proxy, stdout reader
- `src/commands.rs` — 11 Tauri commands (thin proxy para sidecar)
- `src/tray.rs` — System tray com menu (Abrir, Nova Sessão, Sair)
- `src/hotkeys.rs` — Global hotkey Cmd+Shift+A
- `Cargo.toml` — deps: tauri 2.x, tokio, serde, plugins
- `tauri.conf.json` — Window config, plugins, bundle
- `capabilities/default.json` — Permissions para plugins
- `build.rs` — Tauri build script

**React Frontend (src/):**

- `main.tsx` — React entry point
- `App.tsx` — Layout: header + sidebar + chat + status bar
- `bridge/tauri-bridge.ts` — invoke() + listen() wrapper
- `bridge/types.ts` — Re-export tipos de @athion/shared
- `hooks/useChat.ts` — Estado do chat via Tauri bridge
- `hooks/chat-events.ts` — Event processing (copiado do VS Code)
- `hooks/useTheme.ts` — Dark/light mode toggle
- `components/MessageList.tsx` — Lista com auto-scroll (Tailwind)
- `components/CodeBlock.tsx` — Code block com copiar (Tailwind)
- `components/ToolCallCard.tsx` — Card com status (Tailwind)
- `components/InputArea.tsx` — Textarea com Enter (Tailwind)
- `components/Sidebar.tsx` — Lista de sessões (novo)
- `components/StatusBar.tsx` — Status do sidecar (novo)
- `styles/app.css` — Tailwind 4 + tema custom

**Config:**

- `package.json` — React, Tauri deps, Vite, Tailwind
- `tsconfig.json` — jsx: react-jsx, noEmit
- `vite.config.ts` — Vite 6 + React + Tailwind
- `index.html` — Entry HTML com dark mode

### Arquivos modificados

**Monorepo (shared):**

- `packages/shared/src/protocol.ts` — Movido de packages/vscode (compartilhado)
- `packages/shared/src/index.ts` — Re-export protocol types
- `packages/vscode/src/bridge/protocol.ts` — Re-export de @athion/shared

### Decisões de design

1. **Sidecar Bun via JSON-RPC stdio** — Mesmo padrão do VS Code CoreBridge
2. **Rust thin proxy (~200 linhas)** — Zero lógica de negócio em Rust
3. **Tailwind 4** — Substitui CSS com --vscode-\* variables
4. **chat-events.ts idêntico** — Lógica de eventos copiada sem mudanças
5. **Componentes adaptados** — Mesma lógica, CSS convertido para Tailwind classes
6. **Sidebar exclusiva do desktop** — Lista de sessões com create/delete

### Arquitetura

```
React → invoke('chat_send') → Rust commands.rs
  → SidecarManager.request() → stdin JSON-RPC → Bun stdio-server
  → handlers.ts → orchestrator.chat() → OrchestratorEvent
  → stdout JSON-RPC → Rust spawn_reader → app.emit('chat:event')
  → React listen('chat:event') → useChat state update
```

### Status

- **Branch**: `fase-5/desktop-os-integration`
- **Rust**: compila sem erros nem warnings
- **Frontend**: estrutura completa, precisa de `cargo tauri dev` para teste E2E
