import type { Meta, StoryObj } from '@storybook/react-vite'

import { Alert } from './Alert'

const meta = {
  component: Alert,
  title: 'Components/Alert',
  args: {
    kind: 'info',
    title: 'Index up to date'
  },
  argTypes: {
    kind: {
      control: 'inline-radio',
      options: ['info', 'success', 'warning', 'danger']
    }
  },
  parameters: {
    layout: 'padded'
  }
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

/** The four specimen banners. Use the toolbar Theme control to preview light + dark. */
export const Info: Story = {
  args: { kind: 'info', title: 'Index up to date' }
}

export const Success: Story = {
  args: { kind: 'success', title: 'All changes reviewed' }
}

export const Warning: Story = {
  args: { kind: 'warning', title: '1 unresolved reference' }
}

export const Danger: Story = {
  args: { kind: 'danger', title: 'Sync failed — working offline' }
}

/** Optional supporting copy under the title. */
export const WithDescription: Story = {
  args: {
    description: 'Reconnect to push your local edits. Changes are saved on this device.',
    kind: 'danger',
    title: 'Sync failed — working offline'
  }
}

/** All four kinds stacked, matching the specimen layout. Toggle Theme to see dark. */
export const AllKinds: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 440 }}>
      <Alert kind="info" title="Index up to date" />
      <Alert kind="success" title="All changes reviewed" />
      <Alert kind="warning" title="1 unresolved reference" />
      <Alert kind="danger" title="Sync failed — working offline" />
    </div>
  )
}
