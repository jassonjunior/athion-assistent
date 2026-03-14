import type { Meta, StoryObj } from '@storybook/react-vite'
import type { LogEntry } from './LogPanelBase'
import { LogPanelBase } from './LogPanelBase'

const meta: Meta<typeof LogPanelBase> = {
  title: 'Observability/LogPanelBase',
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

const sampleEntries: LogEntry[] = [
  { key: 0, type: 'test:started', color: '#3b82f6', content: 'Test started: hello-world' },
  { key: 1, type: 'setup:step', color: '#6b7280', content: '[init] Bootstrap core...' },
  {
    key: 2,
    type: 'setup:tools',
    color: '#6b7280',
    content: 'Tools: search, read_file, write_file',
  },
  {
    key: 3,
    type: 'orch:user_message',
    color: '#8b5cf6',
    content: 'User: Olá, como você está?',
    tokens: '[1200/128000 1%]',
  },
  {
    key: 4,
    type: 'orch:content',
    color: '#06b6d4',
    content: 'LLM: Olá! Estou funcionando perfeitamente.',
    tokens: '[2400/128000 2%]',
  },
  {
    key: 5,
    type: 'orch:tool_call',
    color: '#f59e0b',
    content: 'Tool call: search({"query": "example"})',
  },
  {
    key: 6,
    type: 'orch:tool_result',
    color: '#10b981',
    content: 'Tool result: search → ✓ Found 3 results',
  },
  {
    key: 7,
    type: 'orch:finish',
    color: '#3b82f6',
    content: 'Finish: 1200 in / 800 out / 2000 total',
    tokens: '[3200/128000 3%]',
  },
  { key: 8, type: 'test:finished', color: '#3b82f6', content: 'Test PASSED ✓ (2.1s)' },
]

export const WithEntries: Story = {
  args: {
    entries: sampleEntries,
    emptyMessage: 'Select a test and click Run to begin',
  },
}

export const Empty: Story = {
  args: {
    entries: [],
    emptyMessage: 'Select a test and click Run to begin',
  },
}

export const WithErrors: Story = {
  args: {
    entries: [
      ...sampleEntries.slice(0, 5),
      {
        key: 9,
        type: 'orch:error',
        color: '#ef4444',
        content: 'ERROR: API rate limit exceeded',
        isError: true,
      },
      { key: 10, type: 'test:finished', color: '#3b82f6', content: 'Test FAILED ✗ (1.5s)' },
    ],
    emptyMessage: 'Select a test and click Run to begin',
  },
}

export const LiveMode: Story = {
  args: {
    entries: [
      {
        key: 'a1',
        type: 'user_message',
        color: '#8b5cf6',
        content: 'User: Analyze this code',
        time: '+0.0s',
      },
      {
        key: 'a2',
        type: 'llm_content',
        color: '#06b6d4',
        content: 'LLM: Let me analyze...',
        time: '+1.2s',
      },
      {
        key: 'a3',
        type: 'tool_call',
        color: '#f59e0b',
        content: 'Tool call: read_file({"path": "src/index.ts"})',
        time: '+1.5s',
      },
      {
        key: 'a4',
        type: 'tool_result',
        color: '#10b981',
        content: 'Tool result: read_file → ✓',
        time: '+2.0s',
      },
      {
        key: 'a5',
        type: 'subagent_start',
        color: '#a78bfa',
        content: '▸ SubAgent started: code-reviewer',
        time: '+2.5s',
      },
      {
        key: 'a6',
        type: 'subagent_complete',
        color: '#34d399',
        content: '▸ SubAgent complete: code-reviewer',
        time: '+5.0s',
      },
      {
        key: 'a7',
        type: 'finish',
        color: '#3b82f6',
        content: 'Finish: 5000 in / 2000 out / 7000 total',
        time: '+5.5s',
      },
    ],
    emptyMessage: 'Waiting for flow events from CLI...',
  },
}
