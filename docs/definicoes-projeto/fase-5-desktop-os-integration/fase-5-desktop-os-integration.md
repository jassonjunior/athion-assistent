# Fase 5: App Desktop + OS Integration (Tauri)

**Semanas**: 16-20
**Objetivo**: App desktop nativo com integracao profunda ao sistema operacional.
**Pre-requisitos**: Fase 3 (CLI) concluida — reutiliza logica de chat. Fase 4 (IDE) opcional.
**Entregavel**: App instalavel para macOS, Linux e Windows com system tray, hotkeys, deep links.

---

## 1. Visao Geral

O app desktop e a interface standalone do Athion — para uso sem IDE. Diferente de um "chat na web", e um app nativo que se integra ao OS com tray, hotkeys globais, context menus e deep links.

### Por que Tauri 2.x

| Criterio | Tauri | Electron |
|----------|-------|----------|
| Bundle | ~10MB | ~150MB |
| RAM idle | ~30MB | ~150MB |
| Startup | ~200ms | ~1-3s |
| Backend | Rust (seguro) | Node.js |
| OS Integration | Plugins oficiais | Libs terceiros |

---

## 2. Subfases

### Fase 5a: Fundacao Desktop (Semana 16-17)
### Fase 5b: OS Integration (Semana 18-19)
### Fase 5c: Shell & Distribution (Semana 19-20)

---

## 3. Fase 5a: Fundacao Desktop

### 3.1 Tauri Scaffold (Complexidade: Media)

**Estimativa**: 2-3 dias

**Setup**:
```bash
cd packages/desktop
bun create tauri-app --template react-ts
```

**tauri.conf.json** (configuracao principal):
```json
{
  "productName": "Athion Assistent",
  "version": "0.0.1",
  "identifier": "com.athion.assistent",
  "build": {
    "frontendDist": "../src/dist"
  },
  "app": {
    "windows": [{
      "title": "Athion Assistent",
      "width": 900,
      "height": 700,
      "minWidth": 400,
      "minHeight": 500,
      "resizable": true,
      "decorations": true
    }],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  },
  "plugins": {
    "global-shortcut": {},
    "notification": { "enabled": true },
    "clipboard-manager": {},
    "deep-link": { "schemes": ["athion"] },
    "autostart": {},
    "shell": {},
    "fs": { "scope": ["**"] },
    "dialog": {},
    "updater": {
      "endpoints": ["https://releases.athion.dev/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

**Estrutura inicial**:
```
packages/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # Entry point Tauri
│   │   ├── lib.rs            # Module declarations
│   │   └── commands/
│   │       └── mod.rs         # IPC commands
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/
│   ├── App.tsx               # React entry
│   ├── main.tsx              # React root
│   ├── components/
│   ├── hooks/
│   └── styles/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

### 3.2 Desktop Chat UI (Complexidade: Alta)

**Estimativa**: 4-5 dias

**Componentes React** (reutilizar logica da CLI, mas com UI desktop):

| Componente | Responsabilidade | Max Linhas |
|------------|-----------------|------------|
| `App` | Layout principal com router | 100 |
| `ChatView` | Tela de chat com sidebar | 200 |
| `MessageList` | Lista de mensagens com virtual scroll | 150 |
| `MessageBubble` | Mensagem individual com markdown | 100 |
| `CodeBlock` | Bloco de codigo com syntax, copy, apply | 100 |
| `ToolCallCard` | Card de tool call expandivel | 80 |
| `SubAgentCard` | Card de subagente com progresso | 60 |
| `InputArea` | Input com drag&drop, @mentions | 150 |
| `Sidebar` | Lista de sessoes, agentes, config | 100 |
| `SettingsView` | Tela de configuracoes | 150 |

**UI/UX**:
- Tailwind 4 para styling
- Tema claro/escuro seguindo preferencia do OS
- Virtual scrolling para sessoes longas
- Syntax highlighting com Shiki
- Copy code com um clique
- Markdown completo (tabelas, listas, code blocks)

---

### 3.3 IPC Bridge - Tauri Commands (Complexidade: Alta)

**Estimativa**: 3-4 dias

**Comunicacao Rust ↔ React**:

```rust
// src-tauri/src/commands/chat.rs
#[tauri::command]
async fn chat_send(session_id: String, message: String) -> Result<(), String> {
    // Chama core engine via binding
    Ok(())
}

#[tauri::command]
async fn chat_abort(session_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn session_list() -> Result<Vec<Session>, String> {
    Ok(vec![])
}
```

```typescript
// Frontend (React)
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// Enviar mensagem
await invoke('chat_send', { sessionId: 'abc', message: 'Hello' })

// Receber streaming via events
const unlisten = await listen('chat:stream', (event) => {
  const data = event.payload as StreamEvent
  // handle streaming...
})
```

