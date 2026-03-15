import type { Meta, StoryObj } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { MentionDropdown } from './MentionDropdown'
import { fn } from 'storybook/test'

const meta = {
  title: 'VSCode/Autocomplete/MentionDropdown',
  component: MentionDropdown,
  decorators: [VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof MentionDropdown>

export default meta
type Story = StoryObj<typeof meta>

export const Functions: Story = {
  args: {
    query: 'auth',
    selectedIndex: 0,
    results: [
      {
        file: 'src/auth/middleware.ts',
        startLine: 15,
        symbolName: 'authenticate',
        chunkType: 'function',
        score: 0.95,
      },
      {
        file: 'src/auth/token.ts',
        startLine: 8,
        symbolName: 'verifyToken',
        chunkType: 'function',
        score: 0.88,
      },
      {
        file: 'src/auth/session.ts',
        startLine: 22,
        symbolName: 'createSession',
        chunkType: 'function',
        score: 0.72,
      },
    ],
  },
}

export const Classes: Story = {
  args: {
    query: 'service',
    selectedIndex: 1,
    results: [
      {
        file: 'src/services/UserService.ts',
        startLine: 5,
        symbolName: 'UserService',
        chunkType: 'class',
        score: 0.91,
      },
      {
        file: 'src/services/AuthService.ts',
        startLine: 10,
        symbolName: 'AuthService',
        chunkType: 'class',
        score: 0.85,
      },
    ],
  },
}

export const Methods: Story = {
  args: {
    query: 'handle',
    selectedIndex: 0,
    results: [
      {
        file: 'src/handlers/chat.ts',
        startLine: 30,
        symbolName: 'handleMessage',
        chunkType: 'method',
        score: 0.93,
      },
      {
        file: 'src/handlers/events.ts',
        startLine: 12,
        symbolName: 'handleEvent',
        chunkType: 'method',
        score: 0.78,
      },
    ],
  },
}

export const MixedTypes: Story = {
  args: {
    query: 'user',
    selectedIndex: 2,
    results: [
      {
        file: 'src/models/User.ts',
        startLine: 1,
        symbolName: 'User',
        chunkType: 'class',
        score: 0.96,
      },
      {
        file: 'src/services/UserService.ts',
        startLine: 10,
        symbolName: 'createUser',
        chunkType: 'function',
        score: 0.82,
      },
      {
        file: 'src/routes/users.ts',
        startLine: 5,
        chunkType: 'default',
        symbolName: undefined,
        score: 0.65,
      },
    ],
  },
}

export const FileOnly: Story = {
  args: {
    query: 'config',
    selectedIndex: 0,
    results: [
      {
        file: 'tsconfig.json',
        startLine: 1,
        chunkType: 'default',
        symbolName: undefined,
        score: 0.88,
      },
      {
        file: 'vite.config.ts',
        startLine: 1,
        chunkType: 'default',
        symbolName: undefined,
        score: 0.75,
      },
    ],
  },
}
