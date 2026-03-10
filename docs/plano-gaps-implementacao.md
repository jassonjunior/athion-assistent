# Plano de Implementação — Gaps Identificados

**Data**: 2026-03-09
**Branch base**: `feat/codebase-indexer-vector-search` → merge para `fase-6/polish`
**Status geral**: Fases 0-5 implementadas. Este plano cobre os gaps restantes.

---

## Visão Geral e Ordem de Implementação

```
1. useSession + usePermission (CLI hooks) ─────→ 2. PermissionPrompt
3. Pinned messages (summarize.ts)               (independente)
4. Tree-sitter no chunker ─────────────────────→ 5. @mentions VSCode
6. Deep links athion:// (Tauri)                 (independente)
7. Documentação                                 (após 1-6)
8. Publicação                                   (após 7)
```

---

## Gap 1 — `useSession` e `usePermission` hooks (CLI)

**Complexidade**: Baixa
**Branch sugerida**: `feat/cli-session-permission-hooks`

### Contexto

O `useChat.ts` do CLI recebe `sessionId` diretamente. Não há hook para listar/trocar sessões. O `PermissionManager` existe em `core/permissions/` mas o CLI não o consome. O orchestrator retorna `decision: 'ask'` mas sem mecanismo de resposta na TUI.

### Arquivos a criar

**`packages/cli/src/hooks/useSession.ts`**

```typescript
interface UseSessionReturn {
  session: Session
  sessions: Session[]
  isLoading: boolean
  createSession: (title?: string) => Promise<Session>
  loadSession: (id: string) => Promise<Session>
  deleteSession: (id: string) => void
  switchSession: (id: string) => Promise<void>
}
export function useSession(core: AthionCore, initialSession: Session): UseSessionReturn
```

**`packages/cli/src/hooks/usePermission.ts`**

```typescript
interface PendingRequest {
  id: string
  action: string
  target: string
  resolve: (decision: PermissionDecision) => void
}
interface UsePermissionReturn {
  pendingRequest: PendingRequest | null
  grant: (decision: PermissionDecision, scope: PermissionScope) => void
  deny: () => void
}
export function usePermission(core: AthionCore): UsePermissionReturn
```

### Arquivos a modificar

- `packages/core/src/orchestrator/types.ts` — adicionar eventos `permission_request` e `permission_resolved` ao union `OrchestratorEvent`
- `packages/core/src/orchestrator/tool-dispatcher.ts` — adicionar `onPermissionRequest?: (action, target) => Promise<PermissionDecision>` no deps; pausar execução quando `check()` retorna `'ask'`
- `packages/cli/src/hooks/useChat.ts` — adicionar case `permission_request` no loop de eventos

---

## Gap 2 — `PermissionPrompt` componente (CLI TUI)

**Complexidade**: Baixa
**Depende de**: Gap 1

### Arquivo a criar

**`packages/cli/src/ui/PermissionPrompt.tsx`**

```typescript
interface PermissionPromptProps {
  action: string
  target: string
  onDecide: (decision: PermissionDecision, scope: PermissionScope) => void
  theme: Theme
}
```

Usa `useInput` do Ink. Teclas: `y/Enter` → allow+once, `s` → allow+session, `r` → allow+remember, `n/Esc` → deny. Renderiza `<Box borderStyle="round">` com tema.

### Arquivo a modificar

- `packages/cli/src/ui/ChatApp.tsx` — adicionar `usePermission(core)` e renderizar `<PermissionPrompt>` condicionalmente acima do `<UserInput>`

---

## Gap 3 — Mensagens "pinned" que nunca compactam

**Complexidade**: Baixa
**Independente** (pode ser feito em qualquer ordem)

### Contexto

`summarize.ts` preserva mensagens `system` do início por posição, mas mensagens importantes inseridas no meio do histórico (contexto de arquivo, resultados de subagentes) são compactadas normalmente.

### Arquivos a modificar

**`packages/core/src/tokens/summarize.ts`**

- Adicionar `PINNED_PREFIX = '[PINNED]'`
- Modificar `splitMessages()` para extrair mensagens pinned do meio do histórico
- Manter pinned mensagens após compactação: `[...systemMsgs, ...pinnedMsgs, summaryMessage, ...preserved]`

**`packages/core/src/tokens/manager.ts`**

- Modificar `compactSlidingWindow()` para preservar mensagens pinned na sliding window

**`packages/core/src/orchestrator/prompt-builder.ts`**

- Adicionar helper `pinMessage(content: string): string` e `isPinnedMessage(msg): boolean`

