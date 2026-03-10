# @athion/cli

Interface de linha de comando do Athion Assistent. Oferece um chat interativo estilo Claude Code com TUI via [Ink](https://github.com/vadimdemedes/ink) (React no terminal), além de comandos utilitários para gerenciar sessões, indexar codebases e iniciar o servidor JSON-RPC.

## Instalação

```bash
bun install -g @athion/cli
# ou, a partir do workspace:
bun link packages/cli
```

## Comandos

| Comando                          | Descrição                                      |
| -------------------------------- | ---------------------------------------------- |
| `athion chat`                    | Inicia chat interativo com TUI (Ink)           |
| `athion chat --session <id>`     | Retoma sessão existente pelo ID                |
| `athion ask "pergunta"`          | Pergunta avulsa sem TUI — ideal para scripts   |
| `athion codebase index [path]`   | Indexa o workspace (padrão: diretório atual)   |
| `athion codebase search <query>` | Busca semântica no índice do codebase          |
| `athion codebase status`         | Exibe estatísticas do índice atual             |
| `athion codebase clear`          | Limpa o índice do codebase                     |
| `athion sessions`                | Lista todas as sessões armazenadas             |
| `athion serve`                   | Inicia servidor JSON-RPC via stdio (para IDEs) |

## Flags Globais

| Flag                  | Padrão                     | Descrição                                      |
| --------------------- | -------------------------- | ---------------------------------------------- |
| `--provider <id>`     | `vllm-mlx`                 | Provider do LLM                                |
| `--model <id>`        | `qwen3-coder-reap-40b-a3b` | Modelo a usar                                  |
| `--log-level <level>` | `warn`                     | Nível de log: `debug`, `info`, `warn`, `error` |
| `--db <path>`         | `~/.athion/data.db`        | Caminho do banco de dados                      |

## Chat TUI — Atalhos de Teclado

| Tecla         | Ação                                      |
| ------------- | ----------------------------------------- |
| `Enter`       | Envia mensagem                            |
| `Shift+Enter` | Nova linha (sem enviar)                   |
| `Ctrl+C`      | Encerra o chat                            |
| `y`           | Permissão: allow once (permite uma vez)   |
| `s`           | Permissão: allow session (sessão inteira) |
| `r`           | Permissão: remember (persiste no banco)   |
| `n`           | Permissão: deny (nega a tool call)        |

Quando o modelo solicita execução de uma tool que requer permissão (ex: `write_file`, `run_command`), o TUI pausa e exibe o prompt de permissão com as 4 opções acima.

## Variáveis de Ambiente

| Variável                 | Descrição                                        |
| ------------------------ | ------------------------------------------------ |
| `ATHION_PROVIDER`        | Provider padrão (sobrescreve config)             |
| `ATHION_MODEL`           | Modelo padrão (sobrescreve config)               |
| `ATHION_EMBEDDING_URL`   | URL base para embeddings OpenAI-compatible       |
| `ATHION_EMBEDDING_MODEL` | Modelo de embedding (padrão: `nomic-embed-text`) |
| `ATHION_DB_PATH`         | Caminho customizado do banco SQLite              |

## Exemplos

```bash
# Chat com modelo local
athion chat --provider vllm-mlx

# Pergunta avulsa em script
athion ask "Qual é a diferença entre map e flatMap em TypeScript?"

# Indexar workspace com embeddings semânticos
ATHION_EMBEDDING_URL=http://localhost:1234 athion codebase index .

# Busca semântica no codebase indexado
athion codebase search "função de autenticação JWT"

# Servidor JSON-RPC para integração com IDEs
athion serve
```

## Arquitetura Interna

O CLI usa `yargs` para parsing de comandos e `Ink` para renderização do TUI. Cada comando invoca `bootstrap()` do `@athion/core` com as opções resolvidas. O comando `serve` expõe o core via JSON-RPC sobre stdio, permitindo que extensões de IDE se conectem sem spawnar um HTTP server separado.
