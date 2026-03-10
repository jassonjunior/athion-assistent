# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Fase 6 Polish: testes unitários para orchestrator, subagent e provider
- Codebase Indexer com busca FTS + vetorial híbrida
- Tree-sitter chunker com fallback para regex
- `@mentions` de arquivos/símbolos no webview VS Code
- Deep links `athion://` no Tauri (chat, new session, config)
- i18n com 5 locales: pt-BR, en-US, es, fr, zh-CN
- OpenTelemetry telemetria opt-in para todas operações LLM
- Pino structured logging no bootstrap
- GitHub Actions: publicação npm, VS Code Marketplace, desktop builds

## [0.1.0-beta] - 2026-03-09

### Added

#### Core (`@athion/core`)

- Config Manager com hierarquia de 5 níveis (defaults < global < project < env < CLI args)
- Event Bus tipado com pub/sub e validação Zod
- Storage Module com SQLite WAL + Drizzle ORM (sessions, messages, permissions)
- Provider Layer: 6 providers LLM (vllm-mlx, ollama, openai, anthropic, google, openrouter)
- Token Manager com budget tracking, compaction e loop detection
- Skill Manager com parser de arquivos `.md` e descoberta de diretórios
- Permission System com glob matching e 3 níveis de prioridade
- Tool Registry com `defineTool` helper e 13 tools built-in
- Orchestrator com chat loop streaming, session management e tool dispatch
- SubAgent Manager com task-based execution model e continuation protocol
- Plugin System com hooks para extensão do core
- Proxy MITM entre Athion e vllm-mlx com middleware pipeline
- Smart Compaction: sliding-window + summarização via LLM
- Bootstrap: factory única que inicializa todas as dependências
- Codebase Indexer com tree-sitter chunking, embeddings e busca híbrida FTS+vetorial
- OpenTelemetry telemetria para LLM calls, tools e subagentes
- Pino structured logging com níveis configuráveis

#### CLI (`@athion/cli`)

- Chat interativo com markdown rendering, syntax highlighting e themes
- Commands: `chat`, `serve`, `config`, `codebase`
- Hooks: `useSession`, `usePermission`, `useChat`
- Componentes TUI: `ChatApp`, `PermissionPrompt`
- Servidor JSON-RPC stdio (`--mode=stdio`) para integração com VS Code e Desktop
- Handlers: `chat.send`, `chat.abort`, `session.*`, `config.*`, `codebase.*`

#### VS Code Extension (`athion-assistent`)

- Webview com chat streaming, FIM completion e diff viewing
- Bridge TypeScript↔Extension via messenger tipado
- `@mentions` de arquivos/símbolos com busca no codebase indexer
- Deep links `athion://` para abrir sessões e configurações
- Commands: `athion.openChat`, `athion.newSession`, `athion.abortChat`

#### Desktop (`@athion/desktop`)

- App Tauri 2.x com React 19 + Tailwind 4
- Sidecar Bun via JSON-RPC stdio (mesmo padrão do VS Code)
- System tray com menu de ações
- Global hotkey `Cmd+Shift+A` para Quick Chat overlay
- Deep links `athion://` para controle externo
- Notificações nativas via `tauri-plugin-notification`
- Sidebar com lista de sessões (criar/selecionar/deletar)
- StatusBar com status do sidecar e tokens

#### Shared (`@athion/shared`)

- Protocol types para JSON-RPC stdio
- i18n com 5 locales (pt-BR, en-US, es, fr, zh-CN)

### Infrastructure

- Monorepo com Turborepo + Bun workspaces
- TypeScript 5.8 strict mode em todos os packages
- ESLint 9 + Prettier + Husky + lint-staged
- GitHub Actions CI: typecheck, lint, test, build, coverage, security audit, E2E
- GitHub Actions release: bump semver, tags, GitHub Release
- GitHub Actions publish: npm provenance, VS Code Marketplace, Tauri cross-platform builds

[Unreleased]: https://github.com/jassonjunior/athion-assistent/compare/v0.1.0-beta...HEAD
[0.1.0-beta]: https://github.com/jassonjunior/athion-assistent/releases/tag/v0.1.0-beta
