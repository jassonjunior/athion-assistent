# Solution Architecture — Storybook Unificado para Athion Assistent

| Campo              | Valor         |
| ------------------ | ------------- |
| Tech Lead          | @jassonjunior |
| Status             | Draft         |
| Criado             | 2026-03-14    |
| Ultima Atualizacao | 2026-03-14    |

---

## 1. Contexto

O Athion Assistent e um monorepo com **4 frontends** distintos, cada um com tecnologia e runtime diferentes:

| Package                  | Tecnologia UI             | Runtime             | Componentes | Stories |
| ------------------------ | ------------------------- | ------------------- | ----------- | ------- |
| **desktop**              | React 19 + Tailwind CSS 4 | Tauri (webview)     | 7           | 6       |
| **observability-athion** | React 19 + CSS custom     | Tauri (webview)     | 8           | 4       |
| **vscode**               | React 19 + CSS custom     | VS Code webview     | 7           | 0       |
| **cli**                  | React 19 + Ink 6          | Terminal (Node/Bun) | 11          | 0       |

Atualmente o Storybook esta **centralizado** no `observability-athion`, cobrindo stories do observability e do desktop. Os pacotes **vscode** e **cli** nao possuem stories e nao estao integrados.

### O que ja esta funcionando

- Storybook 10.2 configurado em `packages/observability-athion/.storybook/`
- 10 stories existentes (6 desktop + 4 observability)
- Addons: a11y, docs, vitest, chromatic, onboarding
- Preview carrega temas de ambos os pacotes (theme.css + app.css)
- Backgrounds Dark/Light configurados

### Problemas identificados

1. **Cobertura parcial**: Apenas 10/33 componentes tem stories (30%)
2. **CLI sem suporte**: Componentes Ink (terminal) nao sao compativeis com Storybook web
3. **VSCode sem stories**: 7 componentes React web sem nenhuma story
4. **Temas desacoplados**: 3 sistemas de design independentes (Tailwind, CSS vars Catppuccin, CSS vars VSCode)
5. **Storybook acoplado**: Configuracao vive dentro de um pacote especifico ao inves de ser independente
6. **Sem design tokens compartilhados**: Cada frontend define suas proprias cores/espacamentos

---

## 2. Definicao do Problema

### Problemas que estamos resolvendo

- **Falta de controle visual**: Sem preview unificado, nao ha como validar consistencia de design entre frontends
- **Componentes sem documentacao**: 70% dos componentes nao tem stories, dificultando onboarding e review de design
- **Temas fragmentados**: Cada frontend tem seu proprio sistema de cores, sem garantia de consistencia

### Por que agora?

- O monorepo tem 4 frontends ativos com componentes em producao
- A falta de design system unificado gera inconsistencias visuais
- Novos componentes sao criados sem referencia de design

### Impacto de NAO resolver

- **Design**: Drift visual entre frontends, experiencia fragmentada
- **Produtividade**: Developers recriam componentes sem saber que ja existem
- **Qualidade**: Sem preview, bugs visuais so sao descobertos em producao

---

## 3. Escopo

### Em Escopo (V1)

- Mover Storybook para pacote proprio dedicado (`packages/storybook`)
- Integrar stories do **vscode** (componentes React web)
- Criar adapter para preview de componentes **CLI/Ink** no browser
- Stories para todos os 33 componentes existentes
- Design tokens compartilhados (cores, tipografia, espacamentos)
- Documentacao de design guidelines (MDX)
- Preview de temas (Dark/Light/Minimal) com switcher
- Addon de viewport customizado (Desktop, VSCode panel, Terminal 80x24)

### Fora do Escopo (V1)

- Chromatic CI/CD com visual regression testing
- Figma sync / design handoff automatizado
- Component library publicada como pacote npm
- Testes de performance de componentes
- Animacoes e micro-interacoes

### Futuro (V2+)

- Visual regression testing com Chromatic
- Figma plugin para sync de design tokens
- Storybook composition (federated)
- Design system publicado como pacote independente

---

## 4. Solucao Tecnica

### 4.1 Arquitetura Proposta

