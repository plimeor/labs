import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '../Button/Button'
import { createToast, Toaster } from './Toast'

const meta = {
  component: Toaster,
  title: 'Components/Toast',
  // Each story creates its own store inside `render`; this default store only
  // satisfies the required `toaster` arg for the story types.
  args: {
    toaster: createToast()
  },
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: a success toast ("Change applied") and a neutral toast with an
 * inline "Undo" action ("Rolled back"). Buttons re-trigger them. Use the
 * toolbar Theme control to preview light + dark.
 */
export const Specimen: Story = {
  render: () => {
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    return (
      <div style={{ display: 'flex', gap: 14 }}>
        <Button
          variant="secondary"
          onClick={() =>
            toaster.create({
              description: '2 edits to field-notes-march.',
              title: 'Change applied',
              type: 'success'
            })
          }
        >
          Apply
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toaster.create({
              action: { label: 'Undo', onClick: () => {} },
              description: 'Your note is unchanged.',
              title: 'Rolled back'
            })
          }
        >
          Roll back
        </Button>
        <Toaster toaster={toaster} />
      </div>
    )
  }
}

/** All four status variants, fired together. */
export const Statuses: Story = {
  render: () => {
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY, max: 8 })
    return (
      <div style={{ display: 'flex', gap: 14 }}>
        <Button
          onClick={() => {
            toaster.create({ description: 'Your changes are saved.', title: 'Saved', type: 'success' })
            toaster.create({ description: 'You have unsynced edits.', title: 'Heads up', type: 'info' })
            toaster.create({ description: 'Less than 5% remaining.', title: 'Storage low', type: 'warning' })
            toaster.create({ description: 'Could not reach the server.', title: 'Sync failed', type: 'error' })
          }}
        >
          Show all statuses
        </Button>
        <Toaster toaster={toaster} />
      </div>
    )
  }
}

/** Auto-dismissing toast with a finite duration and pause-on-hover. */
export const AutoDismiss: Story = {
  render: () => {
    const toaster = createToast({ duration: 4000 })
    return (
      <div style={{ display: 'flex', gap: 14 }}>
        <Button
          onClick={() =>
            toaster.create({
              description: 'This toast dismisses in a few seconds.',
              title: 'Copied to clipboard',
              type: 'success'
            })
          }
        >
          Copy link
        </Button>
        <Toaster toaster={toaster} />
      </div>
    )
  }
}

/** Title only — no description. */
export const TitleOnly: Story = {
  render: () => {
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    return (
      <div style={{ display: 'flex', gap: 14 }}>
        <Button variant="secondary" onClick={() => toaster.create({ title: 'Bookmarked', type: 'success' })}>
          Bookmark
        </Button>
        <Toaster toaster={toaster} />
      </div>
    )
  }
}
