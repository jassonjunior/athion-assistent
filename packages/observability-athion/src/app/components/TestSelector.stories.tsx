import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { TestSelector } from './TestSelector'

const meta: Meta<typeof TestSelector> = {
  title: 'Observability/TestSelector',
  component: TestSelector,
  args: {
    onRun: fn(),
    onStop: fn(),
    onClear: fn(),
  },
}
export default meta

type Story = StoryObj<typeof TestSelector>

const sampleTests = [
  { name: 'hello-world', agent: 'orchestrator', description: 'Teste básico de resposta' },
  { name: 'tool-call', agent: 'orchestrator', description: 'Teste de chamada de ferramenta' },
  { name: 'multi-agent', agent: 'supervisor', description: 'Teste multi-agente' },
]

export const Connected: Story = {
  args: {
    tests: sampleTests,
    running: false,
    connected: true,
  },
}

export const Running: Story = {
  args: {
    tests: sampleTests,
    running: true,
    connected: true,
  },
}

export const Disconnected: Story = {
  args: {
    tests: sampleTests,
    running: false,
    connected: false,
  },
}

export const NoTests: Story = {
  args: {
    tests: [],
    running: false,
    connected: true,
  },
}
