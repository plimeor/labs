import type { Decorator, Preview } from '@storybook/react-vite'

import '@plimeor/imprint-tokens/tokens.css'
import '@plimeor/imprint-tokens/fonts.css'

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'light'
  document.documentElement.dataset.theme = theme
  document.body.style.background = 'var(--bg-canvas)'
  document.body.style.color = 'var(--fg-body)'
  return Story()
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      defaultValue: 'light',
      description: 'Imprint color theme',
      toolbar: {
        dynamicTitle: true,
        icon: 'circlehollow',
        title: 'Theme',
        items: [
          { title: 'Light', value: 'light' },
          { title: 'Dark', value: 'dark' }
        ]
      }
    }
  },
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: 'centered'
  }
}

export default preview
