import type { Meta, StoryObj } from '@storybook/react-vite'
import { InputArea } from './InputArea'
import { fn } from 'storybook/test'

const meta: Meta<typeof InputArea> = {
  title: 'Desktop/InputArea',
  component: InputArea,
  args: {
    onSubmit: fn(),
    onAbort: fn(),
  },
}
export default meta

type Story = StoryObj<typeof InputArea>

export const Default: Story = {
  args: {
    isStreaming: false,
    isDisabled: false,
  },
}

export const Streaming: Story = {
  args: {
    isStreaming: true,
    isDisabled: false,
  },
}

export const Disabled: Story = {
  args: {
    isStreaming: false,
    isDisabled: true,
  },
}

export const WithInitialValue: Story = {
  args: {
    isStreaming: false,
    isDisabled: false,
    initialValue: '/use-skill review-code',
  },
}
