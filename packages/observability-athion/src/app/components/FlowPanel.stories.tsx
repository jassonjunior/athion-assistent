/**
 * FlowPanel Stories
 * Mostra o empty state do FlowPanel.
 * O estado com dados requer ReactFlow + useFlowGraph com dados WsServerMessage complexos.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

function FlowPanelEmptyPreview() {
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
        <span style={{ fontSize: 48, opacity: 0.3 }}>⬡</span>
        <p>Run a test to see the execution flow</p>
      </div>
    </div>
  )
}

const meta: Meta<typeof FlowPanelEmptyPreview> = {
  title: 'Observability/FlowPanel',
  component: FlowPanelEmptyPreview,
  decorators: [
    (Story) => (
      <div style={{ height: 400, background: '#1e1e2e', color: '#cdd6f4' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof FlowPanelEmptyPreview>

export const Empty: Story = {}
