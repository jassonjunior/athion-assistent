import type { StorybookConfig } from '@storybook/react-vite'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)))
}

const config: StorybookConfig = {
  stories: [
    // Documentação MDX
    '../src/docs/**/*.mdx',
    // Desktop stories
    '../../desktop/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // Observability stories
    '../../observability-athion/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // VSCode stories
    '../../vscode/src/webview/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // CLI stories
    '../../cli/src/ui/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    getAbsolutePath('@chromatic-com/storybook'),
    getAbsolutePath('@storybook/addon-vitest'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-onboarding'),
  ],
  framework: getAbsolutePath('@storybook/react-vite'),
}

export default config