```
packages/
├── storybook/                    # NOVO — Storybook dedicado
│   ├── .storybook/
│   │   ├── main.ts               # Config central
│   │   ├── preview.ts            # Temas + decorators globais
│   │   ├── manager.ts            # UI customizacoes
│   │   └── viewports.ts          # Viewports customizados
│   ├── src/
│   │   ├── tokens/               # Design tokens compartilhados
│   │   │   ├── colors.ts
│   │   │   ├── typography.ts
│   │   │   └── spacing.ts
│   │   ├── decorators/           # Decorators reutilizaveis
│   │   │   ├── ThemeDecorator.tsx
│   │   │   ├── InkDecorator.tsx  # Adapter CLI→Web
│   │   │   └── VSCodeDecorator.tsx
│   │   └── docs/                 # Documentacao MDX
│   │       ├── Introduction.mdx
│   │       ├── DesignTokens.mdx
│   │       ├── ThemeGuide.mdx
│   │       └── ComponentGuide.mdx
│   ├── package.json
│   └── tsconfig.json
│
├── desktop/src/components/*.stories.tsx      # Existentes (6)
├── observability-athion/src/**/*.stories.tsx  # Existentes (4)
├── vscode/src/webview/**/*.stories.tsx        # NOVAS
└── cli/src/ui/*.stories.tsx                   # NOVAS (com adapter)
```

### 4.2 Estrategia por Frontend

#### Desktop (React + Tailwind) — JA IMPLEMENTADO

- **Status**: 6/7 componentes com stories
- **Acao**: Criar story faltante (App.tsx) + melhorar stories existentes com mais variantes
- **Esforco**: Baixo

#### Observability (React + CSS custom) — JA IMPLEMENTADO

- **Status**: 4/8 componentes com stories
- **Acao**: Criar stories para FlowPanel, FlowPanelLive, LogPanel, LogPanelLive
- **Desafio**: FlowPanel usa ReactFlow — precisa mock de nodes/edges
- **Esforco**: Medio

#### VSCode Extension (React + CSS) — NAO IMPLEMENTADO

- **Status**: 0/7 componentes com stories
- **Acao**: Criar todas as stories + decorator que simula ambiente VSCode
- **Desafio**: Componentes usam `postMessage` para comunicar com extension — precisa mock do messenger
- **Componentes**: MessageList, InputArea, CodeBlock, DiffView, ToolCallCard, AutocompleteDropdown, MentionDropdown
- **Esforco**: Medio

#### CLI (React + Ink) — NAO IMPLEMENTADO

- **Status**: 0/11 componentes com stories
- **Acao**: Criar adapter Ink→Web + stories para todos os componentes
- **Desafio principal**: Ink renderiza para terminal (stdout), nao para DOM
- **Solucao**: `InkDecorator` que usa `ink-testing-library` + CSS que simula terminal
- **Componentes**: ChatApp, MessageList, UserInput, StatusBar, SkillsMenu, WelcomeScreen, Markdown, StreamingMessage, ToolCallDisplay, SubAgentDisplay, PermissionPrompt
- **Esforco**: Alto

### 4.3 Adapter CLI/Ink para Storybook

O maior desafio tecnico e renderizar componentes Ink (terminal) no browser. A solucao proposta:

**Opcao A (Recomendada): Snapshot Renderer**

```
Ink Component → ink-testing-library render() → ANSI string → ansi-to-html → <pre> no Storybook
```

- Usa `ink-testing-library` para renderizar componente para string ANSI
- Converte ANSI para HTML com `ansi-to-html`
- Exibe dentro de `<pre>` estilizado como terminal (fundo escuro, fonte mono)
- Suporta interacao via re-render com props diferentes

**Opcao B: Dual Component**

- Cria versao web de cada componente CLI mantendo a mesma interface
- Mais trabalho mas permite interacao real no Storybook
- Risco de divergencia entre versao CLI e web

**Opcao C: Ink Web Renderer (experimental)**

- Ink tem renderer web experimental
- Instavel, sem suporte oficial
- Descartado para V1

**Decisao**: Opcao A — menor esforco, sem duplicacao, preview fiel ao terminal real.

### 4.4 Design Tokens Compartilhados

Unificar os 3 sistemas de cores em tokens semanticos:

