import type { Preview } from '@storybook/react-vite'
import '../src/tokens/tokens.css'
import '../../desktop/src/styles/app.css'
import '../../observability-athion/src/app/styles/theme.css'

/** Viewports customizados por plataforma */
const athionViewports = {
  desktop: {
    name: 'Desktop App (Tauri)',
    styles: { width: '1280px', height: '800px' },
  },
  vscodePanel: {
    name: 'VS Code Panel',
    styles: { width: '400px', height: '600px' },
  },
  vscodeSidebar: {
    name: 'VS Code Sidebar',
    styles: { width: '300px', height: '800px' },
  },
  terminal80x24: {
    name: 'Terminal 80x24',
    styles: { width: '640px', height: '384px' },
  },
  terminal120x40: {
    name: 'Terminal 120x40',
    styles: { width: '960px', height: '640px' },
  },
  observability: {
    name: 'Observability Dashboard',
    styles: { width: '1440px', height: '900px' },
  },
}

const preview: Preview = {
  parameters: {
    backgrounds: {
      values: [
        { name: 'Dark', value: '#0f1117' },
        { name: 'Light', value: '#ffffff' },
      ],
      default: 'Dark',
    },
    viewport: {
      viewports: athionViewports,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'Frontend theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'desktop', title: 'Desktop (Tailwind)' },
          { value: 'observability', title: 'Observability (Catppuccin)' },
          { value: 'vscode', title: 'VSCode (Dark)' },
          { value: 'cli', title: 'CLI (Tokyo Night)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'desktop',
  },
}

export default preview
