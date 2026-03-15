import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Decorator } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { MessageList } from './MessageList'

/** Decorator com CSS mínimo para MessageList */
const MessageListCSS: Decorator = (Story) => (
  <>
    <style>{`
      .message-list {
        max-height: 500px;
        overflow-y: auto;
        padding: 8px;
      }
      .message-list.empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 300px;
      }
      .empty-state { text-align: center; opacity: 0.7; }
      .empty-state .hint { font-size: 12px; opacity: 0.6; margin-top: 4px; }
      .message { margin-bottom: 12px; }
      .message.user .message-role { color: var(--vscode-testing-iconPassed, #4ec9b0); }
      .message.assistant .message-role { color: var(--vscode-focusBorder, #007acc); }
      .message-role { font-size: 11px; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; }
      .message-content { line-height: 1.5; }
      .code-block { margin: 8px 0; border-radius: 4px; overflow: hidden; }
      .code-block-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 4px 8px; background: rgba(255,255,255,0.05); font-size: 11px;
      }
      .code-block-content { margin: 0; padding: 8px; background: rgba(0,0,0,0.2); overflow-x: auto; font-size: 12px; }
      .copy-button {
        background: transparent; color: inherit; border: 1px solid rgba(255,255,255,0.2);
        padding: 2px 8px; border-radius: 2px; cursor: pointer; font-size: 11px;
      }
      .tool-call-card { margin: 8px 0; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); }
      .tool-call-card.running { border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700); }
      .tool-call-card.success { border-left: 3px solid var(--vscode-testing-iconPassed, #4ec9b0); }
      .tool-call-card.error { border-left: 3px solid var(--vscode-testing-iconFailed, #f14c4c); }
      .tool-call-header { display: flex; gap: 6px; align-items: center; font-size: 12px; }
      .tool-call-result pre { margin: 4px 0 0; font-size: 11px; opacity: 0.8; white-space: pre-wrap; }
      .streaming-indicator { display: flex; gap: 8px; align-items: center; padding: 8px; opacity: 0.7; }
      .cursor { animation: blink 1s step-end infinite; }
      @keyframes blink { 50% { opacity: 0; } }
      .feedback-phrase { font-size: 12px; font-style: italic; }
    `}</style>
    <Story />
  </>
)

const meta = {
  title: 'VSCode/Chat/MessageList',
  component: MessageList,
  decorators: [MessageListCSS, VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MessageList>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    messages: [],
    isStreaming: false,
  },
}

export const WithMessages: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'Como faço para criar um servidor HTTP em Node.js?' },
      {
        id: '2',
        role: 'assistant',
        content:
          'Aqui está um exemplo simples:\n\n```typescript\nimport { createServer } from "node:http"\n\nconst server = createServer((req, res) => {\n  res.writeHead(200, { "Content-Type": "text/plain" })\n  res.end("Hello World")\n})\n\nserver.listen(3000)\n```\n\nIsso cria um servidor na porta 3000.',
      },
    ],
  },
}

export const WithToolCalls: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'Leia o arquivo package.json' },
      {
        id: '2',
        role: 'assistant',
        content: 'Vou ler o arquivo para você.',
        toolCalls: [
          {
            id: 'tc-1',
            name: 'read_file',
            args: { path: 'package.json' },
            status: 'success',
            result: '{"name":"athion","version":"1.0.0"}',
          },
        ],
      },
    ],
  },
}

export const Streaming: Story = {
  args: {
    isStreaming: true,
    messages: [
      { id: '1', role: 'user', content: 'Explique o conceito de closures em JavaScript' },
      {
        id: '2',
        role: 'assistant',
        content:
          'Closures são funções que "lembram" do escopo em que foram criadas. Quando uma função é definida dentro de outra',
      },
    ],
  },
}

export const LongConversation: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'O que é TypeScript?' },
      {
        id: '2',
        role: 'assistant',
        content: 'TypeScript é um superset tipado do JavaScript que compila para JavaScript puro.',
      },
      { id: '3', role: 'user', content: 'Quais são as vantagens?' },
      {
        id: '4',
        role: 'assistant',
        content:
          'As principais vantagens são:\n\n1. **Tipagem estática** — detecta erros em tempo de compilação\n2. **Autocompletar** — melhor DX com IntelliSense\n3. **Refatoração segura** — tipos garantem consistência\n4. **Documentação viva** — tipos servem como documentação',
      },
      { id: '5', role: 'user', content: 'Mostre um exemplo de generics' },
      {
        id: '6',
        role: 'assistant',
        content:
          'Claro! Aqui está um exemplo:\n\n```typescript\nfunction identity<T>(arg: T): T {\n  return arg\n}\n\nconst num = identity(42)      // number\nconst str = identity("hello")  // string\n```',
      },
    ],
  },
}
