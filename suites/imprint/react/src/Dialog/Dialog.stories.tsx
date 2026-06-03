import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Button } from '../Button/Button'
import { Dialog } from './Dialog'

const meta = {
  component: Dialog,
  title: 'Components/Dialog',
  args: {
    description: 'This moves the note to Trash. You can restore it for 30 days.',
    title: 'Delete “Field notes — March”?'
  },
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: a destructive confirmation. Use the toolbar Theme control to
 * preview light + dark.
 */
export const ConfirmDelete: Story = {
  args: {
    footer: (
      <>
        <Button variant="secondary">Cancel</Button>
        <Button variant="danger">Delete</Button>
      </>
    ),
    role: 'alertdialog',
    trigger: <Button variant="danger">Delete note</Button>
  }
}

/** Opens immediately so the surface, scrim, and footer are visible at a glance. */
export const OpenByDefault: Story = {
  args: {
    defaultOpen: true,
    footer: (
      <>
        <Button variant="secondary">Cancel</Button>
        <Button variant="danger">Delete</Button>
      </>
    ),
    role: 'alertdialog'
  }
}

/** A neutral, informational dialog with a primary confirm action. */
export const Informational: Story = {
  args: {
    description: 'Your notes are up to date across every device.',
    footer: <Button variant="primary">Got it</Button>,
    title: 'Sync complete',
    trigger: <Button variant="secondary">Show status</Button>
  }
}

/** Title and description only — no footer actions, close via the X or Esc. */
export const TitleOnly: Story = {
  args: {
    description: 'Press ? anywhere to bring up the full shortcut reference.',
    title: 'Keyboard shortcuts',
    trigger: <Button variant="ghost">Open</Button>
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
          fontSize: 'var(--text-base)',
          padding: '8px 10px',
          width: '100%'
        }}
      />
    ),
    description: 'Choose a new name for this collection.',
    footer: (
      <>
        <Button variant="secondary">Cancel</Button>
        <Button variant="primary">Save</Button>
      </>
    ),
    title: 'Rename collection',
    trigger: <Button variant="secondary">Rename</Button>
  }
}

/** Fully controlled open state. */
export const Controlled: Story = {
  render: args => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open controlled
        </Button>
        <Dialog
          {...args}
          open={open}
          onOpenChange={setOpen}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Delete
              </Button>
            </>
          }
        />
      </>
    )
  }
}
