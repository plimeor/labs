import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Code, Columns2, Eye } from 'lucide-react'

import { SegmentGroup } from './SegmentGroup'

const meta = {
  component: SegmentGroup,
  title: 'Components/SegmentGroup',
  args: {
    defaultValue: 'preview',
    items: [
      { label: 'Preview', value: 'preview' },
      { label: 'Source', value: 'source' },
      { label: 'Split', value: 'split' }
    ]
  },
  argTypes: {
    disabled: { control: 'boolean' },
    fill: { control: 'boolean' },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] }
  }
} satisfies Meta<typeof SegmentGroup>

export default meta
type Story = StoryObj<typeof meta>

/** Hero: minimal, borderless, single-select. */
export const Default: Story = {}

export const WithIcons: Story = {
  args: {
    defaultValue: 'preview',
    items: [
      { icon: Eye, label: 'Preview', value: 'preview' },
      { icon: Code, label: 'Source', value: 'source' },
      { icon: Columns2, label: 'Split', value: 'split' }
    ]
  }
}

/** Symbol-only, fills container width. Labels are kept for a11y, hidden. */
export const IconOnlyFill: Story = {
  args: {
    defaultValue: 'center',
    fill: true,
    items: [
      { icon: AlignLeft, iconOnly: true, label: 'Align left', value: 'left' },
      { icon: AlignCenter, iconOnly: true, label: 'Align center', value: 'center' },
      { icon: AlignRight, iconOnly: true, label: 'Align right', value: 'right' },
      { icon: AlignJustify, iconOnly: true, label: 'Justify', value: 'justify' }
    ]
  },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    )
  ]
}

export const Disabled: Story = {
  args: { defaultValue: 'preview', disabled: true }
}

const sizeItems = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' }
]

export const Sizes: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <SegmentGroup size="sm" items={sizeItems} defaultValue="day" />
      <SegmentGroup size="md" items={sizeItems} defaultValue="day" />
      <SegmentGroup size="lg" items={sizeItems} defaultValue="day" />
    </div>
  )
}

/** Dark theme — flip the Storybook Theme toolbar to Dark to view in dark mode. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  render: () => (
    <div style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <SegmentGroup
        items={[
          { icon: Eye, label: 'Preview', value: 'preview' },
          { icon: Code, label: 'Source', value: 'source' },
          { icon: Columns2, label: 'Split', value: 'split' }
        ]}
        defaultValue="preview"
      />
      <SegmentGroup items={sizeItems} defaultValue="week" />
    </div>
  )
}

export const States: Story = {
  render: () => (
    <div style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SegmentGroup
        items={[
          { label: 'Preview', value: 'preview' },
          { label: 'Source', value: 'source' },
          { label: 'Split', value: 'split' }
        ]}
        defaultValue="preview"
      />
      <SegmentGroup
        disabled
        items={[
          { label: 'Preview', value: 'preview' },
          { label: 'Source', value: 'source' },
          { label: 'Split', value: 'split' }
        ]}
        defaultValue="preview"
      />
    </div>
  )
}
