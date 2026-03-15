/**
 * StreamingMessage Stories
 * Representação visual HTML do componente Ink StreamingMessage para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function StreamingPreview({ content }: { content: string }) {
  if (!content) {
    return <span style={{ color: '#565f89', fontStyle: 'italic' }}>Pensando...</span>
  }

  return (
    <div>
      <span>{content}</span>
      <span style={{ color: '#7aa2f7', animation: 'blink 1s step-end infinite' }}>▌</span>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}

const meta = {
  title: 'CLI/Feedback/StreamingMessage',
  component: StreamingPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StreamingPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Thinking: Story = {
  args: { content: '' },
}

export const Partial: Story = {
  args: {
    content: 'Para criar um servidor HTTP em Node.js, você pode usar o módulo nativo `http`.',
  },
}

export const WithCodeBlock: Story = {
  args: {
    content:
      'Aqui está um exemplo:\n\n```typescript\nimport { createServer } from "node:http"\n\nconst server = createServer((req, res) => {\n  res.end("Hello")\n})',
  },
}
