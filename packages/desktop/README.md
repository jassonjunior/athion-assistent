# @athion/desktop

Aplicação desktop do Athion Assistent, construída com **Tauri 2.x**, **React 19** e **Tailwind CSS 4**. Oferece uma interface nativa multiplataforma (macOS, Linux, Windows) com suporte a system tray, hotkey global e deep links.

## Requisitos

| Dependência | Versão mínima | Observação                                      |
| ----------- | ------------- | ----------------------------------------------- |
| Rust        | stable        | `rustup update stable`                          |
| Bun         | >= 1.0        | Gerenciador de pacotes e runtime JS             |
| Xcode CLI   | >= 15         | Apenas macOS — para compilar código Swift/Obj-C |
| Tauri CLI   | >= 2.0        | Instalado via `bun add -D @tauri-apps/cli`      |

## Rodando em Desenvolvimento

```bash
# A partir da raiz do monorepo:
cd packages/desktop

# Instala dependências e inicia o dev server Vite + Tauri
bun run tauri:dev
# ou equivalentemente:
cargo tauri dev
```

O Tauri abre a janela nativa com hot-reload do React. O sidecar `athion serve` é iniciado automaticamente pelo plugin `shell`.

## Build para Produção

```bash
cd packages/desktop
bun run tauri:build
# ou:
cargo tauri build
```

Os bundles gerados ficam em `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg` e `.app`
- **Linux**: `.deb` e `.AppImage`
- **Windows**: `.msi` e `.exe`

## Features

### System Tray

O app reside na system tray quando a janela é fechada. O ícone exibe um menu com atalhos para abrir o chat, criar nova sessão e encerrar o app.

### Hotkey Global — Quick Chat

`Cmd+Shift+A` (macOS) / `Ctrl+Shift+A` (Windows/Linux) abre uma janela flutuante de quick chat independente da janela principal, mesmo quando o Athion está minimizado ou em segundo plano.

### Temas

Suporte completo a **dark mode** e **light mode**, seguindo a preferência do sistema operacional. O tema pode ser forçado via configurações.

## Deep Links `athion://`

O scheme `athion://` está registrado no sistema operacional após a primeira instalação:

| URL                                 | Ação                                                |
| ----------------------------------- | --------------------------------------------------- |
| `athion://chat?message=<texto>`     | Abre o chat com o `<texto>` pré-preenchido no input |
| `athion://new`                      | Cria uma nova sessão de chat vazia                  |
| `athion://config?key=<k>&value=<v>` | Define a configuração `<k>` com o valor `<v>`       |

Exemplos de uso:

```bash
# Pré-preencher o chat a partir do terminal
open "athion://chat?message=Explica%20esse%20código"

# Configurar provider via deep link
open "athion://config?key=provider&value=anthropic"
```

## Layout da Interface

```
┌─────────────────────────────────────────────┐
│  [Sidebar]      [Área de Chat]               │
│                                              │
│  Sessões         Histórico de mensagens      │
│  - Sessão 1      com streaming em tempo      │
│  - Sessão 2      real e suporte a Markdown.  │
│  - Nova...                                   │
│  ─────────                                   │
│  Configurações   [Status Bar: provider/model]│
└─────────────────────────────────────────────┘
```

- **Sidebar esquerda**: lista de sessões com busca, criação e exclusão.
- **Área de chat**: mensagens com renderização Markdown, syntax highlighting e botão de cópia.
- **Status bar**: exibe provider e modelo ativos, uso de tokens e status do indexador.

## Comunicação com o Core

O desktop spawna `athion serve` (sidecar Bun) via `@tauri-apps/plugin-shell` e se comunica via JSON-RPC stdio, idêntico à extensão VS Code.
