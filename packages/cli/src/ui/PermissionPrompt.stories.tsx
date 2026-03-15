/**
 * PermissionPrompt Stories
 * Representação visual HTML do componente Ink PermissionPrompt para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function PermissionPreview({ toolName, target }: { toolName: string; target: string }) {
  return (
    <div
      style={{
        border: '1px solid #565f89',
        borderRadius: 4,
        padding: 12,
        maxWidth: 500,
      }}
    >
      <div style={{ color: '#e0af68', fontWeight: 'bold', marginBottom: 8 }}>
        ⚠ Permissão necessária
      </div>
      <div>
        <span style={{ color: '#7aa2f7' }}>{toolName}</span>
        <span style={{ color: '#565f89' }}> → </span>
        <span>{target}</span>
      </div>
      <div style={{ marginTop: 12, color: '#565f89', fontSize: 12 }}>
        <div>
          <span style={{ color: '#9ece6a' }}>y</span> permitir uma vez ·{' '}
          <span style={{ color: '#9ece6a' }}>s</span> permitir na sessão
        </div>
        <div>
          <span style={{ color: '#9ece6a' }}>r</span> lembrar sempre ·{' '}
          <span style={{ color: '#f7768e' }}>n</span> negar ·{' '}
          <span style={{ color: '#565f89' }}>Esc</span> cancelar
        </div>
      </div>
    </div>
  )
}

const meta = {
  title: 'CLI/Interactive/PermissionPrompt',
  component: PermissionPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PermissionPreview>

export default meta
type Story = StoryObj<typeof meta>

export const ReadFile: Story = {
  args: {
    toolName: 'read_file',
    target: 'src/config/database.ts',
  },
}

export const ExecuteCommand: Story = {
  args: {
    toolName: 'execute_command',
    target: 'npm test -- --coverage',
  },
}

export const WriteFile: Story = {
  args: {
    toolName: 'write_file',
    target: 'src/auth/middleware.ts',
  },
}
