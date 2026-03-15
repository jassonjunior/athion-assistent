# Architecture Patterns — Storybook Unificado + Design System

| Campo                 | Valor                                            |
| --------------------- | ------------------------------------------------ |
| Documento relacionado | [solution-architect.md](./solution-architect.md) |
| Criado                | 2026-03-14                                       |
| Ultima Atualizacao    | 2026-03-14                                       |

---

## 1. Analise do Solution Architect — Gaps e Melhorias

### Gaps identificados no documento original

| #   | Gap                                                                                                                                                      | Impacto | Recomendacao                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| G1  | **Duplicacao de codigo nao mapeada**: Existem ~790 LOC duplicadas entre os 3 frontends React (hooks, componentes, event handlers) que o doc nao menciona | Alto    | Adicionar Fase 0 de refatoracao antes de criar stories                  |
| G2  | **Sem pacote shared para UI**: O `@athion/shared` atual so tem i18n e protocol — nao tem hooks nem componentes compartilhados                            | Alto    | Expandir `@athion/shared` ou criar `@athion/ui-shared`                  |
| G3  | **Ink adapter pode nao funcionar no browser**: `ink-testing-library` depende de Node.js APIs (`process.stdout`). Storybook roda no browser via Vite      | Alto    | PoC obrigatoria antes da Fase 4; fallback para screenshot-based stories |
| G4  | **VSCode CSS vars nao existem fora do VS Code**: Componentes VSCode usam `--vscode-*` CSS vars que so existem no runtime do VS Code                      | Medio   | VSCodeDecorator precisa injetar CSS vars fake no preview                |
| G5  | **Tauri bridge mocks nao detalhados**: Desktop hooks chamam `invoke()` e `listen()` do Tauri que nao existem no browser                                  | Medio   | Criar TauriBridgeMockProvider como decorator                            |
| G6  | **ReactFlow precisa de provider**: FlowPanel usa `<ReactFlowProvider>` — sem ele, o Storybook crasha                                                     | Medio   | Decorator com ReactFlowProvider + mock nodes/edges                      |
| G7  | **Sem estrategia de organizacao de stories no sidebar**: Com 33+ stories de 4 frontends, a navegacao fica confusa                                        | Baixo   | Definir hierarquia: Frontend/Componente/Variante                        |
| G8  | **Sem interaction testing**: O doc menciona addon-vitest mas nao define quais stories terao play functions                                               | Baixo   | Adicionar play functions para componentes interativos                   |

### Melhorias sugeridas ao solution-architect.md

1. **Adicionar Fase 0**: Extrair codigo duplicado antes de criar stories (evita escrever stories duplicadas)
2. **Detalhar mock providers**: Para cada frontend, especificar exatamente o que precisa ser mockado
3. **Fallback para CLI**: Se Ink adapter nao funcionar no browser, usar screenshot-based stories (captura PNG do terminal)
4. **Hierarquia do sidebar**: `Desktop/MessageList`, `VSCode/MessageList`, `CLI/MessageList`
5. **Story naming convention**: `[Frontend]/[Componente]` com tags para facilitar busca

---

## 2. Padroes Arquiteturais Aplicaveis

### 2.1 Ports & Adapters (Hexagonal) para UI

O maior problema do codebase atual e que **hooks estao acoplados ao runtime** (Tauri, VSCode, Terminal). A solucao e aplicar Ports & Adapters:

```
                    ┌──────────────────────────────┐
                    │    Shared UI Logic (Ports)    │
                    │                              │
                    │  useFeedbackPhrase()         │
                    │  createChatHook(bridge)      │
                    │  createEventHandler(opts)    │
                    │  FormattedContent parser     │
                    └─────────┬────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
    │ Tauri Adapter  │ │ VSCode     │ │ Ink Adapter │
    │                │ │ Adapter    │ │             │
    │ invoke/listen  │ │ postMsg    │ │ stdin/out   │
    │ Tailwind CSS   │ │ CSS vars   │ │ ANSI colors │
    └────────────────┘ └────────────┘ └─────────────┘
```

**Port (Interface compartilhada):**

