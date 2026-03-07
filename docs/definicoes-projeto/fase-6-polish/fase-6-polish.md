# Fase 6: Polish

**Semanas**: 21-23
**Objetivo**: Testes, telemetria, documentacao, performance, seguranca e i18n.
**Pre-requisitos**: Fases 3, 4 e 5 concluidas (todas interfaces funcionais).
**Entregavel**: Produto pronto para beta publico.

---

## 1. Visao Geral

Esta fase nao adiciona features novas — foca em qualidade, observabilidade e preparacao para lancamento.

---

## 2. Tasks Detalhadas

### 2.1 Testes Unitarios (Complexidade: Alta)

**Estimativa**: 5-6 dias
**Meta**: 80%+ cobertura no `@athion/core`

**Framework**: Vitest

**Estrategia de testes por modulo**:

| Modulo | Prioridade | O que testar |
|--------|-----------|-------------|
| `orchestrator/` | Critica | Chat loop, tool dispatch, compaction trigger, session management |
| `subagent/` | Critica | Spawn, lifecycle, maxTurns limit, abort, event emission |
| `tool/` | Alta | Cada tool built-in, Zod validation, permission check |
| `provider/` | Alta | Streaming, abort, error handling, token counting |
| `token/` | Alta | Budget calculation, compaction pipeline, loop detection |
| `permission/` | Media | Glob matching, scope handling, CRUD |
| `config/` | Media | Merge hierarchy, Zod validation, hot reload |
| `bus/` | Media | Pub/sub, Zod validation, unsubscribe |
| `storage/` | Media | CRUD operations, cascade delete, migrations |
| `skill/` | Baixa | Parser, discovery, validation |

**vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.d.ts'],
    },
  },
})
```

**Mocks necessarios**:
- LLM Provider → Mock que retorna respostas pre-definidas
- Filesystem → In-memory fs para testes de tools
- SQLite → In-memory database para testes de storage

---

### 2.2 Testes E2E (Complexidade: Alta)

**Estimativa**: 4-5 dias
**Framework**: Playwright + WebdriverIO (para Tauri)

**Cenarios E2E**:

**CLI**:
```typescript
// tests/e2e/cli/chat.test.ts
test('chat interativo responde e renderiza markdown', async () => {
  const proc = spawn('athion', ['chat', '-m', 'Say hello'])
  const output = await readOutput(proc)
  expect(output).toContain('hello')
})

test('session resume funciona', async () => {
  // Criar sessao, sair, retomar
})

test('tool call read_file funciona no chat', async () => {
  // Pedir para ler um arquivo, verificar output
})
```

**Desktop (Tauri)**:
```typescript
// tests/e2e/desktop/chat.test.ts
test('app abre e mostra chat', async ({ page }) => {
  await page.waitForSelector('[data-testid="chat-input"]')
  await page.fill('[data-testid="chat-input"]', 'Hello')
  await page.click('[data-testid="send-button"]')
  await page.waitForSelector('[data-testid="assistant-message"]')
})

test('system tray aparece', async () => {
  // Verificar tray icon
})