```typescript
// packages/storybook/src/tokens/colors.ts

export const semanticTokens = {
  background: {
    base: {
      desktop: 'surface-950',
      observability: 'bg-base',
      vscode: '--vscode-editor-background',
    },
    surface: {
      desktop: 'surface-900',
      observability: 'bg-surface',
      vscode: '--vscode-sideBar-background',
    },
    overlay: {
      desktop: 'surface-800',
      observability: 'bg-overlay',
      vscode: '--vscode-editorWidget-background',
    },
  },
  text: {
    primary: {
      desktop: 'neutral-200',
      observability: 'text',
      vscode: '--vscode-editor-foreground',
    },
    muted: {
      desktop: 'neutral-500',
      observability: 'text-dim',
      vscode: '--vscode-descriptionForeground',
    },
  },
  accent: {
    primary: { desktop: 'accent-500', observability: 'blue', vscode: '--vscode-focusBorder' },
    success: {
      desktop: 'success-500',
      observability: 'green',
      vscode: '--vscode-testing-iconPassed',
    },
    error: { desktop: 'error-500', observability: 'red', vscode: '--vscode-testing-iconFailed' },
    warning: {
      desktop: 'warning-500',
      observability: 'yellow',
      vscode: '--vscode-editorWarning-foreground',
    },
  },
}
```

### 4.5 Viewports Customizados

```typescript
// packages/storybook/.storybook/viewports.ts

export const athionViewports = {
  desktop: {
    name: 'Desktop App (Tauri)',
    styles: { width: '1280px', height: '800px' },
  },
  vscodePanel: {
    name: 'VS Code Panel',
    styles: { width: '400px', height: '600px' },
  },
  vscodeSidebar: {
    name: 'VS Code Sidebar',
    styles: { width: '300px', height: '800px' },
  },
  terminal80x24: {
    name: 'Terminal 80x24',
    styles: { width: '640px', height: '384px' },
  },
  terminal120x40: {
    name: 'Terminal 120x40',
    styles: { width: '960px', height: '640px' },
  },
  observability: {
    name: 'Observability Dashboard',
    styles: { width: '1440px', height: '900px' },
  },
}
```

### 4.6 Configuracao Storybook Central

```typescript
// packages/storybook/.storybook/main.ts

const config: StorybookConfig = {
  stories: [
    // Documentacao
    '../src/docs/**/*.mdx',
    // Desktop stories
    '../../desktop/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // Observability stories
    '../../observability-athion/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // VSCode stories (NOVO)
    '../../vscode/src/webview/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // CLI stories (NOVO — com adapter)
    '../../cli/src/ui/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-vitest',
    '@storybook/addon-viewport',
    '@storybook/addon-themes',
  ],
  framework: '@storybook/react-vite',
}
```

---

## 5. Riscos

| Risco                                                 | Impacto | Probabilidade | Mitigacao                                            |
| ----------------------------------------------------- | ------- | ------------- | ---------------------------------------------------- |
| Ink components nao renderizam corretamente no browser | Alto    | Media         | PoC com InkDecorator antes de criar todas as stories |
| Conflito de CSS entre temas dos 3 frontends           | Medio   | Alta          | CSS Modules ou scoped styles por decorator           |
| ReactFlow (FlowPanel) pesado no Storybook             | Baixo   | Media         | Mock de nodes/edges com dados estaticos              |
| Performance com 33+ stories                           | Baixo   | Baixa         | Lazy loading de stories por pacote                   |
| Hooks que dependem de runtime (Tauri, VSCode API)     | Alto    | Alta          | Mock providers nos decorators                        |

---

## 6. Plano de Implementacao

### Fase 1: Infraestrutura (2-3 dias)

| Task | Descricao                                                   | Esforco |
| ---- | ----------------------------------------------------------- | ------- |
| 1.1  | Criar `packages/storybook` com config central               | 4h      |
| 1.2  | Migrar `.storybook/` do observability para novo pacote      | 2h      |
| 1.3  | Configurar story paths para todos os 4 frontends            | 2h      |
| 1.4  | Criar ThemeDecorator com switcher Dark/Light                | 3h      |
| 1.5  | Criar viewports customizados                                | 1h      |
| 1.6  | Validar que stories existentes (10) funcionam no novo setup | 2h      |

### Fase 2: Design Tokens + Documentacao (2 dias)

| Task | Descricao                                               | Esforco |
| ---- | ------------------------------------------------------- | ------- |
| 2.1  | Mapear tokens semanticos entre os 3 sistemas de cores   | 3h      |
| 2.2  | Criar `tokens/colors.ts`, `typography.ts`, `spacing.ts` | 3h      |
| 2.3  | Criar MDX: Introduction, DesignTokens, ThemeGuide       | 4h      |
| 2.4  | Criar ComponentGuide.mdx com padroes e convencoes       | 2h      |

