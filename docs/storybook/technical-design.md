# TDD — Storybook Unificado + Design System

| Campo              | Valor                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Tech Lead          | @jassonjunior                                                                                            |
| Status             | Draft                                                                                                    |
| Criado             | 2026-03-14                                                                                               |
| Ultima Atualizacao | 2026-03-14                                                                                               |
| Docs relacionados  | [solution-architect.md](./solution-architect.md), [architecture-patterns.md](./architecture-patterns.md) |

---

## 1. Contexto

O Athion Assistent e um monorepo com 4 frontends React em producao, cada um com runtime e sistema de estilos diferentes. O Storybook existe parcialmente — configurado dentro do `observability-athion` com coverage de 30% dos componentes (10/33). Os pacotes VSCode e CLI nao possuem stories. Alem disso, ~790 linhas de codigo estao duplicadas entre os frontends (hooks, utils, event handlers) sem nenhum mecanismo de compartilhamento.

**Background**: O projeto usa React 19 em todos os frontends, mas com renderers diferentes — DOM (desktop/vscode/observability) e Ink (CLI/terminal). O Storybook atual roda via Vite e ja inclui addons de a11y, docs e vitest.

**Dominio**: Developer Experience — ferramentas internas de desenvolvimento e design system.

**Stakeholders**: Developers do projeto, designer (quando houver), e qualquer contribuidor que precise entender ou modificar componentes visuais.

---

## 2. Definicao do Problema e Motivacao

### Problemas que estamos resolvendo

- **70% dos componentes sem documentacao visual**: 23 de 33 componentes nao tem stories, dificultando revisao de design e onboarding
  - Impacto: Novos contribuidores precisam rodar cada app individualmente para ver componentes
- **~790 LOC duplicadas entre frontends**: Hooks (`useFeedbackPhrase`, `useCodeCopy`), parsers (`FormattedContent`), e event handlers (`chat-events`) estao copiados em 2-3 pacotes
  - Impacto: Bug fixes e melhorias precisam ser aplicados em multiplos arquivos
- **Nenhum controle sobre consistencia de design**: 3 sistemas de cores independentes (Tailwind, Catppuccin CSS, VSCode CSS vars) sem mapeamento entre eles
  - Impacto: Drift visual entre frontends, experiencia fragmentada para o usuario

### Por que agora?

- 4 frontends ativos em producao com componentes sendo modificados regularmente
- Duplicacao de codigo crescendo a cada feature nova
- Sem referencia visual centralizada, decisoes de design sao ad-hoc

### Impacto de NAO resolver

- **Tecnico**: Divergencia crescente entre frontends, bugs duplicados
- **Produtividade**: Tempo gasto recriando componentes que ja existem em outro pacote
- **Qualidade**: Bugs visuais descobertos apenas em producao

---

## 3. Escopo

### Em Escopo (V1)

- Extrair codigo duplicado para `@athion/shared` (Fase 0 — pre-requisito)
- Mover Storybook para `packages/storybook` independente
- Criar decorators por frontend (Desktop, VSCode, Observability, CLI)
- Mock providers para runtimes (Tauri bridge, VSCode postMessage)
- Stories para todos os 33 componentes com minimo 2 variantes cada
- Design tokens unificados via CSS Custom Properties (`--athion-*`)
- Documentacao MDX (Introduction, Design Tokens, Theme Guide, Component Guide)
- Viewports customizados por plataforma (Desktop, VSCode Panel, Terminal 80x24)
- Adapter para componentes CLI/Ink no browser (PoC obrigatoria)

### Fora do Escopo (V1)

- Visual regression testing com Chromatic (V2)
- Figma sync / design handoff automatizado (V2)
- Component library publicada como pacote npm (V2)
- Migracao dos frontends para usar tokens `--athion-*` diretamente (V2)
- Storybook composition (federated) (V2)

### Futuro (V2+)

- Chromatic CI/CD com visual regression
- Design system publicado como pacote independente
- Convergencia gradual dos 3 sistemas de estilo para tokens unificados

---

## 4. Solucao Tecnica

### 4.1 Visao Geral da Arquitetura

O Storybook unificado funciona como **camada de apresentacao** que coleta stories de todos os 4 frontends, aplicando decorators especificos por runtime para simular o ambiente de cada plataforma.

