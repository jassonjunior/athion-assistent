# Core: Plugins, Skills, SubAgent - Testes Necessarios

## 1. Plugin System (0 testes - CRITICO)

### plugins/manager.ts

**O que faz**: Gerencia ciclo de vida de plugins (load, unload, list, activate)
**Testes propostos**:

```typescript
describe('PluginManager', () => {
  it('carrega plugin de diretorio valido')
  it('rejeita plugin com manifest invalido')
  it('lista plugins instalados')
  it('ativa plugin')
  it('desativa plugin')
  it('descarrega plugin e limpa recursos')
  it('detecta conflito entre plugins')
  it('lida com plugin que falha ao carregar')
})
```

### plugins/installer.ts

**O que faz**: Instala plugins de registry (npm-like)
**Testes propostos**:

```typescript
describe('PluginInstaller', () => {
  it('instala plugin de registry')
  it('valida versao compativel')
  it('desinstala plugin e remove arquivos')
  it('atualiza plugin para nova versao')
  it('lida com falha de download')
  it('valida checksum do pacote')
})
```

### plugins/scaffold.ts

**O que faz**: Gera estrutura inicial de novo plugin
**Testes propostos**:

```typescript
describe('PluginScaffold', () => {
  it('cria estrutura de diretorio correta')
  it('gera manifest.json valido')
  it('gera entry point com template')
  it('nao sobrescreve diretorio existente')
})
```

## 2. Skills (Parcial - parser testado, manager/registry nao)

### skills/manager.ts

**O que faz**: Carrega, registra e gerencia skills do sistema e do usuario
**Testes propostos**:

```typescript
describe('SkillManager', () => {
  it('carrega skills de diretorio')
  it('registra skill com nome unico')
  it('retorna skill por nome')
  it('lista todas as skills')
  it('recarrega skills apos mudanca em disco')
  it('prioriza skill do usuario sobre builtin')
  it('lida com skill com sintaxe invalida')
})
```

### skills/registry.ts

**O que faz**: Registry de skills com lookup por nome e trigger
**Testes propostos**:

```typescript
describe('SkillRegistry', () => {
  it('registra skill')
  it('busca por nome exato')
  it('busca por trigger')
  it('lista skills por level')
  it('remove skill')
  it('rejeita duplicata')
})
```

## 3. SubAgent (agent.ts testado, manager/builtins nao)

### subagent/manager.ts

**O que faz**: Gerencia execucao paralela de sub-agents, controle de concorrencia
**Testes propostos**:

```typescript
describe('SubAgentManager', () => {
  it('cria e registra sub-agent')
  it('limita concorrencia de agents')
  it('cancela agent por ID')
  it('cancela todos os agents')
  it('lista agents em execucao')
  it('limpa agents finalizados')
  it('emite eventos de lifecycle')
  it('lida com falha de agent')
})
```

### subagent/builtins.ts

**O que faz**: Define agents built-in (search, code-review, etc)
**Testes propostos**:

```typescript
describe('BuiltinAgents', () => {
  it('registra todos os agents built-in')
  it('cada agent tem config valido')
  it('search agent tem tools corretas')
  it('cada agent tem skill associada')
  it('agents tem maxTurns definido')
})
```

## 4. Orchestrator Gaps

### orchestrator/tool-dispatcher.ts

**O que faz**: Executa tool calls, resolve tool pelo nome, valida argumentos
**Testes propostos**:

```typescript
describe('ToolDispatcher', () => {
  it('executa tool registrada com argumentos corretos')
  it('rejeita tool nao registrada')
  it('valida argumentos contra schema da tool')
  it('lida com timeout de execucao')
  it('retorna resultado no formato esperado')
  it('lida com tool que lanca excecao')
  it('emite evento de tool execution')
})
```

### orchestrator/session.ts

**O que faz**: Gerencia sessao de chat (historico, contexto, estado)
**Testes propostos**:

```typescript
describe('SessionManager', () => {
  it('cria nova sessao')
  it('carrega sessao existente')
  it('adiciona mensagem ao historico')
  it('compacta historico quando excede limite')
  it('persiste sessao em disco')
  it('restaura estado apos crash')
})
```

## Estimativa Total

- **Testes necessarios**: ~70-80 casos
- **Esforco**: 2-3 semanas (1 dev)
- **Prioridade**: P0 (plugins, tool-dispatcher), P1 (skills manager, subagent manager)
