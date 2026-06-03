import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Button } from '../Button/Button'
import { Popover } from './Popover'

const meta = {
  component: Popover,
  title: 'Components/Popover',
  args: {
    description: 'Search your vault and insert a wikilink at the cursor.',
    title: 'Link to note',
    trigger: <Button variant="secondary">Link to note</Button>
  },
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: a titled popover with supporting copy and an action row.
 * Use the toolbar Theme control to preview light + dark.
 */
export const Default: Story = {
  args: {
    footer: (
      <>
        <Button variant="primary">Insert</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    )
  }
}

/** Opens immediately so the surface and footer are visible at a glance. */
export const OpenByDefault: Story = {
  args: {
    defaultOpen: true,
    footer: (
      <>
        <Button variant="primary">Insert</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    )
  }
}

/** A pointer arrow connects the surface to its trigger. */
export const WithArrow: Story = {
  args: {
    defaultOpen: true,
    footer: (
      <>
        <Button variant="primary">Insert</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    ),
    showArrow: true
  }
}

/** Top-right close affordance instead of (or alongside) footer actions. */
export const WithCloseButton: Story = {
  args: {
    defaultOpen: true,
    description: 'Press ? anywhere to bring up the full shortcut reference.',
    showCloseButton: true,
    title: 'Keyboard shortcuts'
  }
}

/** Title and description only — informational, dismissed by clicking outside or Esc. */
export const TitleOnly: Story = {
  args: {
    description: 'Your notes are up to date across every device.',
    title: 'Sync complete'
  }
}

/** Custom body content rendered between the description and the footer. */
export const WithBody: Story = {
  args: {
    children: (
      <input
        defaultValue="Field notes"
        style={{
          background: 'var(--color-content)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-body)',
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-sm)',
          padding: '6px 10px',
          width: '100%'
        }}
      />
    ),
    defaultOpen: true,
    description: 'Choose a new name for this collection.',
    footer: (
      <>
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    ),
    title: 'Rename collection'
  }
}

/** Placement above the trigger. */
export const PlacementTop: Story = {
  args: {
    defaultOpen: true,
    footer: (
      <>
        <Button variant="primary">Insert</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    ),
    placement: 'top',
    showArrow: true
  }
}

/** Fully controlled open state. */
export const Controlled: Story = {
  render: args => {
    const [open, setOpen] = useState(false)
    return (
      <Popover
        {...args}
        open={open}
        onOpenChange={setOpen}
        trigger={<Button variant="primary">Toggle popover</Button>}
        footer={
          <>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Insert
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      />
    )
  }
}

/** Dark theme — flip the Storybook Theme toolbar to Dark to view in dark mode. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  args: {
    defaultOpen: true,
    footer: (
      <>
        <Button variant="primary">Insert</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    ),
    showArrow: true
  }
}
