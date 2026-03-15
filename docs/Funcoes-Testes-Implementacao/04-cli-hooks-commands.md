# CLI: Hooks e Commands - Testes Necessarios

## Status Atual

- **Cobertura**: CRITICA (0% unitario, apenas 23 E2E)
- **Testado**: Apenas E2E (cli.e2e, stdio-rpc.e2e)
- **Nao testado**: 22 arquivos de implementacao

## Hooks Criticos (Prioridade P0)

### useChat.ts

**O que faz**: Gerencia estado do chat, slash commands, @mentions, streaming de LLM
**Testes propostos**:

```typescript
describe('useChat', () => {
  describe('slash commands', () => {
    it('executa /clear e limpa historico')
    it('executa /help e exibe ajuda')
    it('executa /agents e lista agents')
    it('executa /skills e lista skills')
    it('rejeita comando desconhecido com mensagem')
    it('parseia comando com argumentos')
  })

  describe('@mentions', () => {
    it('detecta @filename e injeta conteudo')
    it('lida com arquivo inexistente')
    it('suporta multiplos @mentions na mesma mensagem')
  })

  describe('streaming', () => {
    it('acumula content events')
    it('finaliza com finish event')
    it('lida com error event')
    it('permite abort durante streaming')
  })

  describe('sessao', () => {
    it('cria sessao no primeiro uso')
    it('carrega sessao existente por ID')
  })
})
```

### usePermission.ts

**O que faz**: Gerencia requisicoes de permissao para execucao de tools
**Testes propostos**:

```typescript
describe('usePermission', () => {
  it('solicita permissao para tool nao autorizada')
  it('permite tool ja autorizada')
  it('registra decisao "sempre permitir"')
  it('registra decisao "negar"')
  it('reseta permissoes')
})
```

### useSession.ts

**O que faz**: CRUD de sessoes de chat
**Testes propostos**:

```typescript
describe('useSession', () => {
  it('cria nova sessao')
  it('lista sessoes existentes')
  it('carrega sessao por ID')
  it('deleta sessao')
  it('atualiza titulo da sessao')
})
```

### useIndexingProgress.ts

**O que faz**: Escuta eventos de indexacao via Bus
**Testes propostos**:

```typescript
describe('useIndexingProgress', () => {
  it('atualiza progresso ao receber IndexingStarted')
  it('finaliza ao receber IndexingCompleted')
  it('exibe erro ao receber IndexingFailed')
  it('reseta estado ao iniciar nova indexacao')
})
```

## Commands (Prioridade P1)

### config.ts

```typescript
describe('config command', () => {
  describe('list', () => {
    it('lista todas as configuracoes')
    it('formata output corretamente')
  })
  describe('get', () => {
    it('retorna valor de chave existente')
    it('retorna erro para chave inexistente')
  })
  describe('set', () => {
    it('define valor de configuracao')
    it('valida tipo do valor')
  })
})
```

### codebase.ts

```typescript
describe('codebase command', () => {
  describe('index', () => {
    it('inicia indexacao do workspace')
    it('exibe progresso')
  })
  describe('search', () => {
    it('busca no indice semantico')
    it('retorna resultados formatados')
  })
  describe('status', () => {
    it('exibe status do indice')
  })
  describe('clear', () => {
    it('limpa indice com confirmacao')
  })
})
```

### remote.ts

```typescript
describe('remote command', () => {
  it('adiciona remote repo')
  it('lista remotes configurados')
  it('remove remote')
  it('sincroniza remote')
  it('limpa cache de remotes')
})
```

### sessions.ts

```typescript
describe('sessions command', () => {
  it('lista sessoes com formatacao')
  it('deleta sessao por ID')
  it('confirma antes de deletar')
})
```

## Serve Layer (Prioridade P1)

### handlers.ts (testes unitarios alem do E2E)

```typescript
describe('RPC Handlers', () => {
  it('config.list retorna todas as configs')
  it('config.get retorna valor especifico')
  it('config.set persiste valor')
  it('session.create retorna ID unico')
  it('session.list retorna array de sessoes')
  it('session.delete remove sessao')
  it('chat.send inicia streaming')
  it('chat.abort para streaming')
  it('tools.list retorna tools registradas')
  it('agents.list retorna agents disponiveis')
  it('metodo invalido retorna erro RPC')
})
```

## Temas (Prioridade P2)

### themes/index.ts

```typescript
describe('ThemeRegistry', () => {
  it('retorna tema por nome')
  it('lista todos os temas disponiveis')
  it('retorna tema default para nome invalido')
  it('cada tema tem todas as cores obrigatorias')
})
```

## Estimativa Total

- **Testes necessarios**: ~80-100 casos
- **Esforco**: 2-3 semanas (1 dev)
- **Prioridade**: P0 (hooks), P1 (commands, handlers), P2 (temas)