```typescript
// packages/shared/src/ui/ports.ts

/** Bridge de comunicacao entre UI e core — cada runtime implementa */
export interface UIBridge {
  sendMessage(content: string): Promise<void>
  abortGeneration(): Promise<void>
  onEvent(handler: ChatEventHandler): () => void // returns unsubscribe
  getSkills(): Promise<SkillInfo[]>
  getFiles(query: string): Promise<FileInfo[]>
}

/** Factory para criar useChat com qualquer bridge */
export function createChatHook(bridge: UIBridge) {
  return function useChat() {
    // logica compartilhada aqui
    // bridge.sendMessage() ao inves de invoke() ou postMessage()
  }
}
```

**Adapters:**

```typescript
// packages/desktop/src/bridge/tauri-bridge.ts
export class TauriBridge implements UIBridge {
  async sendMessage(content: string) {
    await invoke('send_message', { content })
  }
  onEvent(handler) {
    return listen('chat_event', handler)
  }
}

// packages/vscode/src/webview/app/bridge/vscode-bridge.ts
export class VSCodeBridge implements UIBridge {
  async sendMessage(content: string) {
    messenger.post('sendMessage', { content })
  }
  onEvent(handler) {
    return messenger.on('chatEvent', handler)
  }
}

// packages/storybook/src/mocks/mock-bridge.ts — PARA STORYBOOK
export class MockBridge implements UIBridge {
  async sendMessage(content: string) {
    console.log('[mock] send:', content)
  }
  onEvent(handler) {
    // Simula eventos para preview
    setTimeout(() => handler({ type: 'content', data: 'Mock response...' }), 500)
    return () => {}
  }
}
```

**Impacto**: Elimina ~790 LOC duplicadas + torna stories testáveis com MockBridge.

---

### 2.2 Decorator Pattern para Story Providers

Cada frontend precisa de um ambiente diferente no Storybook. Usar **Decorator Composition**:

```typescript
// packages/storybook/src/decorators/index.ts

/** Decorator base: tema + viewport */
export const BaseDecorator: Decorator = (Story, context) => (
  <ThemeProvider theme={context.globals.theme}>
    <Story />
  </ThemeProvider>
)

/** Decorator Desktop: Tailwind + Tauri mock */
export const DesktopDecorator: Decorator = (Story) => (
  <BridgeProvider bridge={new MockBridge()}>
    <div className="bg-surface-950 text-neutral-200 font-sans">
      <Story />
    </div>
  </BridgeProvider>
)

/** Decorator VSCode: CSS vars injetadas + Messenger mock */
export const VSCodeDecorator: Decorator = (Story) => (
  <BridgeProvider bridge={new MockBridge()}>
    <div style={vscodeThemeVars} className="vscode-dark">
      <Story />
    </div>
  </BridgeProvider>
)

/** Decorator Observability: ReactFlow provider + tema Catppuccin */
export const ObservabilityDecorator: Decorator = (Story) => (
  <ReactFlowProvider>
    <div className="observability-theme">
      <Story />
    </div>
  </ReactFlowProvider>
)

/** Decorator CLI: Terminal container + ANSI renderer */
export const CLIDecorator: Decorator = (Story) => (
  <div className="terminal-container" style={{
    background: '#1a1b26',
    color: '#c0caf5',
    fontFamily: "'SF Mono', 'Cascadia Code', monospace",
    padding: '12px',
    borderRadius: '8px',
    fontSize: '13px',
    lineHeight: '1.5',
    minHeight: '384px',
    width: '640px',
  }}>
    <Story />
  </div>
)
```

**Uso nas stories:**

```typescript
// packages/desktop/src/components/MessageList.stories.tsx
export default {
  title: 'Desktop/MessageList',
  component: MessageList,
  decorators: [DesktopDecorator],
} satisfies Meta<typeof MessageList>

// packages/vscode/src/webview/app/components/MessageList.stories.tsx
export default {
  title: 'VSCode/MessageList',
  component: MessageList,
  decorators: [VSCodeDecorator],
} satisfies Meta<typeof MessageList>
```

---

### 2.3 Mediator Pattern para Design Tokens

Os tokens semanticos propostos no solution-architect devem funcionar como **Mediator** entre 3 sistemas de estilo. Mas a implementacao sugerida (objeto JS) nao se integra com CSS. Melhoria:

**Abordagem: CSS Custom Properties como camada universal**