```
                     ┌─────────────────────────────────┐
                     │     packages/storybook           │
                     │  .storybook/ (config central)    │
                     │  src/tokens/ (design tokens CSS) │
                     │  src/decorators/ (por frontend)  │
                     │  src/mocks/ (bridge, data)       │
                     │  src/docs/ (MDX pages)           │
                     └────────────┬────────────────────┘
                                  │ coleta stories de:
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
   ┌────────▼─────┐    ┌─────────▼────────┐    ┌───────▼────────┐
   │   Desktop    │    │   Observability   │    │     VSCode     │
   │ *.stories.tsx│    │  *.stories.tsx    │    │ *.stories.tsx  │
   │  + Decorator │    │   + Decorator     │    │  + Decorator   │
   │  (Tailwind)  │    │   (Catppuccin)    │    │  (CSS vars)    │
   └──────────────┘    └──────────────────┘    └────────────────┘
                                                        │
                                               ┌────────▼────────┐
                                               │      CLI        │
                                               │ *.stories.tsx   │
                                               │  + InkAdapter   │
                                               │  (ANSI→HTML)    │
                                               └─────────────────┘
```

### 4.2 Componentes da Solucao

**Storybook Config Central** (`packages/storybook/.storybook/`):

- `main.ts`: Coleta stories dos 4 frontends via glob patterns
- `preview.ts`: Carrega CSS de todos os temas + registra decorators globais
- `viewports.ts`: 6 viewports customizados por plataforma

**Design Tokens** (`packages/storybook/src/tokens/tokens.css`):

- CSS Custom Properties com prefixo `--athion-*`
- 4 classes de tema: `.theme-desktop`, `.theme-observability`, `.theme-vscode`, `.theme-cli`
- Cada classe mapeia cores, tipografia e border-radius do respectivo frontend

**Decorators** (`packages/storybook/src/decorators/`):

- `DesktopDecorator`: Aplica Tailwind context + mock Tauri bridge
- `VSCodeDecorator`: Injeta CSS vars `--vscode-*` fake + mock postMessage
- `ObservabilityDecorator`: ReactFlowProvider + tema Catppuccin
- `CLIDecorator`: Container terminal + InkRenderStrategy (ANSI→HTML ou screenshot)

**Mock Providers** (`packages/storybook/src/mocks/`):

- `MockBridge`: Implementa interface `UIBridge` com respostas simuladas
- `common-args.ts`: Dados mock reutilizaveis (messages, tool calls, skills)

**Shared Extractions** (`packages/shared/src/`):

- `hooks/useFeedbackPhrase.ts`: Hook extraido (100% duplicado em 3 pacotes)
- `hooks/useCodeCopy.ts`: Logica de copy-to-clipboard (100% duplicado)
- `utils/parseCodeBlocks.ts`: Parser markdown→code blocks (90% duplicado)
- `hooks/createChatEventHandler.ts`: Factory de event handler (60% duplicado)

### 4.3 Mock Providers por Frontend

Cada frontend depende de APIs de runtime que nao existem no browser do Storybook:

| Frontend      | Runtime API                          | Mock Necessario                          |
| ------------- | ------------------------------------ | ---------------------------------------- |
| Desktop       | `@tauri-apps/api` (invoke, listen)   | `MockBridge` que implementa `UIBridge`   |
| VSCode        | `postMessage` / `acquireVsCodeApi()` | `MockMessenger` + CSS vars injetadas     |
| Observability | `ReactFlowProvider`                  | Provider com mock nodes/edges            |
| CLI           | `process.stdout` / Ink renderer      | `InkRenderStrategy` (ANSI ou screenshot) |

**Interface `UIBridge`** (Ports & Adapters):

- `sendMessage(content)`: Envia mensagem ao core
- `abortGeneration()`: Cancela geracao em andamento
- `onEvent(handler)`: Registra listener de eventos de chat
- `getSkills()`: Lista skills disponiveis
- `getFiles(query)`: Busca arquivos no workspace

Cada frontend implementa essa interface com seu runtime. O Storybook usa `MockBridge` que simula respostas.

### 4.4 Adapter CLI/Ink — Estrategia com Fallback