**Desafio principal**: O core engine e TypeScript mas o backend Tauri e Rust. Opcoes:
1. **Sidecar process** — Core roda como processo separado, Tauri se comunica via stdio/HTTP
2. **Node.js embedded** — Tauri spawna processo Bun que roda o core
3. **WASM** — Compilar core para WASM (muito complexo)

**Decisao**: **Sidecar process** — Tauri spawna processo Bun que roda `@athion/core`, comunicacao via IPC (stdio JSON-RPC ou HTTP local).

---

### 3.4 Drag & Drop (Complexidade: Baixa)

**Estimativa**: 1 dia

- Arrastar arquivo para a janela → adiciona como contexto no chat
- Arrastar pasta → lista arquivos e pergunta o que fazer
- Suporte a multiplos arquivos simultaneamente

---

### 3.5 Multi-Window (Complexidade: Media)

**Estimativa**: 2 dias

- Cada janela = uma sessao independente
- `Cmd/Ctrl+N` abre nova janela
- Janelas compartilham o mesmo core engine (sidecar)

---

## 4. Fase 5b: OS Integration

### 4.1 System Tray (Complexidade: Media)

**Estimativa**: 2-3 dias

```rust
// src-tauri/src/tray.rs
use tauri::{SystemTray, SystemTrayMenu, SystemTrayMenuItem, CustomMenuItem};

pub fn create_tray() -> SystemTray {
    let menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("new_chat", "New Chat"))
        .add_item(CustomMenuItem::new("quick_chat", "Quick Chat (Cmd+Shift+A)"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("sessions", "Recent Sessions"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("settings", "Settings"))
        .add_item(CustomMenuItem::new("quit", "Quit Athion"));

    SystemTray::new().with_menu(menu)
}
```

**Status indicator**: Icone muda conforme estado:
- Idle (cinza)
- Processando (azul pulsante)
- Erro (vermelho)
- SubAgent ativo (amarelo)

---

### 4.2 Quick Chat Overlay (Complexidade: Alta)

**Estimativa**: 3-4 dias

**Popup flutuante** ativado por global hotkey (`Cmd/Ctrl+Shift+A`):
- Janela frameless, sempre no topo
- Input de texto com autocomplete
- Resposta inline (sem abrir janela principal)
- `Esc` fecha, `Enter` envia
- Historico do quick chat persistido

**Implementacao**: Janela Tauri separada com `decorations: false`, `always_on_top: true`, `transparent: true`.

---

### 4.3 Global Hotkeys (Complexidade: Media)

**Estimativa**: 2 dias

```rust
// src-tauri/src/hotkeys.rs
use tauri_plugin_global_shortcut::GlobalShortcutExt;

app.global_shortcut().register("CmdOrCtrl+Shift+A", |_app, _shortcut, event| {
    if event.state == ShortcutState::Pressed {
        // Show quick chat
    }
});

app.global_shortcut().register("CmdOrCtrl+Shift+V", |_app, _shortcut, event| {
    if event.state == ShortcutState::Pressed {
        // Send clipboard to chat
    }
});

app.global_shortcut().register("CmdOrCtrl+Shift+E", |_app, _shortcut, event| {
    if event.state == ShortcutState::Pressed {
        // Explain selected text
    }
});
```

---

### 4.4 Native Notifications (Complexidade: Baixa)

**Estimativa**: 1 dia

```rust
use tauri_plugin_notification::NotificationExt;

app.notification()
    .builder()
    .title("SubAgent concluiu")
    .body("code-reviewer finalizou a analise de main.ts")
    .icon("icon")
    .show()
    .unwrap();
```

---

### 4.5 Context Menu OS (Complexidade: Alta)

**Estimativa**: 3-4 dias

**Registrar no OS** para right-click em arquivos/pastas:

**macOS**: `Info.plist` com `CFBundleDocumentTypes` + `NSServices`
**Linux**: `.desktop` file com `MimeType` entries
**Windows**: Registry entries em `HKEY_CLASSES_ROOT\*\shell\Athion`

Opcoes no menu:
- "Abrir com Athion"
- "Revisar com Athion"
- "Explicar com Athion"
- "Abrir projeto no Athion" (para pastas)

---

### 4.6 Clipboard Integration (Complexidade: Media)

**Estimativa**: 2 dias

```rust
use tauri_plugin_clipboard_manager::ClipboardExt;

// Watch mode (opt-in)
app.clipboard().on_text(|text| {
    if looks_like_code(text) {
        // Suggest action via notification
    }
});

// Smart paste
#[tauri::command]
async fn paste_from_clipboard(app: AppHandle) -> Result<String, String> {
    let text = app.clipboard().read_text().map_err(|e| e.to_string())?;
    Ok(text)
}
```

---

### 4.7 Deep Links (Complexidade: Media)

**Estimativa**: 2 dias