```css
/* packages/storybook/src/tokens/tokens.css */

/* Tokens semanticos — aplicados por decorator conforme o frontend */

/* === Desktop Theme (Tailwind-mapped) === */
.theme-desktop {
  --athion-bg-base: #0a0a0a; /* surface-950 */
  --athion-bg-surface: #171717; /* surface-900 */
  --athion-bg-overlay: #1a1a1a; /* surface-850 */
  --athion-text-primary: #e5e5e5; /* neutral-200 */
  --athion-text-muted: #737373; /* neutral-500 */
  --athion-accent-primary: #3b82f6; /* accent-500 */
  --athion-accent-success: #22c55e; /* success-500 */
  --athion-accent-error: #ef4444; /* error-500 */
  --athion-accent-warning: #eab308; /* warning-500 */
  --athion-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --athion-font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  --athion-radius-sm: 4px;
  --athion-radius-md: 8px;
  --athion-radius-lg: 12px;
}

/* === Observability Theme (Catppuccin Mocha) === */
.theme-observability {
  --athion-bg-base: #1e1e2e;
  --athion-bg-surface: #181825;
  --athion-bg-overlay: #11111b;
  --athion-text-primary: #cdd6f4;
  --athion-text-muted: #a6adc8;
  --athion-accent-primary: #89b4fa;
  --athion-accent-success: #a6e3a1;
  --athion-accent-error: #f38ba8;
  --athion-accent-warning: #f9e2af;
  --athion-font-sans: inherit;
  --athion-font-mono: 'JetBrains Mono', monospace;
  --athion-radius-sm: 4px;
  --athion-radius-md: 6px;
  --athion-radius-lg: 10px;
}

/* === VSCode Theme (mapped from --vscode-* vars) === */
.theme-vscode {
  --athion-bg-base: #1e1e1e;
  --athion-bg-surface: #252526;
  --athion-bg-overlay: #2d2d30;
  --athion-text-primary: #cccccc;
  --athion-text-muted: #858585;
  --athion-accent-primary: #007acc;
  --athion-accent-success: #4ec9b0;
  --athion-accent-error: #f14c4c;
  --athion-accent-warning: #cca700;
  --athion-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --athion-font-mono: 'Cascadia Code', Menlo, Monaco, monospace;
  --athion-radius-sm: 2px;
  --athion-radius-md: 4px;
  --athion-radius-lg: 6px;
}

/* === CLI Theme (Tokyo Night) === */
.theme-cli {
  --athion-bg-base: #1a1b26;
  --athion-bg-surface: #24283b;
  --athion-bg-overlay: #1f2335;
  --athion-text-primary: #c0caf5;
  --athion-text-muted: #565f89;
  --athion-accent-primary: #7aa2f7;
  --athion-accent-success: #9ece6a;
  --athion-accent-error: #f7768e;
  --athion-accent-warning: #e0af68;
  --athion-font-sans: monospace;
  --athion-font-mono: 'SF Mono', 'Cascadia Code', monospace;
  --athion-radius-sm: 0px;
  --athion-radius-md: 0px;
  --athion-radius-lg: 0px;
}
```

**Vantagem sobre a abordagem JS**: CSS vars funcionam nativamente nos componentes sem transpilacao. O ThemeDecorator simplesmente aplica a classe certa.

---

### 2.4 Strategy Pattern para CLI Adapter

O solution-architect propoe Opcao A (snapshot renderer), mas falta detalhar o fallback. Proposta com Strategy:

```typescript
// packages/storybook/src/decorators/cli/types.ts

/** Strategy para renderizar componente Ink no browser */
interface InkRenderStrategy {
  name: string
  render(component: React.ReactElement, props: Record<string, unknown>): React.ReactElement
  supportsInteraction: boolean
}

/** Strategy A: ANSI snapshot (preferida) */
class AnsiSnapshotStrategy implements InkRenderStrategy {
  name = 'ansi-snapshot'
  supportsInteraction = false

  render(component: React.ReactElement) {
    // ink-testing-library → ANSI string → ansi-to-html → <pre>
    const { lastFrame } = inkRender(component)
    const html = ansiToHtml.toHtml(lastFrame())
    return <pre dangerouslySetInnerHTML={{ __html: html }} />
  }
}

/** Strategy B: Screenshot fallback (se Strategy A falhar no browser) */
class ScreenshotStrategy implements InkRenderStrategy {
  name = 'screenshot'
  supportsInteraction = false

  render(_component: React.ReactElement, props: Record<string, unknown>) {
    // Usa screenshots pre-gerados durante CI
    const screenshotPath = getScreenshotPath(props)
    return <img src={screenshotPath} alt="CLI component preview" />
  }
}

/** Strategy C: Web recreation (futuro V2) */
class WebRecreationStrategy implements InkRenderStrategy {
  name = 'web-recreation'
  supportsInteraction = true

  render(component: React.ReactElement) {
    // Versao web do componente com mesma interface
    return <WebTerminalEmulator>{component}</WebTerminalEmulator>
  }
}
```