**Strategy A (Preferida): ANSI Snapshot**

- `ink-testing-library` renderiza componente → string ANSI
- `ansi-to-html` converte para HTML
- Exibido em `<pre>` estilizado como terminal

**Strategy B (Fallback): Screenshot**

- Se `ink-testing-library` nao funcionar no browser (depende de Node.js APIs)
- Script de CI gera screenshots PNG dos componentes
- Stories exibem `<img>` com screenshot correspondente

**PoC obrigatoria antes da Fase 4**: Testar se Strategy A roda no bundler Vite. Se falhar, usar Strategy B.

### 4.5 Hierarquia de Stories no Sidebar

```
Docs/
  Introduction
  Design Tokens
  Theme Guide
  Component Guide
Desktop/
  Chat/ (MessageList, InputArea, CodeBlock)
  Navigation/ (Sidebar)
  Feedback/ (StatusBar, ToolCallCard)
  Layout/ (App)
VSCode/
  Chat/ (MessageList, InputArea, CodeBlock)
  Code/ (DiffView)
  Feedback/ (ToolCallCard)
  Autocomplete/ (AutocompleteDropdown, MentionDropdown)
Observability/
  Monitoring/ (TokenBar, LogPanelBase, LogPanel, LogPanelLive)
  Flow/ (FlowPanel, FlowPanelLive)
  Testing/ (TestSelector)
  System/ (ErrorBoundary)
CLI/
  Chat/ (MessageList, UserInput, StreamingMessage, Markdown)
  Feedback/ (StatusBar, ToolCallDisplay, SubAgentDisplay)
  Interaction/ (SkillsMenu, PermissionPrompt)
  Layout/ (ChatApp, WelcomeScreen)
```

Convencao de naming: `title: 'Frontend/Categoria/ComponentName'`

---

## 5. Riscos

| Risco                                                                                      | Impacto | Probabilidade | Mitigacao                                                                                        |
| ------------------------------------------------------------------------------------------ | ------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `ink-testing-library` nao funciona no browser (depende de Node APIs como `process.stdout`) | Alto    | Media         | PoC obrigatoria na Fase 4; fallback para screenshot-based stories                                |
| Hooks que dependem de runtime (Tauri `invoke`, VSCode `postMessage`) quebram no Storybook  | Alto    | Alta          | Mock providers obrigatorios via decorators; interface `UIBridge` compartilhada                   |
| Conflito de CSS entre temas dos 3 frontends carregados simultaneamente                     | Medio   | Alta          | Cada decorator aplica classe `.theme-*` com scoping; CSS de cada frontend carregado isoladamente |
| CSS vars `--vscode-*` nao existem fora do VS Code runtime                                  | Medio   | Alta          | VSCodeDecorator injeta todas as vars necessarias com valores do tema Dark default                |
| ReactFlow crasha sem `ReactFlowProvider`                                                   | Medio   | Alta          | ObservabilityDecorator inclui provider + mock nodes/edges estaticos                              |
| Refatoracao de hooks compartilhados quebra funcionalidade existente                        | Medio   | Media         | Testes unitarios para cada hook extraido; import path update automatizado                        |
| Performance degradada com 33+ stories + addons                                             | Baixo   | Baixa         | Lazy loading por pacote; desabilitar addons pesados em desenvolvimento                           |

---

## 6. Estrategia de Testes

| Tipo                  | Escopo                                                              | Abordagem                               |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| **Unit Tests**        | Hooks e utils extraidos para shared                                 | Vitest com React Testing Library        |
| **Story Tests**       | Renderizacao e estado de cada componente                            | Storybook play functions + addon-vitest |
| **Interaction Tests** | Componentes interativos (InputArea, Autocomplete, PermissionPrompt) | Play functions com userEvent            |
| **Visual Smoke**      | Todas as stories renderizam sem erro                                | `build-storybook` no CI sem falhas      |
| **Accessibility**     | WCAG AA compliance para cores e contraste                           | addon-a11y em todas as stories          |

### Cenarios de Teste por Fase

**Fase 0 (Shared Extraction)**:

- `useFeedbackPhrase`: Retorna frase quando ativo, string vazia quando inativo, troca a cada intervalo
- `useCodeCopy`: Seta `copied=true` apos copy, reseta apos 2s
- `parseCodeBlocks`: Extrai blocos de codigo com linguagem correta, trata markdown misto
- `createChatEventHandler`: Processa content/tool_call/finish eventos, throttle opcional funciona

**Fase 3 (VSCode Stories)**:

- Play function: InputArea aceita texto, dispara submit ao Enter
- Play function: AutocompleteDropdown abre com `/`, filtra por texto, seleciona com Tab

**Fase 4 (CLI Stories)**:

- Verifica que InkAdapter renderiza HTML valido (ou fallback gera imagem valida)
- 5 temas CLI renderizam com cores corretas

---

## 7. Plano de Implementacao

### Fase 0: Extracao de Codigo Compartilhado (3-4 dias)

| Task | Descricao                                                           | Status |
| ---- | ------------------------------------------------------------------- | ------ |
| 0.1  | Extrair `useFeedbackPhrase` para `@athion/shared` + testes          | TODO   |
| 0.2  | Extrair `useCodeCopy` para `@athion/shared` + testes                | TODO   |
| 0.3  | Extrair `parseCodeBlocks` para `@athion/shared` + testes            | TODO   |
| 0.4  | Criar `createChatEventHandler` factory em `@athion/shared` + testes | TODO   |
| 0.5  | Atualizar imports nos 3 frontends (desktop, vscode, cli)            | TODO   |
| 0.6  | Deletar arquivos duplicados nos pacotes originais                   | TODO   |
| 0.7  | Rodar testes existentes para validar que nada quebrou               | TODO   |

### Fase 1: Infraestrutura Storybook (2-3 dias)

| Task | Descricao                                                         | Status |
| ---- | ----------------------------------------------------------------- | ------ |
| 1.1  | Criar `packages/storybook` com package.json e tsconfig            | TODO   |
| 1.2  | Configurar `.storybook/main.ts` com paths de todos os 4 frontends | TODO   |
| 1.3  | Migrar config e deps do observability para novo pacote            | TODO   |
| 1.4  | Criar `tokens.css` com classes `.theme-*` para 4 temas            | TODO   |
| 1.5  | Criar ThemeDecorator com switcher via Storybook globals           | TODO   |
| 1.6  | Configurar viewports customizados (6 presets)                     | TODO   |
| 1.7  | Validar que stories existentes (10) funcionam no novo setup       | TODO   |

### Fase 2: Design Tokens + Documentacao (2 dias)

| Task | Descricao                                                       | Status |
| ---- | --------------------------------------------------------------- | ------ |
| 2.1  | Mapear cores semanticas: Desktop ↔ Observability ↔ VSCode ↔ CLI | TODO   |
| 2.2  | Documentar tokens de tipografia e espacamento                   | TODO   |
| 2.3  | Criar MDX: Introduction.mdx, DesignTokens.mdx                   | TODO   |
| 2.4  | Criar MDX: ThemeGuide.mdx, ComponentGuide.mdx                   | TODO   |

### Fase 3: VSCode Stories (2-3 dias)

| Task | Descricao                                                       | Status |
| ---- | --------------------------------------------------------------- | ------ |
| 3.1  | Criar VSCodeDecorator (CSS vars fake + MockBridge)              | TODO   |
| 3.2  | Stories: MessageList, InputArea, CodeBlock (3 componentes)      | TODO   |
| 3.3  | Stories: DiffView, ToolCallCard (2 componentes)                 | TODO   |
| 3.4  | Stories: AutocompleteDropdown, MentionDropdown + play functions | TODO   |

### Fase 4: CLI/Ink Stories (3-4 dias)

| Task | Descricao                                                                  | Status |
| ---- | -------------------------------------------------------------------------- | ------ |
| 4.1  | PoC: Validar se ink-testing-library + ansi-to-html roda no browser         | TODO   |
| 4.2  | Implementar InkRenderStrategy (A ou B conforme PoC)                        | TODO   |
| 4.3  | Criar CLIDecorator com container terminal estilizado                       | TODO   |
| 4.4  | Stories: StatusBar, WelcomeScreen, Markdown                                | TODO   |
| 4.5  | Stories: MessageList, StreamingMessage, ToolCallDisplay                    | TODO   |
| 4.6  | Stories: UserInput, SkillsMenu, PermissionPrompt, SubAgentDisplay, ChatApp | TODO   |

