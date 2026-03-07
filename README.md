# Athion Assistent

AI coding assistant with **orchestrator + subagents** architecture.

## Interfaces

1. **VS Code/Cursor Extension** - Inline suggestions (tab completion) + chat sidebar
2. **CLI Terminal** - Interactive chat (Claude Code style)
3. **Desktop App (Tauri)** - Native desktop application

## Architecture

The orchestrator receives user messages, decides whether to use direct tools or delegate to specialized subagents, and manages the streaming cycle.

```
User -> Orchestrator -> LLM Provider
                     -> Tool Registry (13 built-in tools)
                     -> SubAgent Manager (specialized agents)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.x |
| Language | TypeScript 5.8+ strict |
| Build | Turborepo + Bun |
| LLM | Vercel AI SDK 5.x + adapters |
| Database | SQLite WAL + Drizzle ORM |
| CLI | yargs 18.x + Ink 6 (React) |
| IDE | VS Code Extension API |
| Desktop | Tauri 2.x + React 19 + Tailwind 4 |
| Tests | Vitest + Playwright |

## Project Phases

| Phase | Name | Weeks | Description |
|-------|------|-------|-------------|
| **0** | Bootstrap | 1-2 | Monorepo setup, CI/CD, base infrastructure |
| **1** | Core Foundation | 3-5 | Config, Event Bus, Storage, Provider Layer, Tools, Permissions, Skills, Token Manager |
| **2** | Orchestrator + SubAgents | 6-8 | Orchestrator, SubAgent Manager, Task Tool, Built-in Skills & Agents |
| **3** | CLI Terminal | 9-11 | Terminal interface with Ink/React, yargs, streaming, session history |
| **4** | IDE Extension | 12-15 | VS Code/Cursor extension, FIM autocomplete, chat webview, indexing |
| **5** | Desktop + OS Integration | 16-20 | Tauri app, system tray, hotkeys, deep links, context menus, distribution |
| **6** | Polish | 21-23 | Tests, telemetry, docs, performance, security audit, i18n |

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Development mode
bun run dev

# Run tests
bun run test

# Lint
bun run lint
```

## License

MIT
