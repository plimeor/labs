import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { TagsInput } from './TagsInput'

const meta = {
  component: TagsInput,
  title: 'Components/TagsInput',
  args: {
    defaultValue: ['field', 'soil', 'weather'],
    label: 'Tags'
  },
  argTypes: {
    disabled: { control: 'boolean' },
    hash: { control: 'boolean' },
    max: { control: 'number' },
    readOnly: { control: 'boolean' }
  },
  parameters: {
    layout: 'padded'
  }
} satisfies Meta<typeof TagsInput>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: token-colored accent chips with a leading hash and an inline
 * entry input. Use the toolbar Theme control to preview light + dark.
 */
export const Default: Story = {
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Empty field showing just the placeholder. */
export const Empty: Story = {
  args: { defaultValue: [], label: 'Tags' },
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Plain chips without the leading hash glyph. */
export const NoHash: Story = {
  args: { defaultValue: ['draft', 'review', 'published'], hash: false },
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Disabled — muted field, no interaction. */
export const Disabled: Story = {
  args: { disabled: true },
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Read-only — chips remain visible but cannot be added or removed. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Invalid — danger-toned border. */
export const Invalid: Story = {
  args: { invalid: true },
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Capped at three tags via `max`. */
export const MaxTags: Story = {
  args: { defaultValue: ['field', 'soil', 'weather'], max: 3 },
  render: args => (
    <div style={{ maxWidth: 380 }}>
      <TagsInput {...args} />
    </div>
  )
}

/** Fully controlled value with a live read-out. */
export const Controlled: Story = {
  render: args => {
    const [value, setValue] = useState<string[]>(['field', 'soil'])
    return (
      <div style={{ maxWidth: 380 }}>
        <TagsInput {...args} value={value} onValueChange={details => setValue(details.value)} />
        <p style={{ color: 'var(--color-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 12 }}>
          {value.length ? value.join(', ') : 'no tags'}
        </p>
      </div>
    )
  }
}