**PoC obrigatoria**: Testar se `ink-testing-library` roda no browser (Vite bundler) antes de commitar com Strategy A.

---

### 2.5 Composite Pattern para Story Hierarchy

Definir hierarquia clara no sidebar do Storybook:

```
Athion Storybook
├── Docs
│   ├── Introduction
│   ├── Design Tokens
│   ├── Theme Guide
│   └── Component Guide
├── Desktop
│   ├── Layout
│   │   └── App
│   ├── Chat
│   │   ├── MessageList
│   │   ├── InputArea
│   │   └── CodeBlock
│   ├── Navigation
│   │   └── Sidebar
│   └── Feedback
│       ├── StatusBar
│       └── ToolCallCard
├── VSCode
│   ├── Chat
│   │   ├── MessageList
│   │   ├── InputArea
│   │   └── CodeBlock
│   ├── Code
│   │   └── DiffView
│   ├── Feedback
│   │   └── ToolCallCard
│   └── Autocomplete
│       ├── AutocompleteDropdown
│       └── MentionDropdown
├── Observability
│   ├── Monitoring
│   │   ├── TokenBar
│   │   ├── LogPanelBase
│   │   ├── LogPanel
│   │   └── LogPanelLive
│   ├── Flow
│   │   ├── FlowPanel
│   │   └── FlowPanelLive
│   ├── Testing
│   │   └── TestSelector
│   └── System
│       └── ErrorBoundary
└── CLI
    ├── Layout
    │   ├── ChatApp
    │   └── WelcomeScreen
    ├── Chat
    │   ├── MessageList
    │   ├── UserInput
    │   ├── StreamingMessage
    │   └── Markdown
    ├── Feedback
    │   ├── StatusBar
    │   ├── ToolCallDisplay
    │   └── SubAgentDisplay
    └── Interaction
        ├── SkillsMenu
        └── PermissionPrompt
```

**Implementacao via title convention:**

```typescript
// Desktop
export default { title: 'Desktop/Chat/MessageList', component: MessageList }

// VSCode
export default { title: 'VSCode/Chat/MessageList', component: MessageList }

// CLI
export default { title: 'CLI/Chat/MessageList', component: MessageList }
```

---

## 3. Codigo Duplicado — Inventario e Plano de Extracao

### 3.1 Hook `useFeedbackPhrase` — Duplicacao 100%

| Arquivo                                             | LOC | Duplicado        |
| --------------------------------------------------- | --- | ---------------- |
| `desktop/src/hooks/useFeedbackPhrase.ts`            | ~55 | 100%             |
| `vscode/src/webview/app/hooks/useFeedbackPhrase.ts` | ~55 | 100%             |
| `cli/src/ui/hooks/useFeedbackPhrase.ts`             | ~55 | 95% (param name) |

**Extracao**: Mover para `packages/shared/src/hooks/useFeedbackPhrase.ts`

```typescript
// packages/shared/src/hooks/useFeedbackPhrase.ts

export function useFeedbackPhrase(isActive: boolean, intervalMs = 5000): string {
  const [phrase, setPhrase] = useState('')
  const prevIndexRef = useRef<number>(-1)

  useEffect(() => {
    if (!isActive) {
      setPhrase('')
      return
    }

    const pick = () => {
      let next = Math.floor(Math.random() * phrases.length)
      let guard = 0
      while (next === prevIndexRef.current && guard < 5) {
        next = Math.floor(Math.random() * phrases.length)
        guard++
      }
      prevIndexRef.current = next
      setPhrase(phrases[next] ?? '')
    }

    pick()
    const id = setInterval(pick, intervalMs)
    return () => clearInterval(id)
  }, [isActive, intervalMs])

  return phrase
}
```

### 3.2 Componente `CodeBlock` — Duplicacao 100%

| Arquivo                                           | LOC | Duplicado |
| ------------------------------------------------- | --- | --------- |
| `desktop/src/components/CodeBlock.tsx`            | ~45 | 100%      |
| `vscode/src/webview/app/components/CodeBlock.tsx` | ~45 | 100%      |

