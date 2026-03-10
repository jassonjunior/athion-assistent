# @athion/vscode

Extensão para VS Code e Cursor que integra o Athion Assistent diretamente no editor. A extensão spawna o `@athion/cli` como sidecar (processo filho JSON-RPC stdio) e se comunica com ele via `postMessage` do webview.

## Instalação

**Via VSIX (desenvolvimento local):**

```bash
cd packages/vscode
bun run build
code --install-extension dist/athion-vscode-*.vsix
```

**Via Marketplace:**

Pesquise por "Athion Assistent" no painel de extensões do VS Code ou Cursor.

## Comandos (Command Palette)

Acesse via `Cmd+Shift+P` (macOS) ou `Ctrl+Shift+P` (Windows/Linux):

| Comando                          | Descrição                                           |
| -------------------------------- | --------------------------------------------------- |
| `Athion: New Chat`               | Abre o painel lateral com uma nova sessão de chat   |
| `Athion: Index Codebase`         | Indexa o workspace atual para busca semântica       |
| `Athion: Search Codebase`        | Abre input box para busca semântica no codebase     |
| `Athion: Send Selection to Chat` | Envia o trecho selecionado para o chat com contexto |

## Chat Sidebar

O painel lateral é um webview React que se comunica com a extensão via `postMessage`. Funcionalidades principais:

- **Streaming**: respostas em tempo real com indicador de digitação.
- **Histórico de sessão**: mensagens persistidas no banco local.
- **Markdown**: renderização completa com syntax highlighting de código.
- **Permissões inline**: prompt de permissão exibido dentro do próprio chat quando o modelo solicita uma tool que requer aprovação.

## @mentions — Arquivos e Símbolos

Dentro do input do chat, digite `@` para ativar o seletor de contexto:

- **`@arquivo.ts`** — inclui o conteúdo do arquivo no contexto da mensagem.
- **`@NomeDaClasse`** ou **`@nomeDaFuncao`** — inclui o símbolo e seu contexto de código.

O seletor filtra resultados em tempo real usando o índice do codebase (FTS5) e a API de símbolos do VS Code.

## Slash Commands no Chat

| Comando             | Ação                                                |
| ------------------- | --------------------------------------------------- |
| `/codebase index`   | Indexa o workspace (equivalente ao comando palette) |
| `/codebase <query>` | Executa busca semântica e exibe resultados no chat  |

## Configuração (`settings.json`)

```json
{
  "athion.provider": "vllm-mlx",
  "athion.model": "qwen3-coder-reap-40b-a3b",
  "athion.contextWindow": 50000,
  "athion.logLevel": "warn",
  "athion.embeddingUrl": "http://localhost:1234"
}
```

| Chave                  | Padrão                     | Descrição                                       |
| ---------------------- | -------------------------- | ----------------------------------------------- |
| `athion.provider`      | `vllm-mlx`                 | Provider do LLM                                 |
| `athion.model`         | `qwen3-coder-reap-40b-a3b` | Modelo a usar                                   |
| `athion.contextWindow` | `50000`                    | Tamanho máximo da janela de contexto            |
| `athion.logLevel`      | `warn`                     | Nível de log do sidecar                         |
| `athion.embeddingUrl`  | `""`                       | URL para embeddings (deixe vazio para FTS-only) |

## Requisitos

- **VS Code** >= 1.85 ou **Cursor** >= 0.40
- **Bun** >= 1.0 instalado e no `PATH`
- Modelo LLM configurado e acessível (local ou remoto)

## Arquitetura

```
VS Code Extension Host
  └── ChatViewProvider (WebviewPanel)
        ├── postMessage ↔ webview/app (React)
        └── BunBridge → spawn "athion serve" → JSON-RPC stdio → @athion/core
```

O `BunBridge` mantém o processo `athion serve` vivo durante toda a sessão do VS Code, reconectando automaticamente em caso de crash do sidecar.
