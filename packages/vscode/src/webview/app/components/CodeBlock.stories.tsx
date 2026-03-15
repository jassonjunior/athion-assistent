import type { Meta, StoryObj } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { CodeBlock } from './CodeBlock'

const meta = {
  title: 'VSCode/Chat/CodeBlock',
  component: CodeBlock,
  decorators: [VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CodeBlock>

export default meta
type Story = StoryObj<typeof meta>

export const TypeScript: Story = {
  args: {
    language: 'typescript',
    code: `function greet(name: string): string {
  return \`Hello, \${name}!\`
}

export default greet`,
  },
}

export const Python: Story = {
  args: {
    language: 'python',
    code: `def fibonacci(n: int) -> list[int]:
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[-1] + fib[-2])
    return fib`,
  },
}

export const JSON: Story = {
  args: {
    language: 'json',
    code: `{
  "name": "athion-assistent",
  "version": "1.0.0",
  "dependencies": {
    "react": "^19.0.0"
  }
}`,
  },
}

export const ShortSnippet: Story = {
  args: {
    language: 'bash',
    code: 'npm install @athion/shared',
  },
}
