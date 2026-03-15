# Desktop App (Tauri) - Testes Necessarios

## Status Atual

- **Cobertura unitaria**: 0%
- **E2E**: 17 testes (Playwright) + 6 Storybook stories
- **Desktop E2E**: 15 stubs TODO (nenhum implementado)
- **Nao testado**: 15 arquivos de implementacao

## Prioridade P0 - Bridge e Chat Core

### bridge/tauri-bridge.ts (263 linhas)

**O que faz**: Comunicacao IPC entre React e Rust backend via Tauri invoke/listen
**Testes propostos**:

```typescript
// Mock do @tauri-apps/api
vi.mock('@tauri-apps/api', () => ({
  invoke: vi.fn(),
  event: { listen: vi.fn(), once: vi.fn() },
}))

describe('TauriBridge', () => {
  describe('chat', () => {
    it('chatSend() invoca comando correto com params')
    it('chatAbort() envia sinal de abort')
    it('onChatEvent() registra listener de eventos')
  })

  describe('sessions', () => {
    it('sessionCreate() retorna sessao com ID')
    it('sessionList() retorna array de sessoes')
    it('sessionLoad() retorna sessao por ID')
    it('sessionDelete() remove sessao')
  })

  describe('config', () => {
    it('configGet() retorna valor por chave')
    it('configSet() persiste valor')
    it('configList() retorna todas as configs')
  })

  describe('plugins/skills', () => {
    it('pluginSearch() busca no registry')
    it('pluginInstall() instala plugin')
    it('skillList() lista skills disponiveis')
    it('skillSetActive() ativa skill')
    it('skillClearActive() desativa skill')
  })

  describe('health', () => {
    it('ping() retorna pong')
    it('sidecarStatus() retorna status')
  })

  describe('deep links', () => {
    it('onDeepLinkSession() registra listener')
    it('onDeepLinkMessage() registra listener')
    it('onDeepLinkNew() registra listener')
    it('onDeepLinkConfig() registra listener')
  })
})
```

### hooks/useChat.ts (247 linhas)

**O que faz**: Estado completo do chat com retry, comandos especiais, streaming
**Testes propostos**:

```typescript
describe('useChat (Desktop)', () => {
  describe('inicializacao', () => {
    it('cria sessao com retry (max 10 tentativas)')
    it('conecta ao bridge na montagem')
    it('registra listener de eventos')
  })

  describe('comandos especiais', () => {
    it('parseia /use-skill <name> e ativa skill')
    it('parseia /clear-skill e desativa skill')
    it('parseia /find-skills <query> e busca')
    it('parseia /install-skill <name> e instala')
    it('envia mensagem normal sem prefixo /')
  })

  describe('streaming', () => {
    it('acumula content events em mensagem')
    it('finaliza com finish event')
    it('permite abort durante streaming')
  })

  describe('sessao', () => {
    it('cria nova sessao')
    it('troca para sessao existente')
  })
})
```

### hooks/chat-events.ts (200 linhas)

**O que faz**: Factory de handler para processar eventos do sidecar
**Testes propostos**:

```typescript
describe('ChatEventHandler', () => {
  it('handleContent() acumula texto')
  it('handleContent() faz flush com throttle')
  it('handleToolCall() cria tool call entry')
  it('handleToolResult() atualiza resultado')
  it('handleError() marca erro na mensagem')
  it('flushAssistant() persiste mensagem final')
  it('processa eventos na ordem correta')
})
```

## Prioridade P1 - Hooks e Componentes

### hooks/useInputAutocomplete.ts (255 linhas)

```typescript
describe('useInputAutocomplete (Desktop)', () => {
  it('detecta /use-skill pattern')
  it('detecta @ pattern para files')
  it('debounce de 150ms na busca')
  it('navegacao por teclado (setas, tab, enter)')
  it('insere item selecionado no input')
  it('fecha dropdown com Escape')
  it('lazy loading de skills')
})
```

### hooks/useDeepLink.ts

```typescript
describe('useDeepLink', () => {
  it('registra listeners para 4 tipos de deep link')
  it('chama callback correto para athion://session/<id>')
  it('chama callback correto para athion://message/<text>')
  it('cleanup remove listeners na desmontagem')
})
```

### hooks/useTheme.ts

```typescript
describe('useTheme', () => {
  it('carrega tema de localStorage')
  it('fallback para system preference')
  it('toggle alterna dark/light')
  it('persiste mudanca em localStorage')
  it('atualiza classList do document')
})
```

## Prioridade P2 - Componentes React

### components/InputArea.tsx

```typescript
describe('InputArea', () => {
  it('auto-resize do textarea')
  it('submit com Enter')
  it('nova linha com Shift+Enter')
  it('nao submete input vazio')
  it('exibe dropdown de autocomplete')
  it('mostra botao abort durante streaming')
})
```

### components/MessageList.tsx

```typescript
describe('MessageList', () => {
  it('renderiza mensagens user e assistant')
  it('auto-scroll ao adicionar mensagem')
  it('parseia code blocks com linguagem')
  it('renderiza tool call cards')
  it('exibe feedback phrase durante streaming')
  it('exibe empty state sem mensagens')
})
```

### components/Sidebar.tsx

```typescript
describe('Sidebar', () => {
  it('carrega e lista sessoes')
  it('toggle collapse/expand')
  it('seleciona sessao ao clicar')
  it('formata data corretamente')
  it('destaca sessao ativa')
})
```

### components/CodeBlock.tsx

```typescript
describe('CodeBlock', () => {
  it('renderiza codigo com label de linguagem')
  it('copia para clipboard ao clicar')
  it('exibe feedback "Copiado!" temporario')
})
```

### components/ToolCallCard.tsx

```typescript
describe('ToolCallCard', () => {
  it('renderiza status running com spinner')
  it('renderiza status completed com check')
  it('renderiza status error com icone')
  it('trunca preview em 300 chars')
})
```

### components/StatusBar.tsx

```typescript
describe('StatusBar', () => {
  it('exibe "Conectado" quando online')
  it('exibe "Desconectado" quando offline')
  it('exibe "Conectando..." durante reconexao')
})
```

## Desktop E2E (TODO - nao implementados)

### e2e/desktop/app-startup.e2e.ts (6 stubs)

```
- should open window with title "Athion Observability"
- should show loading state initially
- should transition to ready state after sidecar starts
- should display connection status indicator
- should have minimum size of 800x500
- should be resizable and centered
```

### e2e/desktop/lifecycle.e2e.ts (4 stubs)

```
- should kill sidecar when window is closed
- should not leave orphan processes
- should auto-restart sidecar after crash
- should stop restarting after 3 crashes in 60s
```

### e2e/desktop/test-execution.e2e.ts (5 stubs)

```
- should select and run a test
- should show events in FlowPanel
- should show events in LogPanel
- should receive test:finished event
- should reject parallel test execution
```

## Estimativa Total

- **Testes unitarios necessarios**: ~80-100 casos
- **Desktop E2E a implementar**: 15 casos
- **Esforco**: 3-4 semanas (1 dev)
- **Prioridade**: P0 (bridge, useChat, chat-events), P1 (hooks), P2 (componentes)
