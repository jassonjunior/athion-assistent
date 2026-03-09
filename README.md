# Athion Assistent

Assistente de codificação com IA, arquitetura **orquestrador + subagentes**. Opera em 3 interfaces: extensão VS Code/Cursor, CLI terminal e app desktop nativo (Tauri).

---

## Interfaces

| Interface                    | Descrição                                                             |
| ---------------------------- | --------------------------------------------------------------------- |
| **VS Code/Cursor Extension** | Sugestões inline (tab completion FIM) + chat sidebar + commands       |
| **CLI Terminal**             | Chat interativo estilo Claude Code com streaming em tempo real        |
| **Desktop App (Tauri)**      | App nativo com system tray, hotkey global (⌘⇧A), sessões persistentes |

---

## Quick Start

### CLI

```bash
# Instalar globalmente
bun install -g athion

# Iniciar chat
athion chat

# Continuar uma sessão anterior
athion chat --session <id>

# Ver configurações
athion config list

# Ajuda
athion --help
```

### VS Code

1. Abrir Extensions (`Ctrl+Shift+X`)
2. Buscar "Athion"
3. Instalar e recarregar
4. `Ctrl+Shift+A` para abrir o chat

### Desktop

```bash
# Baixar release para seu OS
# macOS: athion-desktop.dmg
# Linux: athion-desktop.AppImage
# Windows: athion-desktop-setup.exe
```

---

## Arquitetura

```
User
 │
 ▼
Orchestrator ──────────────────────────────────────────┐
 │                                                     │
 ├─► LLM Provider (vLLM local / OpenAI / Anthropic)  │
 │                                                     │
 ├─► Tool Registry                                    │
 │   ├─ read_file / write_file / list_files           │
 │   ├─ run_command (bash)                             │
 │   ├─ search (ripgrep)                              │
 │   └─ task (delega para SubAgent)                   │
 │                                                     │
 └─► SubAgent Manager                                 │
     ├─ coder      (escreve código)                   │
     ├─ debugger   (analisa erros)                    │
     ├─ reviewer   (code review)                      │
     ├─ tester     (escreve testes)                   │
     ├─ documenter (gera docs)                        │
     ├─ researcher (pesquisa)                         │
     └─ architect  (decisões de design)               │
                                                      │
Session Manager ◄─────────────────────────────────────┘
 └─ SQLite (histórico, sessões, permissões)
```

**Sidecar Pattern** (VS Code + Desktop): O processo Rust/Node.js principal se comunica com o core Bun via JSON-RPC 2.0 sobre stdio.

---

## Stack Tecnológica

| Camada     | Tecnologia                             |
| ---------- | -------------------------------------- |
| Runtime    | Bun 1.x                                |
| Linguagem  | TypeScript 5.8+ strict                 |
| Build      | Turborepo + Bun                        |
| LLM        | Vercel AI SDK 5.x + adapters           |
| Database   | SQLite WAL + Drizzle ORM               |
| CLI        | yargs 18.x + Ink 6 (React)             |
| IDE        | VS Code Extension API                  |
| Desktop    | Tauri 2.x + React 19 + Tailwind 4      |
| Testes     | Vitest (113+ testes unitários)         |
| Telemetria | OpenTelemetry (opt-in)                 |
| i18n       | 5 idiomas: pt-BR, en-US, es, fr, zh-CN |

---

## Desenvolvimento

```bash
# Instalar dependências
bun install

# Build todos os pacotes
bun run build

# Modo dev (watch)
bun run dev

# Testes unitários (core)
bun run --cwd packages/core node_modules/.bin/vitest run

# Testes com coverage
bun run --cwd packages/core node_modules/.bin/vitest run --coverage

# Benchmarks de performance
bun run packages/core/scripts/benchmark.ts

# Lint
bun run lint

# Typecheck
bun run typecheck
```

### Desktop (Tauri)

```bash
cd packages/desktop

# Dev mode
bun run tauri dev

# Build release
bun run tauri build

# E2E test (via sidecar JSON-RPC)
bun run scripts/test-e2e.ts
```

---

## Configuração

O Athion usa 5 fontes de configuração (prioridade crescente):

1. **Defaults** — valores padrão do schema Zod
2. **Global** — `~/.athion/config.json`
3. **Projeto** — `.athion/config.json` ou `athion.json`
4. **Env vars** — `ATHION_MODEL`, `ATHION_PROVIDER`, etc.
5. **CLI args** — `--model`, `--provider`

```json
// ~/.athion/config.json
{
  "provider": "vllm-mlx",
  "model": "Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4",
  "temperature": 0.7,
  "defaultPermission": "ask",
  "telemetry": false,
  "language": "pt-BR"
}
```

---

## Segurança

- **Permission System**: toda ação destrutiva requer confirmação (`defaultPermission: 'ask'`)
- **SQLite**: queries parametrizadas via Drizzle ORM (sem SQL injection)
- **API Keys**: lidas de env vars, nunca hardcoded ou logadas
- **Tauri CSP**: política restritiva configurada
- **Telemetria**: opt-in (`telemetry: false` por padrão), dados anonimizados

Ver [docs/security-audit.md](docs/security-audit.md) para auditoria completa.

---

## Fases do Projeto

| Fase | Nome                     | Status          |
| ---- | ------------------------ | --------------- |
| 0    | Bootstrap                | ✅ Concluída    |
| 1    | Core Foundation          | ✅ Concluída    |
| 2    | Orchestrator + SubAgents | ✅ Concluída    |
| 3    | CLI Terminal             | ✅ Concluída    |
| 4    | IDE Extension            | ✅ Concluída    |
| 5    | Desktop + OS Integration | ✅ Concluída    |
| 6    | Polish                   | 🔄 Em andamento |

---

## Licença

MIT