### Fase 3: VSCode Stories (2-3 dias)

| Task | Descricao                                          | Esforco |
| ---- | -------------------------------------------------- | ------- |
| 3.1  | Criar VSCodeDecorator (mock postMessage, CSS vars) | 4h      |
| 3.2  | Stories: MessageList, InputArea, CodeBlock         | 3h      |
| 3.3  | Stories: DiffView, ToolCallCard                    | 2h      |
| 3.4  | Stories: AutocompleteDropdown, MentionDropdown     | 3h      |

### Fase 4: CLI/Ink Stories (3-4 dias)

| Task | Descricao                                                | Esforco |
| ---- | -------------------------------------------------------- | ------- |
| 4.1  | PoC: InkDecorator com ink-testing-library + ansi-to-html | 6h      |
| 4.2  | Stories: StatusBar, WelcomeScreen, Markdown              | 3h      |
| 4.3  | Stories: MessageList, StreamingMessage, ToolCallDisplay  | 4h      |
| 4.4  | Stories: UserInput, SkillsMenu, PermissionPrompt         | 4h      |
| 4.5  | Stories: SubAgentDisplay, ChatApp                        | 3h      |

### Fase 5: Completar Cobertura (1-2 dias)

| Task | Descricao                                                       | Esforco |
| ---- | --------------------------------------------------------------- | ------- |
| 5.1  | Desktop: Story faltante (App.tsx) + variantes extras            | 2h      |
| 5.2  | Observability: FlowPanel, FlowPanelLive, LogPanel, LogPanelLive | 4h      |
| 5.3  | Remover `.storybook/` antigo do observability                   | 1h      |
| 5.4  | Atualizar scripts no root package.json                          | 1h      |

**Total estimado: 10-14 dias**

---

## 7. Inventario de Stories por Frontend

### Desktop (7 componentes)

| Componente   | Story Existe | Variantes                                      | Prioridade |
| ------------ | ------------ | ---------------------------------------------- | ---------- |
| CodeBlock    | Sim          | TypeScript, Python, JSON                       | -          |
| InputArea    | Sim          | Default, Streaming, Disabled, WithInitialValue | -          |
| MessageList  | Sim          | WithMessages, Empty, Streaming                 | -          |
| Sidebar      | Sim          | Expanded, Collapsed, NoSelection               | -          |
| StatusBar    | Sim          | Ready, Starting, Error, Stopped                | -          |
| ToolCallCard | Sim          | Running, Success, ErrorStatus                  | -          |
| App          | **Nao**      | Full layout                                    | Media      |

### Observability (8 componentes)

| Componente    | Story Existe | Variantes                                 | Prioridade |
| ------------- | ------------ | ----------------------------------------- | ---------- |
| TokenBar      | Sim          | Low, Medium, High                         | -          |
| TestSelector  | Sim          | Connected, Running, Disconnected, NoTests | -          |
| ErrorBoundary | Sim          | Normal, CustomFallback                    | -          |
| LogPanelBase  | Sim          | WithEntries, Empty, WithErrors, LiveMode  | -          |
| FlowPanel     | **Nao**      | Default, WithNodes, Empty                 | Alta       |
| FlowPanelLive | **Nao**      | Connected, Disconnected                   | Alta       |
| LogPanel      | **Nao**      | Default, Filtered                         | Media      |
| LogPanelLive  | **Nao**      | Streaming, Paused                         | Media      |

### VSCode (7 componentes)

| Componente           | Story Existe | Variantes                           | Prioridade |
| -------------------- | ------------ | ----------------------------------- | ---------- |
| MessageList          | **Nao**      | WithMessages, Empty, Streaming      | Alta       |
| InputArea            | **Nao**      | Default, WithAutocomplete, Disabled | Alta       |
| CodeBlock            | **Nao**      | TypeScript, Python, Diff            | Alta       |
| DiffView             | **Nao**      | Added, Removed, Mixed               | Media      |
| ToolCallCard         | **Nao**      | Running, Success, Error             | Media      |
| AutocompleteDropdown | **Nao**      | Commands, Skills, Files             | Alta       |
| MentionDropdown      | **Nao**      | Files, Symbols                      | Media      |

