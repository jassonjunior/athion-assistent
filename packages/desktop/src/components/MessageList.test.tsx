import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ChatMessage } from '../hooks/useChat.js'

vi.mock('@athion/shared', () => ({
  parseCodeBlocks: (content: string) => [{ type: 'text', content }],
  useFeedbackPhrase: () => null,
  useCodeCopy: () => ({ copied: false, handleCopy: vi.fn() }),
}))

vi.mock('./CodeBlock.js', () => ({
  CodeBlock: ({ language, code }: { language: string; code: string }) => (
    <pre data-testid="code-block" data-language={language}>
      {code}
    </pre>
  ),
}))

vi.mock('./ToolCallCard.js', () => ({
  ToolCallCard: ({ toolCall }: { toolCall: { name: string } }) => (
    <div data-testid="tool-call-card">{toolCall.name}</div>
  ),
}))

vi.mock('../hooks/useFeedbackPhrase.js', () => ({
  useFeedbackPhrase: () => null,
}))

import { MessageList } from './MessageList.js'

describe('MessageList', () => {
  it('deve mostrar mensagem de boas-vindas quando não há mensagens', () => {
    render(<MessageList messages={[]} isStreaming={false} />)
    expect(screen.getByText('Como posso ajudar?')).toBeDefined()
    expect(screen.getByText(/Digite sua mensagem/)).toBeDefined()
  })

  it('deve renderizar mensagem do usuário', () => {
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'user', content: 'Olá mundo' }]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.getByText('Olá mundo')).toBeDefined()
    expect(screen.getByText('Você')).toBeDefined()
  })

  it('deve renderizar mensagem do assistente', () => {
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'assistant', content: 'Olá! Como posso ajudar?' },
    ]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.getByText('Olá! Como posso ajudar?')).toBeDefined()
    expect(screen.getByText('Athion')).toBeDefined()
  })

  it('deve renderizar múltiplas mensagens', () => {
    const messages: ChatMessage[] = [
      { id: 'msg-1', role: 'user', content: 'Pergunta' },
      { id: 'msg-2', role: 'assistant', content: 'Resposta' },
    ]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.getByText('Pergunta')).toBeDefined()
    expect(screen.getByText('Resposta')).toBeDefined()
  })

  it('deve mostrar indicador de streaming quando está gerando', () => {
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'user', content: 'Olá' }]

    render(<MessageList messages={messages} isStreaming={true} />)
    expect(screen.getByText('▌')).toBeDefined()
  })

  it('não deve mostrar indicador de streaming quando não está gerando', () => {
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'user', content: 'Olá' }]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.queryByText('▌')).toBeNull()
  })

  it('deve renderizar tool calls quando presentes', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Vou ler o arquivo',
        toolCalls: [
          { id: 'tc-1', name: 'readFile', args: {}, status: 'success', result: 'content' },
        ],
      },
    ]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.getByTestId('tool-call-card')).toBeDefined()
    expect(screen.getByText('readFile')).toBeDefined()
  })

  it('deve renderizar múltiplas tool calls', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Processando',
        toolCalls: [
          { id: 'tc-1', name: 'readFile', args: {}, status: 'success' },
          { id: 'tc-2', name: 'editFile', args: {}, status: 'running' },
        ],
      },
    ]

    render(<MessageList messages={messages} isStreaming={false} />)
    const cards = screen.getAllByTestId('tool-call-card')
    expect(cards).toHaveLength(2)
  })

  it('não deve renderizar tool calls quando não há', () => {
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: 'Sem tools' }]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.queryByTestId('tool-call-card')).toBeNull()
  })

  it('deve lidar com conteúdo vazio', () => {
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: '' }]

    render(<MessageList messages={messages} isStreaming={false} />)
    expect(screen.getByText('Athion')).toBeDefined()
  })
})
