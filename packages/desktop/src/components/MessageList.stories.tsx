import type { Meta, StoryObj } from '@storybook/react-vite'
import { MessageList } from './MessageList'

const meta: Meta<typeof MessageList> = {
  title: 'Desktop/MessageList',
  component: MessageList,
  decorators: [
    (Story) => (
      <div style={{ height: 500, display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof MessageList>

export const WithMessages: Story = {
  args: {
    isStreaming: false,
    messages: [
      { id: '1', role: 'user', content: 'Olá, como funciona o useEffect?' },
      {
        id: '2',
        role: 'assistant',
        content:
          'O `useEffect` é um hook do React que permite executar efeitos colaterais em componentes funcionais.\n\n```typescript\nuseEffect(() => {\n  document.title = `Contagem: ${count}`\n}, [count])\n```\n\nEle aceita uma função de efeito e um array de dependências.',
        toolCalls: [
          {
            id: 'tc-1',
            name: 'search_docs',
            args: { query: 'useEffect' },
            status: 'success',
            result: 'Found 12 results',
          },
        ],
      },
      { id: '3', role: 'user', content: 'E o useCallback?' },
    ],
  },
}

export const Empty: Story = {
  args: {
    isStreaming: false,
    messages: [],
  },
}

export const Streaming: Story = {
  args: {
    isStreaming: true,
    messages: [
      { id: '1', role: 'user', content: 'Analise este código' },
      { id: '2', role: 'assistant', content: 'Analisando o código...' },
    ],
  },
}
