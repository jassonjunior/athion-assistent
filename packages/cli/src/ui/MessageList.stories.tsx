/**
 * MessageList Stories
 * Representação visual HTML do componente Ink MessageList para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

interface MessagePreviewData {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCall?: { name: string; status: string }
}

function MessageListPreview({
  messages,
  isStreaming,
}: {
  messages: MessagePreviewData[]
  isStreaming: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {messages.map((msg) => (
        <div key={msg.id}>
          <div style={{ fontSize: 11, marginBottom: 2 }}>
            {msg.role === 'user' ? (
              <span style={{ color: '#9ece6a' }}>◆ Você</span>
            ) : (
              <span style={{ color: '#7aa2f7' }}>◇ Athion</span>
            )}
          </div>
          <div style={{ paddingLeft: 8, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          {msg.toolCall && (
            <div style={{ paddingLeft: 8, marginTop: 4 }}>
              <span style={{ color: msg.toolCall.status === 'success' ? '#9ece6a' : '#e0af68' }}>
                {msg.toolCall.status === 'success' ? '✓' : '◌'}
              </span>{' '}
              <span style={{ color: '#7aa2f7' }}>{msg.toolCall.name}</span>
            </div>
          )}
        </div>
      ))}
      {isStreaming && (
        <div style={{ color: '#565f89', fontStyle: 'italic' }}>
          <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span> Gerando resposta...
          <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
        </div>
      )}
    </div>
  )
}

const meta = {
  title: 'CLI/Chat/MessageList',
  component: MessageListPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MessageListPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: { messages: [], isStreaming: false },
}

export const SingleExchange: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'O que é TypeScript?' },
      {
        id: '2',
        role: 'assistant',
        content: 'TypeScript é um superset tipado do JavaScript que compila para JavaScript puro.',
      },
    ],
  },
}

export const WithToolCall: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'Leia o package.json' },
      {
        id: '2',
        role: 'assistant',
        content: 'O arquivo package.json contém as dependências do projeto.',
        toolCall: { name: 'read_file', status: 'success' },
      },
    ],
  },
}

export const Streaming: Story = {
  args: {
    isStreaming: true,
    messages: [
      { id: '1', role: 'user', content: 'Explique closures em JavaScript' },
      { id: '2', role: 'assistant', content: 'Closures são funções que...' },
    ],
  },
}

export const LongConversation: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'Como criar um servidor HTTP?' },
      { id: '2', role: 'assistant', content: 'Use o módulo nativo http do Node.js.' },
      { id: '3', role: 'user', content: 'Mostre um exemplo' },
      {
        id: '4',
        role: 'assistant',
        content:
          'import { createServer } from "node:http"\n\nconst server = createServer((req, res) => {\n  res.end("Hello")\n})\n\nserver.listen(3000)',
      },
    ],
  },
}