test('global hotkey abre quick chat', async () => {
  // Simular hotkey, verificar popup
})
```

---

### 2.3 Telemetria - OpenTelemetry (Complexidade: Media)

**Origem**: Qwen Code (telemetry/)
**Estimativa**: 3-4 dias

**Dependencias**:
```bash
bun add @opentelemetry/sdk-node @opentelemetry/api @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/exporter-trace-otlp-http
```

**Spans a instrumentar**:

| Operacao | Span Name | Atributos |
|----------|-----------|-----------|
| Chat completo | `athion.chat` | sessionId, provider, model, totalTokens |
| LLM call | `athion.llm.call` | provider, model, promptTokens, completionTokens, latencyMs |
| Tool execution | `athion.tool.execute` | toolName, success, durationMs |
| SubAgent spawn | `athion.subagent.spawn` | agentName, skill, turns |
| Compaction | `athion.compaction` | stage, tokensBefore, tokensAfter |
| Indexing | `athion.indexer.run` | filesProcessed, duration |
| Autocomplete | `athion.autocomplete` | accepted, latencyMs, model |

**Configuracao**:
```typescript
// packages/core/src/telemetry/telemetry.ts
export interface TelemetryConfig {
  enabled: boolean     // Default: false (opt-in)
  endpoint?: string    // OTLP endpoint
  serviceName: string  // "athion-assistent"
  anonymize: boolean   // Default: true
}
```

**Importante**: Telemetria e **opt-in**. Nunca enviar dados sem consentimento explicito.

---

### 2.4 Documentacao (Complexidade: Media)

**Estimativa**: 3-4 dias

**Documentos a criar**:

| Documento | Conteudo |
|-----------|---------|
| `README.md` | Overview, quick start, screenshots |
| `docs/getting-started.md` | Instalacao passo a passo |
| `docs/configuration.md` | Todas opcoes de config |
| `docs/tools.md` | Referencia das 13 tools |
| `docs/skills.md` | Como criar skills customizadas |
| `docs/agents.md` | Como criar agentes customizados |
| `docs/mcp.md` | Como conectar MCP servers |
| `docs/api.md` | API programatica do core |
| `docs/architecture.md` | Visao geral da arquitetura |
| `CHANGELOG.md` | Historico de mudancas |

---

### 2.5 Performance (Complexidade: Media)

**Estimativa**: 2-3 dias

**Benchmarks a executar**:

| Metrica | Target | Como medir |
|---------|--------|-----------|
| CLI startup | < 200ms | `time athion --version` |
| Desktop startup | < 500ms | Medir ate first paint |
| Autocomplete latency | < 500ms P95 | Instrumentar com OpenTelemetry |
| Tool execution (local) | < 200ms | Benchmark read_file, glob, etc. |
| Memory (CLI idle) | < 50MB | `ps aux | grep athion` |
| Memory (Desktop idle) | < 80MB | Activity Monitor / htop |
| Bundle size (Desktop) | < 15MB | `ls -la` no .dmg/.AppImage |

**Otimizacoes potenciais**:
- Lazy loading de providers (so carregar quando usado)
- Tree-shaking de tools nao usadas
- Virtual scrolling para sessoes longas
- Debounce agressivo no autocomplete
- Cache LRU para embeddings

---

### 2.6 Security Audit (Complexidade: Media)

**Estimativa**: 2-3 dias

**Checklist OWASP para CLI/Desktop**:

| Verificacao | Status |
|-------------|--------|
| Shell injection prevention (bash tool) | |
| Path traversal prevention (read_file, write_file) | |
| API keys nao logadas/expostas | |
| SQLite injection prevention (Drizzle ORM protege) | |
| Tauri CSP configurado | |
| Tauri permissions minimas | |
| Tree-sitter AST validation para comandos destrutivos | |
| Clipboard nao monitora sem opt-in | |
| Telemetria opt-in com dados anonimizados | |
| Deep links validados (nao executar paths arbitrarios) | |

**Ferramentas**:
- `cargo audit` — Vulnerabilidades em deps Rust
- `bun audit` — Vulnerabilidades em deps npm
- Revisao manual de tools que executam comandos (bash, write_file)

---

### 2.7 i18n - Internacionalizacao (Complexidade: Media)

**Estimativa**: 3-4 dias

**5 idiomas iniciais**:
1. Portugues (pt-BR) — padrao
2. Ingles (en-US)
3. Espanhol (es)
4. Frances (fr)
5. Chines simplificado (zh-CN)

**Onde traduzir**:
- CLI: mensagens de erro, prompts, help text
- Desktop: toda UI
- Skills: manter em ingles (sistema prompt)
- Tools: descriptions em ingles (para o LLM)

**Abordagem**: JSON files com chaves tipadas.
```
packages/shared/src/i18n/
├── locales/
│   ├── pt-BR.json
│   ├── en-US.json
│   ├── es.json
│   ├── fr.json
│   └── zh-CN.json
├── i18n.ts         # Loader + tipo helper
└── index.ts
```

---

## 3. CI/CD Atualizacoes

Adicionar ao pipeline:

```yaml
# Ao ci.yml existente
  coverage:
    name: Test Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test -- --coverage
      - name: Check coverage threshold
        run: |
          # Falha se cobertura < 80%

  security:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun audit
      - run: cd packages/desktop/src-tauri && cargo audit

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test:e2e
```

---

## 4. Checklist de Conclusao (Beta Ready)

### Qualidade
- [ ] 80%+ cobertura de testes no core
- [ ] Testes E2E passando (CLI + Desktop)
- [ ] Zero God Classes (max 300 linhas)
- [ ] SOLID score > 8/10 em review

### Observabilidade
- [ ] OpenTelemetry instrumentado em todas operacoes LLM
- [ ] Pino structured logging configurado
- [ ] Metricas de performance dentro dos targets

### Seguranca
- [ ] Security audit concluido
- [ ] Zero vulnerabilidades criticas
- [ ] Shell injection prevention validada
- [ ] Tauri permissions minimas

### Documentacao
- [ ] README completo com screenshots
- [ ] Getting started guide
- [ ] API reference
- [ ] Skills/agents guides

### Performance
- [ ] CLI startup < 200ms
- [ ] Desktop startup < 500ms
- [ ] Autocomplete < 500ms P95
- [ ] Memory within targets

### i18n
- [ ] 5 idiomas funcionais
- [ ] Deteccao automatica de locale

### Distribution
- [ ] NPM package publicavel (`npx athion`)
- [ ] VS Code Marketplace publicavel
- [ ] Desktop builds para 3 OS
- [ ] Auto-update funcional
- [ ] CHANGELOG.md atualizado

---

## 5. Lancamento Beta

Apos todos checks passando:

1. **Tag** `v0.1.0-beta.1`
2. **Publish** CLI no npm
3. **Publish** extensao no VS Code Marketplace
4. **Release** Desktop builds no GitHub Releases
5. **Comunicar** — README, social, comunidade
