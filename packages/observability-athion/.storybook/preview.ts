import type { Preview } from '@storybook/react-vite'
import '../src/app/styles/theme.css'
import '../../desktop/src/styles/app.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      values: [
        { name: 'Dark', value: '#0f1117' },
        { name: 'Light', value: '#ffffff' },
      ],
      default: 'Dark',
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