### CLI/Ink (11 componentes)

| Componente       | Story Existe | Variantes                 | Prioridade |
| ---------------- | ------------ | ------------------------- | ---------- |
| ChatApp          | **Nao**      | Full layout               | Baixa      |
| MessageList      | **Nao**      | WithMessages, Empty       | Alta       |
| UserInput        | **Nao**      | Default, WithAutocomplete | Alta       |
| StatusBar        | **Nao**      | Connected, Tokens, Skill  | Alta       |
| SkillsMenu       | **Nao**      | Browse, Active            | Media      |
| WelcomeScreen    | **Nao**      | Default                   | Media      |
| Markdown         | **Nao**      | Headers, Lists, Code      | Media      |
| StreamingMessage | **Nao**      | Typing, Complete          | Alta       |
| ToolCallDisplay  | **Nao**      | Running, Success, Error   | Alta       |
| SubAgentDisplay  | **Nao**      | Active, Complete          | Media      |
| PermissionPrompt | **Nao**      | Pending, Approved, Denied | Alta       |

---

## 8. Metricas de Sucesso

| Metrica                     | Baseline                  | Target                           |
| --------------------------- | ------------------------- | -------------------------------- |
| Componentes com stories     | 10/33 (30%)               | 33/33 (100%)                     |
| Frontends integrados        | 2/4                       | 4/4                              |
| Design tokens documentados  | 0                         | Cores + Tipografia + Espacamento |
| Paginas MDX de documentacao | 0                         | 4+                               |
| Viewports customizados      | 2 (Dark/Light background) | 6 (por frontend)                 |

---

## 9. ADR — Decisoes Arquiteturais

### ADR-001: Storybook em pacote dedicado

**Contexto**: Storybook esta dentro de `observability-athion`, criando acoplamento.

**Decisao**: Mover para `packages/storybook` independente.

**Razao**: Permite que qualquer frontend adicione stories sem depender do observability. Simplifica CI/CD e permite build independente.

### ADR-002: Snapshot renderer para componentes Ink

**Contexto**: Componentes CLI usam Ink (terminal), incompativel com DOM.

**Decisao**: Usar `ink-testing-library` para renderizar para ANSI string, converter com `ansi-to-html`, exibir em `<pre>` estilizado.

**Alternativas descartadas**:

- Dual components (duplicacao, risco de divergencia)
- Ink web renderer (experimental, instavel)

**Consequencias**: Preview e estatico (sem interacao real), mas fiel ao output terminal.

### ADR-003: Design tokens semanticos como ponte

**Contexto**: 3 sistemas de estilo diferentes (Tailwind, CSS custom, CSS vars VSCode).

**Decisao**: Criar camada de tokens semanticos que mapeia para cada sistema sem forcar migracao.

**Razao**: Permite documentar e visualizar a equivalencia entre temas sem reescrever CSS existente.

---

## 10. Dependencias

| Dependencia                   | Tipo      | Status                              |
| ----------------------------- | --------- | ----------------------------------- |
| `@storybook/react-vite` ^10.2 | Existente | Ja instalado                        |
| `@storybook/addon-a11y`       | Existente | Ja instalado                        |
| `@storybook/addon-docs`       | Existente | Ja instalado                        |
| `@storybook/addon-vitest`     | Existente | Ja instalado                        |
| `@storybook/addon-viewport`   | Nova      | Precisa instalar                    |
| `@storybook/addon-themes`     | Nova      | Precisa instalar                    |
| `ink-testing-library`         | Nova      | Precisa instalar (para CLI adapter) |
| `ansi-to-html`                | Nova      | Precisa instalar (para CLI adapter) |
| `@chromatic-com/storybook`    | Existente | Ja instalado                        |

---

## 11. Questoes em Aberto

| #   | Questao                                                         | Owner         | Status |
| --- | --------------------------------------------------------------- | ------------- | ------ |
| 1   | Manter Chromatic para visual regression em V1 ou adiar para V2? | @jassonjunior | Aberto |
| 2   | CLI adapter: aceitar preview estatico ou investir em interacao? | @jassonjunior | Aberto |
| 3   | Publicar storybook estatico (GitHub Pages, Vercel)?             | @jassonjunior | Aberto |
| 4   | ReactFlow mock: dados estaticos ou snapshot de grafo real?      | @jassonjunior | Aberto |
