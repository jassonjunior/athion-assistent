# Resumo Geral - Cobertura de Testes

## Visao Geral por Pacote

| Pacote            | Arquivos Impl. | Testes Unitarios        | Testes E2E            | Cobertura | Status   |
| ----------------- | -------------- | ----------------------- | --------------------- | --------- | -------- |
| **core**          | 84             | 441 casos (42 arquivos) | -                     | ~50%      | Moderada |
| **cli**           | 25             | 0                       | 23 casos (2 arquivos) | ~8%       | Critica  |
| **vscode**        | 20             | 9 casos (1 arquivo)     | -                     | ~0.4%     | Critica  |
| **desktop**       | 17             | 0                       | 17 E2E + 6 stories    | ~0% unit  | Critica  |
| **observability** | 19             | 0                       | 12 E2E                | ~0% unit  | Critica  |

## Prioridade de Acao

### P0 - CRITICO (Implementar ASAP)

1. **Core: Server/Proxy** - proxy.ts, streaming.ts, tokenizer.ts, compression.ts, middleware
2. **Core: Chunker & Embeddings** - chunker.ts, embeddings.ts (nucleo da busca semantica)
3. **Core: Plugin System** - manager.ts, installer.ts, scaffold.ts (0 testes)
4. **Core: Orchestrator Tool Dispatcher** - tool-dispatcher.ts
5. **CLI: Hooks criticos** - useChat.ts, usePermission.ts, useSession.ts
6. **VSCode: Core Bridge** - core-bridge.ts (comunicacao JSON-RPC)
7. **Desktop: Tauri Bridge** - tauri-bridge.ts (comunicacao IPC)
8. **Observability: WebSocket + Server** - useWebSocket.ts, index.ts, test-runner.ts

### P1 - ALTA (Proximas iteracoes)

1. Core: Server Managers (llama-cpp, lm-studio, mlx-omni, vllm)
2. Core: Proxy Middleware (safety-guard, think-stripper, tool-sanitizer)
3. Core: Skills Manager & Registry
4. Core: SubAgent Manager
5. CLI: Handlers de comandos
6. VSCode: Completion provider + context builder
7. Desktop: Chat hooks + event processing
8. Observability: Flow graph hooks + protocol

### P2 - MEDIA (Nice-to-have)

1. Core: Logger, Telemetry, Bootstrap
2. CLI: Temas, keyboard shortcuts
3. VSCode: React hooks (useChat, useAtMention, useInputAutocomplete)
4. Desktop: Componentes React (MessageList, Sidebar, StatusBar)
5. Observability: Componentes React + dagre layout

## Metricas Atuais

- **Total de arquivos de implementacao**: ~165
- **Total de testes existentes**: ~485 casos
- **Cobertura media estimada**: ~20%
- **Meta recomendada**: 70%+ nos modulos criticos
- **Testes necessarios estimados**: ~500+ novos casos
