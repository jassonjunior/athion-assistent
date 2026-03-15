# Observability - Testes Necessarios

## Status Atual

- **Cobertura unitaria**: 0%
- **E2E Playwright**: 12 testes (funcional, requer servidor)
- **Desktop E2E**: 15 stubs TODO
- **Nao testado**: 19 arquivos

## Prioridade P0 - Server Core

### server/index.ts

**O que faz**: Servidor WebSocket Bun, port discovery, static serving, broadcasting
**Testes propostos**:

```typescript
describe('ObservabilityServer', () => {
  it('inicia servidor na porta configurada')
  it('serve arquivos estaticos com MIME correto')
  it('retorna index.html para SPA fallback')
  it('aceita conexao WebSocket')
  it('broadcast envia para todos os clients')
  it('responde GET /api/tests com lista')
  it('responde GET /api/port com porta atual')
  it('escreve port file no startup')
  it('remove port file no shutdown')
})
```

### server/test-runner.ts

**O que faz**: Bootstrap do core, test registry, execucao, tracking de tokens
**Testes propostos**:

```typescript
describe('TestRunner', () => {
  it('listTests() retorna testes registrados')
  it('runTest() inicia execucao')
  it('runTest() rejeita execucao paralela')
  it('stopTest() cancela via AbortController')
  it('resetTokens() limpa contadores')
  it('estimateTextTokens() calcula corretamente')
  it('emitSubAgentEvent() mapeia para FlowEvent')
  it('rastreia tokens input/output/total')
})
```

### server/protocol.ts

**O que faz**: Tipos e conversores de protocolo WS
**Testes propostos**:

```typescript
describe('Protocol', () => {
  it('truncatePreview() trunca em maxLen')
  it('truncatePreview() nao trunca string curta')
  it('isFlowEvent() detecta FlowEventMessage')
  it('isFlowEvent() rejeita mensagem invalida')
  it('wsToFlowEvent() converte tipos corretos')
  it('PROTOCOL_VERSION e 1.0')
})
```

### server/flow-bridge.ts

**O que faz**: Descobre FlowServers ativos e retransmite eventos
**Testes propostos**:

```typescript
describe('FlowBridge', () => {
  it('conecta a FlowServer descoberto')
  it('retransmite eventos via broadcastRaw')
  it('desconecta de FlowServer que morreu')
  it('nao reconecta a PID ja conectado')
  it('polling periodico descobre novas instancias')
  it('cleanup fecha todas as conexoes')
})
```

## Prioridade P0 - Hooks Criticos

### hooks/useWebSocket.ts

**O que faz**: Conexao WebSocket com reconexao exponential backoff, max messages
**Testes propostos**:

```typescript
describe('useWebSocket', () => {
  it('conecta ao servidor')
  it('reconecta apos desconexao')
  it('backoff exponencial (1s, 2s, 4s, 8s...)')
  it('max reconnect attempts (20)')
  it('limita buffer de mensagens (MAX_MESSAGES=5000)')
  it('envia mensagem apenas se conectado')
  it('retorna status de conexao')
  it('cleanup fecha conexao na desmontagem')
})
```

### hooks/useFlowGraph.ts

**O que faz**: Constroi grafo ReactFlow a partir de eventos do orchestrator
**Testes propostos**:

```typescript
describe('useFlowGraph', () => {
  it('cria node para evento "start"')
  it('cria node para evento "content"')
  it('cria node para evento "tool_call"')
  it('cria node para evento "tool_result"')
  it('cria node para evento "complete"')
  it('cria edges entre nodes na ordem')
  it('atualiza node existente com novo conteudo')
  it('marca nodes de sub-agent corretamente')
  it('aplica layout dagre com posicoes validas')
  it('reseta grafo para novo teste')
})
```

### hooks/useTokenTracker.ts

**O que faz**: Tracking de tokens estimados vs reais
**Testes propostos**:

```typescript
describe('useTokenTracker', () => {
  it('inicializa com zero tokens')
  it('atualiza tokens estimados')
  it('atualiza tokens reais')
  it('calcula total (input + output)')
  it('reseta contadores')
})
```

## Prioridade P1 - Layout e Componentes

### layout/dagre-layout.ts (pure function)

```typescript
describe('DagreLayout', () => {
  it('retorna nodes com posicoes validas')
  it('posicoes sao nao-zero')
  it('edges mantem source/target')
  it('grafo vazio retorna arrays vazios')
  it('layout top-to-bottom por default')
})
```

### hooks/useFlowGraphLive.ts

```typescript
describe('useFlowGraphLive', () => {
  it('processa FlowEventMessage')
  it('converte para formato de node correto')
  it('atualiza grafo incrementalmente')
})
```

### hooks/useDesktopNotification.ts

```typescript
describe('useDesktopNotification', () => {
  it('envia notificacao via Tauri')
  it('nao envia se janela esta focada')
  it('nao faz nada fora do Tauri')
})
```

## Prioridade P2 - Componentes React

### components/LogPanelBase.tsx

```typescript
describe('LogPanelBase', () => {
  it('renderiza lista de logs')
  it('auto-scroll para ultimo log')
  it('pausa auto-scroll ao scrollar manualmente')
  it('retoma auto-scroll ao clicar botao')
})
```

### components/TestSelector.tsx

```typescript
describe('TestSelector', () => {
  it('renderiza opcoes de teste')
  it('chama onChange ao selecionar')
  it('exibe placeholder quando vazio')
})
```

### components/TokenBar.tsx

```typescript
describe('TokenBar', () => {
  it('exibe tokens input/output/total')
  it('formata numeros grandes (1.2k)')
  it('exibe zero quando sem tokens')
})
```

### components/ErrorBoundary.tsx

```typescript
describe('ErrorBoundary', () => {
  it('renderiza children normalmente')
  it('captura erro e exibe fallback')
  it('loga erro no console')
})
```

## Desktop E2E (TODO)

Os 15 testes desktop E2E precisam ser implementados:

- app-startup.e2e.ts (6 testes)
- lifecycle.e2e.ts (4 testes)
- test-execution.e2e.ts (5 testes)

Requer setup de tauri-driver para automacao.

## Estimativa Total

- **Testes unitarios necessarios**: ~70-90 casos
- **Desktop E2E a implementar**: 15 casos
- **Esforco**: 3-4 semanas (1 dev)
- **Prioridade**: P0 (server, WebSocket, flow graph), P1 (layout, hooks), P2 (componentes)
