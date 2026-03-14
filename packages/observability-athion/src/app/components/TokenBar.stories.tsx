import type { Meta, StoryObj } from '@storybook/react-vite'
import { TokenBar } from './TokenBar'

const meta: Meta<typeof TokenBar> = {
  title: 'Observability/TokenBar',
  component: TokenBar,
}
export default meta

type Story = StoryObj<typeof TokenBar>

export const Low: Story = {
  args: {
    tokens: {
      contextLimit: 128_000,
      totalUsed: 12_500,
      percentUsed: 10,
      estimatedInput: 8_000,
      estimatedOutput: 4_500,
    },
  },
}

export const Medium: Story = {
  args: {
    tokens: {
      contextLimit: 128_000,
      totalUsed: 76_800,
      percentUsed: 60,
      estimatedInput: 50_000,
      estimatedOutput: 26_800,
    },
  },
}

export const High: Story = {
  args: {
    tokens: {
      contextLimit: 128_000,
      totalUsed: 115_200,
      percentUsed: 90,
      estimatedInput: 80_000,
      estimatedOutput: 35_200,
    },
  },
}