**Extracao**: Criar componente headless em `packages/shared/src/components/`

```typescript
// packages/shared/src/hooks/useCodeCopy.ts (logica pura)
export function useCodeCopy() {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return { copied, handleCopy }
}
```

Cada frontend continua com seu proprio CodeBlock.tsx mas usa `useCodeCopy()` compartilhado.

### 3.3 Event Handler `chat-events` — Duplicacao 60%

| Arquivo                                       | LOC  | Duplicado                         |
| --------------------------------------------- | ---- | --------------------------------- |
| `desktop/src/hooks/chat-events.ts`            | ~120 | Base                              |
| `vscode/src/webview/app/hooks/chat-events.ts` | ~150 | 60% (+ throttle + eventos extras) |

**Extracao**: Factory com opcoes

```typescript
// packages/shared/src/hooks/createChatEventHandler.ts

interface ChatEventHandlerOptions {
  throttleContentMs?: number // 0 = sem throttle
  onContent: (content: string) => void
  onToolCall: (toolCall: ToolCallInfo) => void
  onToolResult: (id: string, result: string) => void
  onFinish: () => void
  onError: (error: string) => void
}

export function createChatEventHandler(options: ChatEventHandlerOptions) {
  // logica compartilhada com throttle opcional
}
```

### 3.4 `FormattedContent` parser — Duplicacao 90%

| Arquivo                                                      | LOC | Duplicado |
| ------------------------------------------------------------ | --- | --------- |
| `desktop/src/components/MessageList.tsx` (inline)            | ~30 | 90%       |
| `vscode/src/webview/app/components/MessageList.tsx` (inline) | ~30 | Base      |

**Extracao**: Utilitario puro em `packages/shared/src/utils/`

````typescript
// packages/shared/src/utils/parseCodeBlocks.ts

interface ContentPart {
  type: 'text' | 'code'
  content: string
  language?: string
}

export function parseCodeBlocks(markdown: string): ContentPart[] {
  // split por ```...``` — logica atualmente duplicada
}
````

---

## 4. Checklist de Conformidade Arquitetural

### Antes de implementar cada fase do Storybook, verificar:

#### Fase 0 (Nova — Refatoracao pre-stories)

- [ ] `useFeedbackPhrase` extraido para `@athion/shared`
- [ ] `useCodeCopy` extraido para `@athion/shared`
- [ ] `parseCodeBlocks` extraido para `@athion/shared`
- [ ] `createChatEventHandler` factory criada em `@athion/shared`
- [ ] Todos os frontends importam dos shared (sem duplicacao)
- [ ] Testes unitarios para hooks/utils extraidos

#### Fase 1 (Infraestrutura)

- [ ] `packages/storybook` criado com `.storybook/` proprio
- [ ] Paths de stories coletam de todos os 4 frontends
- [ ] `tokens.css` com CSS custom properties para 4 temas
- [ ] ThemeDecorator aplica classe `.theme-*` correta
- [ ] Stories existentes (10) funcionam no novo setup
- [ ] Sidebar organizado por `Frontend/Categoria/Componente`

#### Fase 2 (Design Tokens)

- [ ] Mapeamento completo de cores: Desktop ↔ Observability ↔ VSCode ↔ CLI
- [ ] Tokens de tipografia definidos (font-family, sizes, weights)
- [ ] Tokens de espacamento definidos (padding, gap, margin)
- [ ] Paginas MDX documentam cada token com preview visual
- [ ] Color contrast ratio validado (WCAG AA) via addon-a11y

#### Fase 3 (VSCode Stories)

- [ ] VSCodeDecorator injeta CSS vars `--vscode-*` fake
- [ ] MockBridge implementa `UIBridge` para postMessage
- [ ] Todas as 7 stories criadas com >=2 variantes cada
- [ ] Play functions para componentes interativos (InputArea, AutocompleteDropdown)
- [ ] Decorator adiciona container com dimensoes de VS Code panel

#### Fase 4 (CLI Stories)

- [ ] PoC validada: ink-testing-library funciona no browser OU fallback definido
- [ ] InkRenderStrategy implementada (A ou B conforme resultado da PoC)
- [ ] CLIDecorator com container estilizado como terminal
- [ ] Todas as 11 stories criadas
- [ ] 5 temas CLI (default, dark, light, minimal, dracula) demonstrados

