import type { Meta, StoryObj } from '@storybook/react-vite'

import { Breadcrumb } from './Breadcrumb'

const meta = {
  component: Breadcrumb,
  title: 'Components/Breadcrumb',
  args: {
    items: [{ href: '#', label: 'Vault' }, { href: '#', label: 'Field' }, { label: 'Field notes — March' }]
  }
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

/** Hero: matches the specimen — two links and a current trailing crumb. */
export const Default: Story = {}

/** A short two-level trail. */
export const TwoLevels: Story = {
  args: {
    items: [{ href: '#', label: 'Vault' }, { label: 'Field notes — March' }]
  }
}

/** A deeper trail to show the separator rhythm. */
export const DeepTrail: Story = {
  args: {
    items: [
      { href: '#', label: 'Vault' },
      { href: '#', label: 'Field' },
      { href: '#', label: 'Research' },
      { href: '#', label: 'Sources' },
      { label: 'Field notes — March' }
    ]
  }
}

/** Single current crumb, no separators. */
export const CurrentOnly: Story = {
  args: {
    items: [{ label: 'Field notes — March' }]
  }
}

/** Dark theme — flip the Storybook Theme toolbar to Dark to view in dark mode. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  args: {
    items: [{ href: '#', label: 'Vault' }, { href: '#', label: 'Field' }, { label: 'Field notes — March' }]
  }
}
