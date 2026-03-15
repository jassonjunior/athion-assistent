# Core: Indexing - Gaps de Testes

## Status Atual

- **Cobertura**: BOA nos adapters, CRITICA em chunker/embeddings
- **Bem testado**: sqlite-text-search (14), sqlite-vector-store (15), context-builder (12), context-formatters (14), dependency-graph (27), e2e-pipeline (7)
- **Nao testado**: chunker.ts, embeddings.ts, db-store.ts, file-walker.ts, tree-sitter-chunker.ts, provider-enricher.ts

## Arquivos Criticos Sem Testes

### chunker.ts

**O que faz**: Divide arquivos em chunks semanticos para indexacao
**Testes propostos**:

```typescript
describe('Chunker', () => {
  it('divide arquivo em chunks de tamanho adequado')
  it('respeita limites de funcao/classe')
  it('mantem overlap entre chunks')
  it('lida com arquivo vazio')
  it('lida com arquivo muito grande')
  it('preserva metadata de posicao (linha inicio/fim)')
  it('trata diferentes linguagens (TS, Python, Go)')
})
```

### embeddings.ts

**O que faz**: Gera embeddings vetoriais, calcula cosine similarity, serializa/deserializa
**Testes propostos**:

```typescript
describe('Embeddings', () => {
  it('calcula cosine similarity entre vetores iguais = 1.0')
  it('calcula cosine similarity entre vetores ortogonais = 0.0')
  it('serializa embedding para buffer')
  it('deserializa buffer para embedding')
  it('roundtrip serialize/deserialize preserva valores')
  it('lida com vetor zero')
  it('normaliza embeddings corretamente')
})
```

### tree-sitter-chunker.ts

**O que faz**: Chunking inteligente usando parse tree do tree-sitter
**Testes propostos**:

```typescript
describe('TreeSitterChunker', () => {
  it('extrai funcoes como chunks individuais')
  it('extrai classes como chunks')
  it('preserva imports no chunk')
  it('agrupa statements pequenos')
  it('lida com linguagem nao suportada (fallback)')
  it('respeita maxChunkSize')
})
```

### provider-enricher.ts

**O que faz**: Enriquece index com L0 (repo meta), L2 (file summaries), L4 (patterns) via LLM
**Testes propostos**:

```typescript
describe('ProviderEnricher', () => {
  it('gera L0 (repo metadata) com formato JSON valido')
  it('gera L2 (file summary) com descricao coerente')
  it('gera L4 (patterns) com convencoes detectadas')
  it('parseia JSON response com markdown fences')
  it('lida com LLM retornando JSON invalido')
  it('lida com timeout do provider')
  it('respeita format esperado por LlmEnricherPort')
})
```

### file-walker.ts

**O que faz**: Percorre filesystem respeitando .gitignore e filtros
**Testes propostos**:

```typescript
describe('FileWalker', () => {
  it('lista arquivos recursivamente')
  it('respeita .gitignore')
  it('filtra por extensao')
  it('ignora node_modules')
  it('ignora arquivos binarios')
  it('retorna paths relativos ao workspace')
})
```

### db-store.ts

**O que faz**: Persistencia SQLite do index (chunks, vectors, metadata)
**Testes propostos**:

```typescript
describe('DbStore', () => {
  it('cria tabelas no primeiro uso')
  it('salva e recupera chunks')
  it('atualiza chunk existente')
  it('remove chunks de arquivo deletado')
  it('busca por hash de arquivo')
  it('retorna estatisticas do index')
})
```

## Estimativa

- **Testes necessarios**: ~40-50 casos
- **Esforco**: 1-2 semanas (1 dev)
- **Prioridade**: P0 (chunker/embeddings), P1 (outros)