#### Fase 5 (Completar Cobertura)

- [ ] 33/33 componentes com stories
- [ ] `.storybook/` removido do observability
- [ ] Script `bun run storybook` no root package.json
- [ ] Build estático funciona (`bun run build-storybook`)

---

## 5. Padroes de Story Recomendados

### 5.1 Story Template Padrao

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ComponentName } from './ComponentName'

const meta = {
  title: 'Frontend/Categoria/ComponentName',
  component: ComponentName,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered', // ou 'fullscreen' para layouts
  },
  argTypes: {
    // Controles customizados
  },
} satisfies Meta<typeof ComponentName>

export default meta
type Story = StoryObj<typeof meta>

/** Estado padrao */
export const Default: Story = {
  args: {
    // props padrao
  },
}

/** Estado de loading/streaming */
export const Loading: Story = {
  args: {
    isStreaming: true,
  },
}

/** Estado de erro */
export const Error: Story = {
  args: {
    error: 'Something went wrong',
  },
}

/** Interacao — play function */
export const Interactive: Story = {
  args: { onSubmit: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox'), 'Hello')
    await userEvent.keyboard('{Enter}')
    expect(args.onSubmit).toHaveBeenCalledWith('Hello')
  },
}
```

### 5.2 Variantes Obrigatorias por Tipo de Componente

| Tipo                        | Variantes Minimas                       |
| --------------------------- | --------------------------------------- |
| Input (form)                | Default, Filled, Disabled, Error, Focus |
| Display (data)              | WithData, Empty, Loading, Error         |
| Layout (container)          | Default, Responsive, Collapsed          |
| Feedback (status)           | Idle, Active, Success, Error            |
| Interactive (menu/dropdown) | Closed, Open, Selected, Filtered        |

### 5.3 Args Padrao para Mocks

```typescript
// packages/storybook/src/mocks/common-args.ts

export const mockMessages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'Como funciona o sistema de indexacao?',
    timestamp: Date.now(),
  },
  {
    id: '2',
    role: 'assistant',
    content: 'O sistema usa **FTS5** para busca textual...',
    timestamp: Date.now(),
  },
]

export const mockToolCall: ToolCallInfo = {
  id: 'tc-1',
  name: 'search_codebase',
  args: { query: 'indexing manager' },
  status: 'success',
  result: '3 results found',
}

export const mockSkills: SkillInfo[] = [
  { name: 'commit', description: 'Cria commits git formatados' },
  { name: 'review-code', description: 'Revisao de codigo detalhada' },
]
```

---

## 6. Resumo de Recomendacoes

### Para o solution-architect.md

| Secao                  | Alteracao                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Plano de Implementacao | Adicionar **Fase 0: Refatoracao** (3-4 dias) antes das stories                               |
| Solucao Tecnica 4.3    | Adicionar fallback (Strategy B) se ink-testing-library nao rodar no browser                  |
| Solucao Tecnica 4.4    | Trocar tokens JS por **CSS Custom Properties** (`.theme-*` classes)                          |
| Solucao Tecnica (nova) | Adicionar secao de **Mock Providers** (UIBridge, TauriBridge, VSCode vars)                   |
| Riscos                 | Adicionar risco G3 (ink no browser) e G4 (VSCode CSS vars)                                   |
| ADRs                   | Adicionar **ADR-004: Ports & Adapters para hooks** e **ADR-005: Story hierarchy convention** |
| Metricas               | Adicionar: LOC duplicadas eliminadas (target: -790), Interaction tests (target: 5+)          |
| Dependencias           | Adicionar `@storybook/testing-library`, `@storybook/test` para play functions                |

### Novo timeline estimado (com Fase 0)

| Fase                       | Duracao  | Total Acumulado |
| -------------------------- | -------- | --------------- |
| Fase 0: Refatoracao shared | 3-4 dias | 3-4 dias        |
| Fase 1: Infraestrutura     | 2-3 dias | 5-7 dias        |
| Fase 2: Design Tokens      | 2 dias   | 7-9 dias        |
| Fase 3: VSCode Stories     | 2-3 dias | 9-12 dias       |
| Fase 4: CLI Stories        | 3-4 dias | 12-16 dias      |
| Fase 5: Cobertura          | 1-2 dias | 13-18 dias      |

**Total estimado revisado: 13-18 dias** (vs 10-14 original)