### API pública proposta

```typescript
export const PINNED_PREFIX = '[PINNED]'
export function pinMessage(content: string): string
export function isPinnedMessage(msg: { content: string }): boolean
```

---

## Gap 4 — Tree-sitter no chunker

**Complexidade**: Alta
**Branch sugerida**: `feat/tree-sitter-chunker`

### Contexto

`packages/core/src/indexing/chunker.ts` usa regex para detectar fronteiras de funções/classes. Falha em arrow functions multilinhas, decorators TypeScript, template strings com código. Tree-sitter produz AST real.

### Estratégia

Usar `web-tree-sitter` (WASM, sem binários nativos — compatível com Bun) com grammars `.wasm` compiladas. Bun suporta `WebAssembly.compile` nativamente.

### Arquivos a criar

**`packages/core/src/indexing/tree-sitter-chunker.ts`**

- `detectLanguage(filePath)` → obtém linguagem pelo extension
- Lazy load de grammars `.wasm` com `Map<lang, Parser.Language>`
- `parser.parse(content)` → AST traversal buscando: `function_declaration`, `function_expression`, `arrow_function`, `class_declaration`, `method_definition`, `export_statement`
- Extrai `symbolName` do child `identifier`

**`packages/core/src/indexing/grammars/`** (diretório com arquivos .wasm)

- `tree-sitter-typescript.wasm`
- `tree-sitter-javascript.wasm`
- `tree-sitter-python.wasm`
- `tree-sitter-rust.wasm`
- `tree-sitter-go.wasm`

### Arquivos a modificar

**`packages/core/src/indexing/chunker.ts`**

- Lógica atual → `chunkFileWithRegex()` (renomear)
- Nova `chunkFile()`: tenta tree-sitter, fallback para regex

**`packages/core/package.json`**

```json
"web-tree-sitter": "^0.23.0"
```

---

## Gap 5 — `@mentions` de arquivos/símbolos no webview VS Code

**Complexidade**: Média
**Branch sugerida**: `feat/vscode-at-mentions`
**Depende de**: Gap 4 (melhora qualidade dos resultados, mas não é bloqueante)

### Fluxo

```
User digita "@" → useAtMention detecta /@(\w*)$/ → 'mention:search' RPC
→ Extension: core.indexer.search(query) → 'mention:results'
→ MentionDropdown aparece → User seleciona → texto inserido
→ useChat.sendMessage pré-processa @mentions antes de enviar ao LLM
```

### Arquivos a criar

**`packages/vscode/src/webview/app/hooks/useAtMention.ts`**

```typescript
interface UseAtMentionReturn {
  isOpen: boolean
  results: MentionResult[]
  query: string
  selectedIndex: number
  onKeyDown: (e: KeyboardEvent) => boolean
  onSelect: (result: MentionResult) => string
  trigger: (text: string, cursorPos: number) => void
  close: () => void
}
```

**`packages/vscode/src/webview/app/components/MentionDropdown.tsx`**

- Dropdown com posicionamento absoluto relativo ao cursor no textarea
- Exibe: ícone arquivo + nome + símbolo (se houver) + linha

### Arquivos a modificar

- `packages/vscode/src/webview/app/components/InputArea.tsx` — integrar `useAtMention()`, renderizar `<MentionDropdown>`
- `packages/vscode/src/bridge/messenger-types.ts` — adicionar `mention:search` (WebviewToExtension) e `mention:results` (ExtensionToWebview)
- `packages/vscode/src/webview/chat-view-provider.ts` — handler para `mention:search` → `core.indexer.search()`
- `packages/vscode/src/webview/app/hooks/useChat.ts` — pré-processar `@mentions` antes de `post({ type: 'chat:send' })`

---

## Gap 6 — Deep links `athion://` no Tauri

**Complexidade**: Média
**Branch sugerida**: `feat/tauri-deep-links`

### Contexto

Infraestrutura parcialmente implementada: scheme registrado em `tauri.conf.json`, plugin `tauri-plugin-deep-link` no `Cargo.toml`, `.plugin(tauri_plugin_deep_link::init())` no `lib.rs`. Falta o handler.

### Esquema de URLs

```
athion://chat?session=<id>           → abre sessão específica
athion://chat?message=<texto>        → abre com mensagem pré-preenchida
athion://new                         → cria nova sessão
athion://config?key=<k>&value=<v>   → configura uma chave
```

### Arquivo a criar

**`packages/desktop/src-tauri/src/deep_link.rs`**

