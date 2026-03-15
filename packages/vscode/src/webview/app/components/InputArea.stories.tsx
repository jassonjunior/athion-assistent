import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Decorator } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { installVsCodeApiMock } from '@athion/storybook/mocks/vscode-api-mock'
import { InputArea } from './InputArea'
import { fn } from 'storybook/test'

// Instala mock do acquireVsCodeApi antes de qualquer renderização
installVsCodeApiMock()

/** Decorator que adiciona CSS mínimo para o InputArea funcionar visualmente */
const InputAreaCSS: Decorator = (Story) => (
  <>
    <style>{`
      .input-area { width: 100%; }
      .input-wrapper { position: relative; }
      .chat-input {
        width: 100%;
        min-height: 36px;
        padding: 8px;
        background: var(--vscode-input-background, #3c3c3c);
        color: var(--vscode-input-foreground, #ccc);
        border: 1px solid var(--vscode-input-border, #3c3c3c);
        border-radius: 2px;
        font-family: inherit;
        font-size: 13px;
        resize: none;
        outline: none;
        box-sizing: border-box;
      }
      .chat-input:focus { border-color: var(--vscode-focusBorder, #007acc); }
      .chat-input:disabled { opacity: 0.5; }
      .abort-button {
        width: 100%;
        padding: 8px;
        background: var(--vscode-button-background, #0e639c);
        color: var(--vscode-button-foreground, #fff);
        border: none;
        border-radius: 2px;
        cursor: pointer;
        font-size: 13px;
      }
      .abort-button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    `}</style>
    <Story />
  </>
)

const meta = {
  title: 'VSCode/Chat/InputArea',
  component: InputArea,
  decorators: [InputAreaCSS, VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onSubmit: fn(),
    onAbort: fn(),
  },
} satisfies Meta<typeof InputArea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isStreaming: false,
    isDisabled: false,
  },
}

export const Disabled: Story = {
  args: {
    isStreaming: false,
    isDisabled: true,
  },
}

export const Streaming: Story = {
  args: {
    isStreaming: true,
    isDisabled: false,
  },
}
