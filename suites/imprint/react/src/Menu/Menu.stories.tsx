import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilePlus, Inbox, Link, Star, Trash2 } from 'lucide-react'

import { Button } from '../Button/Button'
import { Menu, type MenuEntry } from './Menu'

const noteActions: MenuEntry[] = [
  { icon: FilePlus, label: 'New note', shortcut: '⌘N', value: 'new' },
  { icon: Link, label: 'Copy link', value: 'copy-link' },
  { icon: Inbox, label: 'Move to…', value: 'move' },
  { icon: Star, label: 'Pin note', value: 'pin' },
  { type: 'separator' },
  { danger: true, icon: Trash2, label: 'Delete note', value: 'delete' }
]

const meta = {
  component: Menu,
  title: 'Components/Menu',
  args: {
    items: noteActions,
    trigger: <Button variant="secondary">Note actions</Button>
  },
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: a note actions menu with leading icons, a shortcut, a divider,
 * and a destructive item. Use the toolbar Theme control to preview light + dark.
 */
export const NoteActions: Story = {}

/** Opens immediately so the surface, items, and divider are visible at a glance. */
export const OpenByDefault: Story = {
  args: { defaultOpen: true }
}

/** A shortcut on every row, no destructive action. */
export const WithShortcuts: Story = {
  args: {
    items: [
      { icon: FilePlus, label: 'New note', shortcut: '⌘N', value: 'new' },
      { label: 'Duplicate', shortcut: '⌘D', value: 'duplicate' },
      { label: 'Rename', shortcut: '⏎', value: 'rename' },
      { icon: Link, label: 'Copy link', shortcut: '⌘⇧C', value: 'copy-link' }
    ]
  }
}

/** Items organised into labelled groups separated by dividers. */
export const Grouped: Story = {
  args: {
    items: [
      {
        id: 'note',
        label: 'Note',
        type: 'group',
        items: [
          { icon: FilePlus, label: 'New note', shortcut: '⌘N', value: 'new' },
          { icon: Inbox, label: 'Move to…', value: 'move' }
        ]
      },
      { type: 'separator' },
      {
        id: 'danger',
        items: [{ danger: true, icon: Trash2, label: 'Delete note', value: 'delete' }],
        label: 'Danger zone',
        type: 'group'
      }
    ]
  }
}

/** A menu with a disabled item. */
export const WithDisabledItem: Story = {
  args: {
    defaultOpen: true,
    items: [
      { icon: FilePlus, label: 'New note', shortcut: '⌘N', value: 'new' },
      { disabled: true, icon: Link, label: 'Copy link', value: 'copy-link' },
      { icon: Inbox, label: 'Move to…', value: 'move' },
      { type: 'separator' },
      { danger: true, icon: Trash2, label: 'Delete note', value: 'delete' }
    ]
  }
}

/** Plain text items, no icons or shortcuts. */
export const TextOnly: Story = {
  args: {
    trigger: <Button variant="ghost">Account</Button>,
    items: [
      { label: 'View profile', value: 'profile' },
      { label: 'Settings', value: 'settings' },
      { type: 'separator' },
      { danger: true, label: 'Sign out', value: 'signout' }
    ]
  }
}
