# Core: Server/Proxy - Testes Necessarios

## Status Atual

- **Cobertura**: CRITICA (~10%)
- **Testado**: flow-ws.ts (6 testes), tool-call-extractor.ts (10 testes)
- **Nao testado**: 13+ arquivos criticos

## Arquivos Sem Testes

### proxy.ts (Proxy Principal)

**O que faz**: Proxy HTTP entre frontend e LLM local, roteamento de requests, streaming de responses
**Testes propostos**:

```typescript
describe('LLMProxy', () => {
  it('roteia request para provider correto')
  it('retorna 404 para rota desconhecida')
  it('faz streaming de response chunks')
  it('adiciona headers CORS')
  it('lida com timeout de provider')
  it('aplica middleware chain na ordem correta')
  it('loga request/response quando habilitado')
})
```

### streaming.ts

**O que faz**: Parsing de Server-Sent Events (SSE) do LLM, transformacao de chunks
**Testes propostos**:

```typescript
describe('SSE Streaming', () => {
  it('parseia SSE data: chunks corretamente')
  it('lida com chunks parciais (split mid-JSON)')
  it('detecta [DONE] marker')
  it('emite erro para JSON invalido')
  it('acumula buffer entre chunks')
})
```

### tokenizer.ts

**O que faz**: Contagem de tokens para budget management
**Testes propostos**:

```typescript
describe('Tokenizer', () => {
  it('conta tokens de string simples')
  it('conta tokens de texto com caracteres especiais')
  it('retorna 0 para string vazia')
  it('lida com unicode/emoji')
})
```

### compression.ts / compression-prompt.ts

**O que faz**: Compressao de contexto quando excede token budget
**Testes propostos**:

```typescript
describe('ContextCompression', () => {
  it('comprime quando excede maxTokens')
  it('mantem mensagens recentes intactas')
  it('remove mensagens antigas primeiro')
  it('preserva system prompt')
  it('gera prompt de compressao correto')
})
```

### Middleware sem testes

#### safety-guard.ts

```typescript
describe('SafetyGuard Middleware', () => {
  it('bloqueia conteudo malicioso no input')
  it('permite conteudo normal')
  it('loga tentativas bloqueadas')
})
```

#### think-stripper.ts

```typescript
describe('ThinkStripper Middleware', () => {
  it('remove <think> tags da response')
  it('preserva conteudo fora de <think>')
  it('lida com tags aninhadas')
  it('nao altera response sem tags')
})
```

#### tool-sanitizer.ts

```typescript
describe('ToolSanitizer Middleware', () => {
  it('valida formato de tool calls')
  it('rejeita tool calls malformados')
  it('sanitiza argumentos de tool')
})
```

### Server Managers (llama-cpp, lm-studio, mlx-omni, vllm)

**O que fazem**: Gerenciam lifecycle de servidores LLM locais (start, stop, health check)
**Testes propostos por manager**:

```typescript
describe('LmStudioManager', () => {
  it('detecta se lm-studio esta instalado')
  it('inicia servidor com configuracao correta')
  it('para servidor gracefully')
  it('retorna status de health check')
  it('lida com falha de start')
  it('detecta porta disponivel')
})
```

## Estimativa

- **Testes necessarios**: ~60-80 casos
- **Esforco**: 2-3 semanas (1 dev)
- **Prioridade**: P0
