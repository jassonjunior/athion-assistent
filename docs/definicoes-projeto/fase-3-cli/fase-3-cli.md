# Fase 3: CLI Terminal

**Semanas**: 9-11
**Objetivo**: Interface terminal interativa com chat, subagentes e ferramentas.
**Pre-requisitos**: Fase 2 concluida (Orchestrator + SubAgents funcionais)
**Entregavel**: CLI funcional publicavel como `athion` no terminal.

---

## 1. Visao Geral

A CLI e a primeira interface de usuario do Athion. Usa **yargs** para parsing de comandos e **Ink 6 (React)** para renderizacao no terminal.

### Comandos Principais

```bash
athion                    # Inicia chat interativo (default)
athion chat               # Chat interativo
athion chat --resume      # Retomar ultima sessao
athion chat -m "prompt"   # One-shot (nao interativo)
athion config             # Gerenciar configuracao
athion config set model qwen2.5-coder:7b
athion agents             # Listar agentes disponiveis
athion agents create      # Criar agente customizado
athion skills             # Listar skills
athion sessions           # Listar sessoes
athion sessions delete <id>
athion serve              # Iniciar servidor HTTP (para IDE/Desktop)
athion --version
athion --help
```

---

## 2. Tasks Detalhadas

### 2.1 CLI Entry - yargs (Complexidade: Media)

**Path**: `packages/cli/src/`
**Estimativa**: 2-3 dias

**Dependencias**:
```bash
bun add yargs ink ink-text-input ink-spinner ink-select-input react
bun add -d @types/yargs
```

**Estrutura de comandos**:
```typescript
// packages/cli/src/index.ts
#!/usr/bin/env bun
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

yargs(hideBin(process.argv))
  .scriptName('athion')
  .command('chat', 'Chat interativo com o assistente', chatCommand)
  .command('config', 'Gerenciar configuracao', configCommand)
  .command('agents', 'Gerenciar agentes', agentsCommand)
  .command('skills', 'Listar skills disponiveis', skillsCommand)
  .command('sessions', 'Gerenciar sessoes', sessionsCommand)
  .command('serve', 'Iniciar servidor HTTP', serveCommand)
  .default('chat')  // athion sem subcomando = chat
  .version()
  .help()
  .parse()
```

**Arquivos**:
```
packages/cli/src/
├── index.ts              # Entry point (yargs setup, < 50 linhas)
├── commands/
│   ├── chat.ts           # Chat command + options (< 80 linhas)
│   ├── config.ts         # Config CRUD (< 60 linhas)
│   ├── agents.ts         # Agents list/create (< 60 linhas)
│   ├── skills.ts         # Skills list (< 40 linhas)
│   ├── sessions.ts       # Sessions list/delete (< 60 linhas)
│   └── serve.ts          # HTTP server (< 40 linhas)
```

---

### 2.2 TUI Chat - Ink/React (Complexidade: Alta)

**Path**: `packages/cli/src/ui/`
**Estimativa**: 5-6 dias

**Componentes React (Ink)**:

| Componente | Responsabilidade | Max Linhas |
|------------|-----------------|------------|
| `ChatApp` | Layout principal, state global | 200 |
| `MessageList` | Renderiza historico de mensagens | 150 |
| `UserInput` | Input de texto com multiline, @mentions | 150 |
| `StreamingMessage` | Renderiza resposta em streaming | 100 |
| `ToolCallDisplay` | Mostra tool calls em execucao | 100 |
| `SubAgentDisplay` | Mostra progresso de subagente | 80 |
| `PermissionPrompt` | Pede permissao para tool | 60 |
| `StatusBar` | Modelo ativo, tokens, sessao | 60 |
| `Markdown` | Renderiza markdown no terminal | 100 |

**Layout do chat**:
```
┌─────────────────────────────────────┐
│ Athion Assistent v0.1.0             │
│ Model: qwen2.5-coder:7b (ollama)   │
├─────────────────────────────────────┤
│                                     │
│ > User: Revise o arquivo main.ts    │
│                                     │
│ Assistant: Vou analisar...          │
│                                     │
│ 🔧 read_file("src/main.ts")        │
│ ✅ 45 linhas lidas                  │
│                                     │
│ 🤖 SubAgent: code-reviewer          │
│    Analisando qualidade...           │
│    ✅ Concluido                      │
│                                     │
│ Encontrei 3 problemas:             │
│ 1. ...                              │
│                                     │
├─────────────────────────────────────┤
│ > Digite sua mensagem...       │ ^C │
│ Tokens: 1.2K/8K | Session: abc123  │
└─────────────────────────────────────┘
```

**Arquivos**:
```
packages/cli/src/ui/
├── ChatApp.tsx            # App principal (< 200 linhas)
├── MessageList.tsx        # Lista de mensagens (< 150 linhas)
├── UserInput.tsx          # Input do usuario (< 150 linhas)
├── StreamingMessage.tsx   # Mensagem em streaming (< 100 linhas)
├── ToolCallDisplay.tsx    # Display de tool calls (< 100 linhas)
├── SubAgentDisplay.tsx    # Display de subagentes (< 80 linhas)
├── PermissionPrompt.tsx   # Prompt de permissao (< 60 linhas)
├── StatusBar.tsx          # Barra de status (< 60 linhas)
└── Markdown.tsx           # Markdown renderer (< 100 linhas)
```