```rust
pub fn handle_deep_link(app: &AppHandle, urls: Vec<String>)
fn dispatch(app: &AppHandle, url: &Url)
fn handle_chat(app: &AppHandle, url: &Url)   // emite 'deep-link:chat'
fn handle_new_session(app: &AppHandle)        // emite 'deep-link:new'
fn handle_config(app: &AppHandle, url: &Url)  // chama sidecar config.set
```

### Arquivos a modificar

- `packages/desktop/src-tauri/src/lib.rs` — adicionar `mod deep_link`, registrar listener `tauri_plugin_deep_link::register("athion", ...)`
- `packages/desktop/src-tauri/Cargo.toml` — adicionar `url = "2"`
- `packages/desktop/src/` — adicionar listeners para eventos `deep-link:chat`, `deep-link:new`

---

## Gap 7 — Documentação completa

**Complexidade**: Baixa
**Depende de**: Gaps 1-6 implementados

### Arquivos a criar/modificar

| Arquivo                      | Ação      | Seções principais                                                                    |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `README.md` (raiz)           | Refatorar | O que é, requisitos, instalação rápida, uso por plataforma, providers, contribuição  |
| `packages/core/README.md`    | Criar     | Arquitetura dos módulos, API pública (`bootstrap()`), exemplos, todos os subsistemas |
| `packages/cli/README.md`     | Criar     | Comandos (tabela), flags globais, exemplos, modos (interativo, one-shot, --resume)   |
| `packages/vscode/README.md`  | Criar     | Instalação, configuração, comandos, atalhos, codebase indexer                        |
| `packages/desktop/README.md` | Criar     | Build, configuração, deep links, atalhos globais, system tray                        |
| `docs/architecture.md`       | Criar     | Diagrama de sequência, camadas por plataforma, fluxo de dados                        |

---

## Gap 8 — Publicação

**Complexidade**: Alta
**Depende de**: Gap 7

### npm (`@athion/core` e `@athion/cli`)

Arquivos a modificar:

- `packages/core/package.json` — remover `"private": true`, adicionar `"publishConfig"`, `"files"`, `"exports"`
- `packages/cli/package.json` — remover `"private": true`, adicionar `"bin": { "athion": "./dist/index.js" }`, `"files"`

### VS Code Marketplace

- `packages/vscode/package.json` — verificar `"publisher"`, `"icon"` (PNG 128x128), `"repository"`
- `.github/workflows/publish-vscode.yml` — criar; trigger: push para `release/vscode-*`; steps: checkout → build → `vsce publish`

### Desktop builds

- `packages/desktop/src-tauri/tauri.conf.json` — verificar `"bundle"` com targets por OS
- `.github/workflows/build-desktop.yml` — matrix: ubuntu + macos + windows; artefatos como GitHub Release assets

### Versioning

- Inicializar `changesets` para gerenciar versões no monorepo: `npx changeset init`
- `.github/workflows/release.yml` — bump de versão + publicação automática

---

## Tabela Resumo

| #   | Gap                              | Arquivos novos | Arquivos modificados | Complexidade | Ordem        |
| --- | -------------------------------- | -------------- | -------------------- | ------------ | ------------ |
| 1   | useSession + usePermission (CLI) | 2 hooks        | 3 arquivos core/cli  | Baixa        | 1            |
| 2   | PermissionPrompt (CLI)           | 1 componente   | 1 arquivo            | Baixa        | 2            |
| 3   | Pinned messages                  | —              | 3 arquivos core      | Baixa        | 3 (qualquer) |
| 4   | Tree-sitter chunker              | 1 ts + 5 wasm  | 2 arquivos           | Alta         | 4            |
| 5   | @mentions VSCode                 | 2 arquivos     | 4 arquivos           | Média        | 5            |
| 6   | Deep links Tauri                 | 1 rs           | 3 arquivos           | Média        | 6            |
| 7   | Documentação                     | 5 md + 1 md    | 1 md                 | Baixa        | 7            |
| 8   | Publicação                       | 2-3 workflows  | 4 package.json       | Alta         | 8            |

---

## Status de Acompanhamento

- [ ] Gap 1 — useSession + usePermission
- [ ] Gap 2 — PermissionPrompt
- [ ] Gap 3 — Pinned messages
- [ ] Gap 4 — Tree-sitter chunker
- [ ] Gap 5 — @mentions VSCode
- [ ] Gap 6 — Deep links Tauri
- [ ] Gap 7 — Documentação
- [ ] Gap 8 — Publicação
