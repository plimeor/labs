import type { Meta, StoryObj } from '@storybook/react-vite'

import { Accordion } from './Accordion'

const meta = {
  component: Accordion,
  title: 'Components/Accordion',
  args: {
    collapsible: true,
    multiple: false
  },
  argTypes: {
    collapsible: { control: 'boolean' },
    disabled: { control: 'boolean' },
    multiple: { control: 'boolean' }
  }
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

const items = [
  {
    content: 'When two replicas diverge, blocks merge independently. The editor never blocks on the network.',
    title: 'Conflict resolution',
    value: 'conflict'
  },
  {
    content:
      'Notes persist locally first, then sync in the background. History is kept per block, diffed and restorable.',
    title: 'Storage & sync',
    value: 'storage'
  },
  {
    content: 'Share a read-only snapshot or invite collaborators. Permissions resolve per workspace, never per device.',
    title: 'Sharing',
    value: 'sharing'
  }
]

/**
 * The hero specimen: the first item open with a serif reading body, the rest
 * collapsed with a right-pointing chevron. Use the toolbar Theme control for dark.
 */
export const Default: Story = {
  args: {
    defaultValue: ['conflict'],
    items
  }
}

/** All items collapsed — every chevron points right. */
export const AllClosed: Story = {
  args: {
    items
  }
}

/** Multiple items may be open at once. */
export const Multiple: Story = {
  args: {
    defaultValue: ['conflict', 'sharing'],
    multiple: true,
    items
  }
}

/**
 * Non-collapsible: exactly one item is always open. Clicking the open header
 * does not close it.
 */
export const NonCollapsible: Story = {
  args: {
    collapsible: false,
    defaultValue: ['conflict'],
    items
  }
}

/** A disabled item cannot be toggled. */
export const WithDisabledItem: Story = {
  args: {
    defaultValue: ['conflict'],
    items: [
      items[0],
      { content: items[1].content, disabled: true, title: 'Storage & sync (disabled)', value: 'storage' },
      items[2]
    ]
  }
}

/** Key states in one frame — open, closed, disabled. Toggle the toolbar Theme for dark. */
export const Showcase: Story = {
  args: { items },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      <Accordion defaultValue={['conflict']} items={items} />
      <Accordion
        multiple
        defaultValue={['conflict', 'sharing']}
        items={[
          items[0],
          { content: items[1].content, disabled: true, title: 'Storage & sync (disabled)', value: 'storage' },
          items[2]
        ]}
      />
    </div>
  )
}
