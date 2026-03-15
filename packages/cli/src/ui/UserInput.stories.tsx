/**
 * UserInput Stories
 * Representação visual HTML do componente Ink UserInput para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function UserInputPreview({
  isDisabled,
  placeholder,
  suggestions,
}: {
  isDisabled: boolean
  placeholder?: string
  suggestions?: string[]
}) {
  return (
    <div>
      {suggestions && suggestions.length > 0 && (
        <div
          style={{
            border: '1px solid #565f89',
            borderRadius: 4,
            padding: 8,
            marginBottom: 4,
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s}
              style={{
                padding: '2px 4px',
                color: i === 0 ? '#c0caf5' : '#565f89',
                backgroundColor: i === 0 ? '#24283b' : 'transparent',
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: isDisabled ? 0.4 : 1,
        }}
      >
        <span style={{ color: '#7aa2f7' }}>❯</span>
        <span style={{ color: '#565f89' }}>{placeholder ?? 'Digite sua mensagem...'}</span>
        <span style={{ color: '#7aa2f7', animation: 'blink 1s step-end infinite' }}>▌</span>
        <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
      </div>
    </div>
  )
}

const meta = {
  title: 'CLI/Chat/UserInput',
  component: UserInputPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof UserInputPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { isDisabled: false },
}

export const Disabled: Story = {
  args: { isDisabled: true, placeholder: 'Aguardando conexão...' },
}

export const WithSlashCommands: Story = {
  args: {
    isDisabled: false,
    suggestions: ['/clear', '/help', '/skills', '/model', '/codebase'],
  },
}

export const WithFileSuggestions: Story = {
  args: {
    isDisabled: false,
    suggestions: ['@src/index.ts', '@src/server.ts', '@package.json'],
  },
}
