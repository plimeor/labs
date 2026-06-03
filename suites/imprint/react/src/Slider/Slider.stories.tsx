import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Slider } from './Slider'

const meta = {
  component: Slider,
  title: 'Components/Slider',
  args: {
    defaultValue: 62,
    label: 'Reading width',
    formatValue: value => `${value}ch`
  },
  argTypes: {
    defaultValue: { control: 'number' },
    disabled: { control: 'boolean' },
    max: { control: 'number' },
    min: { control: 'number' },
    readOnly: { control: 'boolean' },
    step: { control: 'number' },
    value: { control: 'number' }
  },
  decorators: [
    Story => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    )
  ],
  parameters: {
    layout: 'padded'
  }
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: a labelled reading-width slider with a mono readout. Use the
 * toolbar Theme control to preview light + dark.
 */
export const ReadingWidth: Story = {}

/** Bare track with no header — accent range and ringed thumb only. */
export const NoHeader: Story = {
  args: { defaultValue: 40, formatValue: undefined, label: undefined, thumbLabel: 'Volume' }
}

/** Live numeric readout driven by the raw value. */
export const WithValue: Story = {
  args: { defaultValue: 75, label: 'Opacity', formatValue: value => `${value}%` }
}

/** Disabled — muted track, range, and thumb; non-interactive. */
export const Disabled: Story = {
  args: { defaultValue: 62, disabled: true, label: 'Reading width', formatValue: value => `${value}ch` }
}

/** Read-only — visible value, no interaction. */
export const ReadOnly: Story = {
  args: { defaultValue: 62, label: 'Reading width', readOnly: true, formatValue: value => `${value}ch` }
}

/** Fully controlled value. */
export const Controlled: Story = {
  render: args => {
    const [value, setValue] = useState(50)
    return <Slider {...args} value={value} onValueChange={setValue} formatValue={v => `${v}%`} label="Volume" />
  }
}

/**
 * A stack of states for a quick visual scan. Toggle the toolbar Theme control
 * to verify light + dark.
 */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: 360 }}>
      <Slider label="Reading width" defaultValue={62} formatValue={v => `${v}ch`} />
      <Slider label="Volume" defaultValue={30} formatValue={v => `${v}%`} />
      <Slider label="Disabled" defaultValue={62} formatValue={v => `${v}ch`} disabled />
    </div>
  )
}