---

### 2.3 Hooks Customizados (Complexidade: Media)

**Path**: `packages/cli/src/hooks/`
**Estimativa**: 2-3 dias

| Hook | Responsabilidade | Max Linhas |
|------|-----------------|------------|
| `useChat` | Gerencia estado do chat + streaming | 150 |
| `useSession` | CRUD de sessoes | 80 |
| `usePermission` | Gerencia prompts de permissao | 60 |
| `useTheme` | Tema ativo + cores | 40 |
| `useKeyboard` | Atalhos de teclado | 60 |

**useChat** (o mais complexo):
```typescript
export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentTool, setCurrentTool] = useState<string | null>(null)

  async function sendMessage(content: string) {
    setIsStreaming(true)
    const orchestrator = getOrchestrator()

    for await (const event of orchestrator.chat(sessionId, { content })) {
      switch (event.type) {
        case 'content':
          // Append to current message
          break
        case 'tool_call':
          setCurrentTool(event.name)
          break
        case 'tool_result':
          setCurrentTool(null)
          break
        case 'finish':
          setIsStreaming(false)
          break
      }
    }
  }

  return { messages, isStreaming, currentTool, sendMessage }
}
```

---

### 2.4 Service Container / DI (Complexidade: Media)

**Path**: `packages/cli/src/services/`
**Estimativa**: 1-2 dias

Container simples para injecao de dependencias no CLI:

```typescript
export interface ServiceContainer {
  config: ConfigManager
  orchestrator: Orchestrator
  storage: DatabaseManager
  auth: AuthService
}

export function createServices(cliArgs: CliArgs): ServiceContainer {
  const config = createConfigManager(cliArgs)
  const bus = createBus()
  const storage = createDatabase(config)
  const providerLayer = createProviderLayer(config)
  const toolRegistry = createToolRegistry()
  const permissionSystem = createPermissionSystem(storage)
  const skillManager = createSkillManager(config)
  const tokenManager = createTokenManager(config)
  const subAgentManager = createSubAgentManager(...)
  const orchestrator = createOrchestrator(...)

  return { config, orchestrator, storage }
}
```

---

### 2.5 Auth Flow (Complexidade: Media)

**Estimativa**: 2-3 dias

**Metodos de autenticacao**:
1. **API Key** — `athion config set openai_api_key sk-...`
2. **Environment** — `OPENAI_API_KEY=sk-...`
3. **Ollama** — Sem auth (local)

**Fluxo no primeiro uso**:
```
Bem-vindo ao Athion Assistent!

Selecione seu provedor LLM:
> Ollama (local, sem API key)
  OpenAI (requer API key)
  Anthropic (requer API key)
  Google AI (requer API key)

[Se escolher provider com key]
Cole sua API key: sk-*****
✅ Conectado! Modelo: gpt-4o-mini
```

---

### 2.6 Session History (Complexidade: Baixa)

**Estimativa**: 1 dia

```bash
athion sessions
# ID          | Titulo                | Criado em    | Mensagens
# abc123      | Review main.ts        | 2 horas atras| 12
# def456      | Fix bug #42           | ontem        | 8

athion chat --resume          # Retoma ultima sessao
athion chat --session abc123  # Retoma sessao especifica
athion sessions delete abc123
```

---

### 2.7 Themes (Complexidade: Baixa)

**Estimativa**: 1 dia

**5 temas iniciais**:
| Tema | Descricao |
|------|-----------|
| `default` | Cores padrao do terminal |
| `dark` | Otimizado para terminal escuro |
| `light` | Otimizado para terminal claro |
| `minimal` | Sem cores, apenas texto |
| `dracula` | Tema Dracula |

Cada tema define: primary, secondary, accent, error, success, warning, muted.

---

## 3. Anti-Patterns a Evitar

Lembrete critico baseado na analise dos 3 projetos:

| Anti-Pattern | Projeto | Limite no Athion |
|-------------|---------|-----------------|
| AppContainer 1.665 linhas | Qwen Code | ChatApp < 200 linhas |
| useGeminiStream 1.459 linhas | Qwen Code | useChat < 150 linhas |
| 21 contextos dispersos | Qwen Code | Max 5-7 contextos |
| Sem separacao de concerns | Todos | 1 componente = 1 responsabilidade |

---

## 4. Checklist de Conclusao

- [ ] `athion` abre chat interativo
- [ ] Chat streaming funcional com markdown
- [ ] Tool calls visiveis com status
- [ ] SubAgents com progresso visual
- [ ] Permission prompts funcionais
- [ ] Session resume funciona
- [ ] `athion config` CRUD funcional
- [ ] `athion agents` lista agentes
- [ ] 5 temas disponiveis
- [ ] Zero componentes > 200 linhas
- [ ] Zero hooks > 150 linhas

**Proxima fase**: [Fase 4: IDE Extension](../fase-4-ide-extension/fase-4-ide-extension.md)
