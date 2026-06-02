import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  addons: [],
  stories: ['../../../packages/imprint-react/src/**/*.stories.tsx', '../stories/**/*.stories.tsx'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  }
}

export default config
