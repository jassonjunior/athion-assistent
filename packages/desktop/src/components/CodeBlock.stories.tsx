import type { Meta, StoryObj } from '@storybook/react-vite'
import { CodeBlock } from './CodeBlock'

const meta: Meta<typeof CodeBlock> = {
  title: 'Desktop/CodeBlock',
  component: CodeBlock,
}
export default meta

type Story = StoryObj<typeof CodeBlock>

export const TypeScript: Story = {
  args: {
    language: 'typescript',
    code: `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
}`,
  },
}

export const Python: Story = {
  args: {
    language: 'python',
    code: `def fibonacci(n: int) -> list[int]:
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib[:n]

print(fibonacci(10))`,
  },
}

export const JSON: Story = {
  args: {
    language: 'json',
    code: `{
  "name": "@athion/core",
  "version": "0.1.0",
  "dependencies": {
    "anthropic": "^0.30.0"
  }
}`,
  },
}