```rust
use tauri_plugin_deep_link::DeepLinkExt;

app.deep_link().on_open_url(|event| {
    let url = event.urls().first().unwrap();
    match url.scheme() {
        "athion" => {
            match url.host_str() {
                Some("chat") => { /* open chat with prompt from query */ }
                Some("review") => { /* open review with path from query */ }
                Some("agent") => { /* invoke agent */ }
                _ => {}
            }
        }
        _ => {}
    }
});
```

**URLs suportadas**:
- `athion://chat?prompt=explain%20this%20code`
- `athion://review?path=/Users/dev/project/main.ts`
- `athion://agent?name=code-reviewer&prompt=review%20auth`

---

### 4.8 Window Management (Complexidade: Baixa)

**Estimativa**: 1 dia

- Always on top toggle (`Cmd/Ctrl+T`)
- Mini mode (janela compacta 300x400)
- Suporte a Stage Manager (macOS) e Snap (Windows)

---

## 5. Fase 5c: Shell & Distribution

### 5.1 PATH Registration (Complexidade: Media)

**Estimativa**: 2 dias

Ao instalar o app, registrar CLI `athion` no PATH:
- **macOS**: Symlink em `/usr/local/bin/athion`
- **Linux**: Symlink em `~/.local/bin/athion`
- **Windows**: Adicionar ao PATH via installer

---

### 5.2 File Associations (Complexidade: Baixa)

**Estimativa**: 1 dia

- `.athion` → Abre config no app
- `.skill.md` → Abre editor de skill no app

---

### 5.3 Auto-Start (Complexidade: Baixa)

**Estimativa**: 0.5 dia

```rust
use tauri_plugin_autostart::AutoStartExt;

// Em settings
app.autostart().enable().unwrap();
app.autostart().disable().unwrap();
```

---

### 5.4 Session Restore (Complexidade: Baixa)

**Estimativa**: 0.5 dia

Ao reabrir o app:
- Restaurar ultima sessao ativa
- Restaurar posicao/tamanho da janela
- Restaurar estado do sidebar

---

### 5.5 Project Auto-Detect (Complexidade: Media)

**Estimativa**: 1 dia

Quando abre via terminal (`athion` em um diretorio):
- Detectar `.git` para identificar root do projeto
- Carregar `.athion/config.json` se existir
- Carregar skills do projeto (`.athion/skills/`)

---

### 5.6 Auto-Update (Complexidade: Media)

**Estimativa**: 2 dias

```rust
use tauri_plugin_updater::UpdaterExt;

let update = app.updater().check().await?;
if let Some(update) = update {
    update.download_and_install(|_chunk, _total| {}, || {}).await?;
    app.restart();
}
```

---

### 5.7 Build & Packaging (Complexidade: Alta)

**Estimativa**: 3-4 dias

**Targets**:
| OS | Formato | Comando |
|----|---------|---------|
| macOS | `.dmg` + `.app` | `bun tauri build --target universal-apple-darwin` |
| Linux | `.AppImage` + `.deb` | `bun tauri build --target x86_64-unknown-linux-gnu` |
| Windows | `.msi` + `.exe` | `bun tauri build --target x86_64-pc-windows-msvc` |

**CI/CD para releases**:
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - uses: tauri-apps/tauri-action@v0
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Athion v__VERSION__'
          releaseBody: 'See CHANGELOG.md for details'
```

---

## 6. Estrutura Final

```
packages/desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── chat.rs
│   │   │   ├── session.rs
│   │   │   └── config.rs
│   │   ├── tray.rs
│   │   ├── hotkeys.rs
│   │   ├── deeplinks.rs
│   │   ├── clipboard.rs
│   │   └── contextmenu.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── ChatView.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── InputArea.tsx
│   │   ├── Sidebar.tsx
│   │   ├── QuickChat.tsx
│   │   ├── SettingsView.tsx
│   │   └── ToolCallCard.tsx
│   ├── hooks/
│   │   ├── useChat.ts
│   │   ├── useTauri.ts
│   │   ├── useHotkeys.ts
│   │   └── useDeepLink.ts
│   └── styles/
│       └── globals.css
├── index.html
├── package.json
└── vite.config.ts
```

---

## 7. Checklist de Conclusao

- [ ] App instala e abre nos 3 OS
- [ ] Chat streaming funcional
- [ ] System tray com status indicator
- [ ] Quick chat overlay via global hotkey (< 200ms)
- [ ] Global hotkeys customizaveis nos 3 OS
- [ ] Context menu nativo no Finder/Explorer/Nautilus
- [ ] Deep links `athion://` funcionais
- [ ] Notificacoes nativas
- [ ] Clipboard integration
- [ ] Drag & drop de arquivos
- [ ] Multi-window
- [ ] Auto-start e session restore
- [ ] CLI `athion` no PATH apos instalacao
- [ ] Auto-update funcional
- [ ] Builds .dmg, .AppImage/.deb, .msi

**Proxima fase**: [Fase 6: Polish](../fase-6-polish/fase-6-polish.md)
