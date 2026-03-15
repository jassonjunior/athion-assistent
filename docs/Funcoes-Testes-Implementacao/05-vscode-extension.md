# VSCode Extension - Testes Necessarios

## Status Atual

- **Cobertura**: CRITICA (0.4% - apenas layout.ts com 9 testes)
- **Testado**: graph/layout.ts (9 testes - EXCELENTE)
- **Nao testado**: 19 arquivos

## Prioridade P0 - Bridge e Extension Core

### bridge/core-bridge.ts

**O que faz**: Comunicacao JSON-RPC com processo Bun via stdio (spawn, send, receive, timeout)
**Testes propostos**:

```typescript
describe('CoreBridge', () => {
  it('spawna processo Bun com args corretos')
  it('envia mensagem JSON-RPC valida')
  it('resolve promise ao receber response')
  it('rejeita promise ao receber error')
  it('lida com timeout de request')
  it('detecta path do bun')
  it('emite evento "exit" ao processo morrer')
  it('emite evento "error" em falha de parse')
  it('lida com mensagens parciais (buffer)')
  it('descarta response sem request pendente')
  it('gerencia multiple requests simultaneos')
  it('reconstroi PATH expandido')
})
```

### extension.ts

**O que faz**: Ponto de entrada da extensao (activate, deactivate, registro de providers)
**Testes propostos**:

```typescript
describe('Extension', () => {
  it('ativa extensao e inicializa bridge')
  it('registra todos os commands')
  it('cria ChatViewProvider')
  it('cria InlineCompletionProvider')
  it('cria DiffManager')
  it('desativa e limpa recursos')
  it('detecta path do CLI')
  it('loga erros do bridge')
})
```

### diff/diff-manager.ts

**O que faz**: Gerencia diffs inline com accept/reject
**Testes propostos**:

```typescript
describe('DiffManager', () => {
  it('adiciona diff com decoracoes corretas')
  it('aceita diff e aplica mudanca')
  it('rejeita diff e remove decoracao')
  it('encontra diff na posicao do cursor')
  it('limpa todos os diffs')
  it('atualiza decoracoes ao editar documento')
})
```

## Prioridade P0 - Completion

### completion/inline-provider.ts

**O que faz**: Provedor de inline completion que consulta CoreBridge
**Testes propostos**:

```typescript
describe('InlineCompletionProvider', () => {
  it('retorna completion para posicao valida')
  it('nao retorna completion em linha vazia')
  it('nao retorna completion em comentario')
  it('respeita configuracao athion.inlineEnabled')
  it('lida com timeout do bridge')
  it('respeita cancellation token')
  it('constroi contexto FIM corretamente')
})
```

### completion/context-builder.ts

**O que faz**: Extrai contexto Fill-in-the-Middle para completion
**Testes propostos**:

```typescript
describe('CompletionContextBuilder', () => {
  it('extrai prefix das linhas anteriores')
  it('extrai suffix das linhas posteriores')
  it('respeita MAX_PREFIX_LINES (100)')
  it('respeita MAX_SUFFIX_LINES (50)')
  it('lida com cursor no inicio do arquivo')
  it('lida com cursor no fim do arquivo')
})
```

## Prioridade P1 - Webview Hooks

### webview/app/hooks/useChat.ts

```typescript
describe('useChat (VSCode)', () => {
  it('envia mensagem via messenger')
  it('acumula content de streaming')
  it('processa tool calls')
  it('executa slash commands')
  it('gerencia estado de sessao')
  it('lida com erro do bridge')
})
```

### webview/app/hooks/useAtMention.ts

```typescript
describe('useAtMention', () => {
  it('detecta @ pattern no input')
  it('abre dropdown com resultados')
  it('navega com setas no dropdown')
  it('insere mention selecionada')
  it('fecha dropdown com Escape')
  it('busca arquivos do workspace')
})
```

### webview/app/hooks/useInputAutocomplete.ts

```typescript
describe('useInputAutocomplete', () => {
  it('detecta / para comandos')
  it('detecta @ para files')
  it('navega entre modos (command, skill, file)')
  it('insere item selecionado')
  it('fecha menu com Escape')
  it('fecha menu ao clicar fora')
})
```

### webview/app/hooks/chat-events.ts

```typescript
describe('ChatEventProcessor', () => {
  it('processa content event com throttle (50ms)')
  it('processa tool_call event')
  it('processa tool_result event')
  it('processa finish event')
  it('processa error event')
  it('faz flush de conteudo acumulado')
})
```

## Prioridade P1 - Bridge Messaging

### bridge/messenger.ts

```typescript
describe('Messenger', () => {
  it('registra handler para tipo de mensagem')
  it('dispatcha mensagem para handler correto')
  it('suporta wildcard handler')
  it('remove handler no dispose')
  it('envia mensagem via webview.postMessage')
})
```

### context/selection-context.ts

```typescript
describe('SelectionContext', () => {
  it('extrai texto selecionado')
  it('retorna linguagem do arquivo')
  it('retorna path relativo')
  it('lida com selecao vazia')
})
```

## Prioridade P2

### chat-view-provider.ts

```typescript
describe('ChatViewProvider', () => {
  it('resolve webview view')
  it('configura HTML com CSP correto')
  it('registra message handlers')
  it('encaminha chat events')
})
```

### commands/index.ts

```typescript
describe('CommandRegistry', () => {
  it('registra todos os comandos')
  it('cada comando tem handler')
  it('dispose limpa subscriptions')
})
```

### panels/dependency-graph-panel.ts

```typescript
describe('DependencyGraphPanel', () => {
  it('cria panel (singleton)')
  it('carrega dados do grafo')
  it('processa mensagens do webview')
})
```

## Estimativa Total

- **Testes necessarios**: ~110-135 casos
- **Esforco**: 4-5 semanas (1 dev)
- **Prioridade**: P0 (bridge, extension, completion), P1 (hooks, messenger), P2 (providers, panels)
