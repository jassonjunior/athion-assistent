/**
 * LogPanel Stories
 * Usa LogPanelBase diretamente com entradas pré-formatadas,
 * já que LogPanel depende de WsServerMessage que é complexo de mockar.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { LogEntry } from './LogPanelBase'
import { LogPanelBase } from './LogPanelBase'

const meta: Meta<typeof LogPanelBase> = {
  title: 'Observability/LogPanel',
  component: LogPanelBase,
  decorators: [
    (Story) => (
      <div style={{ height: 400, display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof LogPanelBase>

const orchEntries: LogEntry[] = [
  { key: 0, type: 'test:started', color: '#3b82f6', content: 'Test started: should create user' },
  { key: 1, type: 'setup:step', color: '#6b7280', content: '[init] Loading tools and agents' },
  {
    key: 2,
    type: 'setup:tools',
    color: '#6b7280',
    content: 'Tools: read_file, write_file, execute_command',
  },
  {
    key: 3,
    type: 'orch:user_message',
    color: '#8b5cf6',
    content: 'User: Create a new user with email test@example.com',
  },
  {
    key: 4,
    type: 'orch:content',
    color: '#06b6d4',
    content: 'LLM: I will create a new user with the provided email...',
  },
  {
    key: 5,
    type: 'orch:tool_call',
    color: '#f59e0b',
    content: 'Tool call: write_file({"path":"src/user.ts","content":"..."})',
  },
  {
    key: 6,
    type: 'orch:tool_result',
    color: '#10b981',
    content: 'Tool result: write_file → ✓ File written successfully',
  },
  {
    key: 7,
    type: 'orch:finish',
    color: '#3b82f6',
    content: 'Finish: 1200 in / 800 out / 2000 total',
    tokens: '[2,000/128,000 1.6%]',
  },
  { key: 8, type: 'test:finished', color: '#3b82f6', content: 'Test PASSED ✓ (3.2s)' },
]

const errorEntries: LogEntry[] = [
  {
    key: 0,
    type: 'test:started',
    color: '#3b82f6',
    content: 'Test started: should handle auth error',
  },
  {
    key: 1,
    type: 'orch:user_message',
    color: '#8b5cf6',
    content: 'User: Try to access protected endpoint',
  },
  {
    key: 2,
    type: 'orch:tool_call',
    color: '#f59e0b',
    content: 'Tool call: execute_command({"command":"curl http://localhost:3000/admin"})',
  },
  {
    key: 3,
    type: 'orch:error',
    color: '#ef4444',
    content: 'ERROR: 401 Unauthorized - Invalid credentials',
    isError: true,
  },
  { key: 4, type: 'test:finished', color: '#3b82f6', content: 'Test FAILED ✗ (1.8s)' },
]

const subagentEntries: LogEntry[] = [
  {
    key: 0,
    type: 'orch:user_message',
    color: '#8b5cf6',
    content: 'User: Refactor the authentication module',
  },
  {
    key: 1,
    type: 'orch:subagent_start',
    color: '#a78bfa',
    content: '▸ SubAgent started: code-reviewer',
  },
  {
    key: 2,
    type: 'sub:start',
    color: '#c084fc',
    content: '  ↳ Agent code-reviewer: Analyzing authentication code',
  },
  {
    key: 3,
    type: 'sub:tool_call',
    color: '#fbbf24',
    content: '  ↳ Tool: read_file({"path":"src/auth.ts"})',
  },
  {
    key: 4,
    type: 'sub:tool_result',
    color: '#34d399',
    content: '  ↳ Result: read_file → ✓ File contents loaded',
  },
  {
    key: 5,
    type: 'sub:complete',
    color: '#34d399',
    content: '  ↳ Agent complete: Authentication module has 3 issues...',
  },
  {
    key: 6,
    type: 'orch:subagent_complete',
    color: '#a78bfa',
    content: '▸ SubAgent complete: code-reviewer',
  },
]

export const WithOrchestration: Story = {
  args: {
    entries: orchEntries,
    emptyMessage: 'Select a test and click Run to begin',
  },
}

export const WithErrors: Story = {
  args: {
    entries: errorEntries,
    emptyMessage: 'Select a test and click Run to begin',
  },
}

export const WithSubAgents: Story = {
  args: {
    entries: subagentEntries,
    emptyMessage: 'Select a test and click Run to begin',
  },
}

export const Empty: Story = {
  args: {
    entries: [],
    emptyMessage: 'Select a test and click Run to begin',
  },
}