### Fase 5: Completar Cobertura + Limpeza (1-2 dias)

| Task | Descricao                                                               | Status |
| ---- | ----------------------------------------------------------------------- | ------ |
| 5.1  | Desktop: Story para App.tsx + variantes extras nas existentes           | TODO   |
| 5.2  | Observability: FlowPanel, FlowPanelLive, LogPanel, LogPanelLive         | TODO   |
| 5.3  | Remover `.storybook/` antigo do observability                           | TODO   |
| 5.4  | Adicionar scripts no root package.json (`storybook`, `build-storybook`) | TODO   |
| 5.5  | Validar build estatico funciona                                         | TODO   |

**Total estimado: 13-18 dias**

**Dependencias entre fases**:

- Fase 0 deve ser completada antes de todas as outras (elimina duplicacao)
- Fase 1 deve ser completada antes de Fases 2-5 (infraestrutura base)
- Fases 2, 3, 4 podem ser parallelizadas apos Fase 1
- Fase 5 depende de 1, 3, 4

---

## 8. Plano de Migracao

A migracao do Storybook atual (dentro de observability) para o novo pacote dedicado segue estes passos:

**Fase de Transicao (dentro da Fase 1)**:

1. Criar `packages/storybook` com todas as dependencias do storybook
2. Copiar `.storybook/main.ts` e `.storybook/preview.ts` para novo pacote
3. Expandir story paths para incluir vscode e cli
4. Validar que stories existentes (10) renderizam corretamente
5. Atualizar root scripts para apontar para novo pacote
6. Remover storybook deps e config do observability

**Backward Compatibility**: Durante a transicao, ambos os setups funcionam simultaneamente. A remocao do antigo so acontece apos validacao completa (task 5.3).

---

## 9. Plano de Rollback

Como este projeto e de tooling interno (nao afeta producao), o rollback e simples:

**Trigger de rollback**: Stories existentes nao funcionam apos migracao

**Passos**:

1. Reverter commit que removeu `.storybook/` do observability
2. Scripts do root voltam a apontar para observability
3. Investigar causa da falha no novo setup
4. Corrigir e re-tentar

**Para Fase 0 (refatoracao shared)**:

- Se hook extraido causar regressao, reverter commit e restaurar arquivo original no pacote afetado
- Testes existentes servem como gate — nao mergear se falharem

---

## 10. Metricas de Sucesso

| Metrica                                        | Baseline     | Target V1                          |
| ---------------------------------------------- | ------------ | ---------------------------------- |
| Componentes com stories                        | 10/33 (30%)  | 33/33 (100%)                       |
| Frontends integrados no Storybook              | 2/4          | 4/4                                |
| LOC duplicadas entre frontends                 | ~790         | < 50                               |
| Design tokens documentados                     | 0 categorias | 3 (cores, tipografia, espacamento) |
| Paginas MDX de documentacao                    | 0            | 4                                  |
| Viewports customizados                         | 0            | 6                                  |
| Stories com play functions (interaction tests) | 0            | 5+                                 |
| Build estatico (`build-storybook`)             | N/A          | Funcional sem erros                |

---

## 11. Alternativas Consideradas

| Alternativa                                | Pros                                               | Contras                                                            | Por que descartada                          |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| **Manter Storybook no observability**      | Zero esforco de migracao                           | Acoplamento; CLI/VSCode nao cabem                                  | Nao escala para 4 frontends                 |
| **Um Storybook por pacote** (4 instancias) | Isolamento total por frontend                      | Duplicacao de config; sem visao unificada; sem comparacao de temas | Perde o objetivo de design system unificado |
| **Storybook Composition** (federado)       | Cada pacote roda seu Storybook; composicao na root | Complexidade alta; 4 processos de dev; latencia de composicao      | Overengineering para o tamanho do projeto   |
| **Ladle** (alternativa ao Storybook)       | Mais leve, faster builds                           | Ecossistema menor; sem addon-a11y robusto; sem vitest integration  | Addons existentes seriam perdidos           |

**Decisao**: Pacote dedicado unico — melhor custo-beneficio entre unificacao e simplicidade.

