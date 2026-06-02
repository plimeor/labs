import type { Meta, StoryObj } from '@storybook/react-vite'

import { TextField } from './TextField'

const meta = {
  component: TextField,
  title: 'Components/TextField',
  args: {
    label: 'Note title',
    placeholder: 'Untitled note'
  },
  argTypes: {
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    variant: {
      control: 'inline-radio',
      options: ['default', 'search']
    }
  },
  parameters: {
    layout: 'padded'
  }
} satisfies Meta<typeof TextField>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen text input: label + content-surface input with a hairline border. */
export const Default: Story = {
  args: {
    defaultValue: 'Field notes — March',
    label: 'Note title'
  }
}

/** With supporting hint text under the field. */
export const WithHint: Story = {
  args: {
    defaultValue: 'Field notes — March',
    hint: 'Shown at the top of the note and in search results.',
    label: 'Note title'
  }
}

/** The sunken search affordance: leading search icon, inset shadow, muted placeholder. */
export const Search: Story = {
  args: {
    label: 'Search',
    placeholder: 'Search notes…',
    variant: 'search'
  }
}

/** Invalid state — danger border and an error message that replaces the hint. */
export const Error: Story = {
  args: {
    defaultValue: '',
    error: 'A title is required.',
    hint: 'Shown at the top of the note.',
    label: 'Note title'
  }
}

/** Disabled — muted surface, non-interactive. */
export const Disabled: Story = {
  args: {
    defaultValue: 'Field notes — March',
    disabled: true,
    label: 'Note title'
  }
}

/** Required — renders an indicator next to the label. */
export const Required: Story = {
  args: {
    label: 'Collection name',
    placeholder: 'e.g. Research',
    required: true
  }
}

/**
 * Key states side by side. Use the toolbar Theme control to preview light + dark.
 */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 440 }}>
      <TextField label="Default" defaultValue="Field notes — March" />
      <TextField label="With hint" defaultValue="Field notes — March" hint="Shown at the top of the note." />
      <TextField label="Search" variant="search" placeholder="Search notes…" />
      <TextField label="Error" defaultValue="" error="A title is required." />
      <TextField label="Disabled" defaultValue="Field notes — March" disabled />
    </div>
  )
}
