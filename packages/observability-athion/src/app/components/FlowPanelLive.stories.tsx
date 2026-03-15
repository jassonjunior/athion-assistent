/**
 * FlowPanelLive Stories
 * Mostra o empty state do FlowPanelLive (modo live/WebSocket).
 * O estado com dados requer ReactFlow + useFlowGraphLive com FlowEventMessage.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

function FlowPanelLiveEmptyPreview() {
  return (
    <div
      className="flow-panel flow-empty"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 400,
        background: '#1e1e2e',
        borderRadius: 8,
      }}
    >
      <div style={{ textAlign: 'center', color: '#cdd6f4' }}>
        <span style={{ fontSize: 48, opacity: 0.3 }}>📡</span>
        <p>Aguardando eventos do CLI, extensão ou app...</p>
        <p style={{ fontSize: 12, opacity: 0.5 }}>Os fluxos aparecerão aqui em tempo real</p>
      </div>
    </div>
  )
}

const meta: Meta<typeof FlowPanelLiveEmptyPreview> = {
  title: 'Observability/FlowPanelLive',
  component: FlowPanelLiveEmptyPreview,
  decorators: [
    (Story) => (
      <div style={{ height: 400, background: '#1e1e2e', color: '#cdd6f4' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FlowPanelLiveEmptyPreview>

export const Empty: Story = {}