---

## 12. Dependencias

| Dependencia                   | Tipo      | Status                             | Risco                                 |
| ----------------------------- | --------- | ---------------------------------- | ------------------------------------- |
| `@storybook/react-vite` ^10.2 | Existente | Instalado                          | Baixo                                 |
| `@storybook/addon-a11y`       | Existente | Instalado                          | Baixo                                 |
| `@storybook/addon-docs`       | Existente | Instalado                          | Baixo                                 |
| `@storybook/addon-vitest`     | Existente | Instalado                          | Baixo                                 |
| `@storybook/addon-viewport`   | Nova      | Precisa instalar                   | Baixo                                 |
| `@storybook/addon-themes`     | Nova      | Precisa instalar                   | Baixo                                 |
| `@storybook/test`             | Nova      | Precisa instalar (play functions)  | Baixo                                 |
| `ink-testing-library`         | Nova      | Precisa instalar + PoC             | Medio (pode nao funcionar no browser) |
| `ansi-to-html`                | Nova      | Precisa instalar                   | Baixo                                 |
| `@chromatic-com/storybook`    | Existente | Instalado (manter para V2)         | Baixo                                 |
| `@xyflow/react`               | Existente | Instalado (para FlowPanel stories) | Baixo                                 |

---

## 13. Glossario

| Termo             | Descricao                                                                               |
| ----------------- | --------------------------------------------------------------------------------------- |
| **Story**         | Representacao visual de um componente em um estado especifico no Storybook              |
| **Decorator**     | Wrapper que adiciona contexto (tema, provider, mock) ao redor de uma story              |
| **Play Function** | Funcao que simula interacoes do usuario em uma story (click, type, etc.)                |
| **Design Token**  | Valor de design nomeado (cor, fonte, espacamento) reutilizavel entre frontends          |
| **Ink**           | Framework React para construir CLIs — renderiza para terminal ao inves de DOM           |
| **UIBridge**      | Interface (Port) que abstrai comunicacao entre frontend e core, independente de runtime |
| **ANSI**          | Codigos de escape usados para cores e formatacao em terminais                           |
| **MDX**           | Formato que mistura Markdown com JSX, usado para documentacao no Storybook              |
| **Viewport**      | Preset de dimensoes que simula o tamanho da tela/container de cada plataforma           |

---

## 14. Questoes em Aberto

| #   | Questao                                                         | Contexto                                               | Owner         | Status |
| --- | --------------------------------------------------------------- | ------------------------------------------------------ | ------------- | ------ |
| 1   | Chromatic em V1 ou V2?                                          | Ja tem addon instalado mas sem CI configurado          | @jassonjunior | Aberto |
| 2   | CLI adapter: aceitar preview estatico ou investir em interacao? | Depende do resultado da PoC (task 4.1)                 | @jassonjunior | Aberto |
| 3   | Publicar storybook estatico?                                    | GitHub Pages ou Vercel para acesso externo             | @jassonjunior | Aberto |
| 4   | ReactFlow mock: dados estaticos ou snapshot real?               | Observability FlowPanel precisa de nodes/edges         | @jassonjunior | Aberto |
| 5   | Expandir `@athion/shared` ou criar `@athion/ui-shared`?         | Shared atual so tem i18n; adicionar hooks pode poluir  | @jassonjunior | Aberto |
| 6   | Migrar frontends para tokens `--athion-*` em V1 ou V2?          | Tokens servem como referencia ou substituem CSS atual? | @jassonjunior | Aberto |

---

## 15. Validacao do TDD

### Secoes Obrigatorias (7/7)

- [x] Header e Metadata
- [x] Contexto
- [x] Definicao do Problema e Motivacao
- [x] Escopo (In/Out/Future)
- [x] Solucao Tecnica
- [x] Riscos (7 riscos com mitigacao)
- [x] Plano de Implementacao (6 fases com tasks)

### Secoes Criticas (4/4)

- [x] Estrategia de Testes
- [x] Plano de Migracao
- [x] Plano de Rollback
- [x] Metricas de Sucesso

### Secoes Adicionais (4/4)

- [x] Alternativas Consideradas
- [x] Dependencias
- [x] Glossario
- [x] Questoes em Aberto
