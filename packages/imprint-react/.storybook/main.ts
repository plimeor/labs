import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  addons: [],
  stories: ['../src/**/*.stories.tsx', '../stories/**/*.stories.tsx'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  }
}

export default config
