import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { NumberInput } from './NumberInput'

const meta = {
  component: NumberInput,
  title: 'Components/NumberInput',
  args: {
    defaultValue: '30',
    label: 'Rollback history (days)'
  },
  argTypes: {
    disabled: { control: 'boolean' },
    invalid: { control: 'boolean' },
    max: { control: 'number' },
    min: { control: 'number' },
    readOnly: { control: 'boolean' },
    step: { control: 'number' }
  },
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof NumberInput>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen. Use the toolbar Theme control to preview light + dark. */
export const Default: Story = {
  args: { defaultValue: '30', max: 365, min: 1 }
}

export const Disabled: Story = {
  args: { defaultValue: '30', disabled: true }
}

export const ReadOnly: Story = {
  args: { defaultValue: '30', readOnly: true }
}

export const Invalid: Story = {
  args: { defaultValue: '999', invalid: true, max: 365 }
}

/** Clamped to a small range so the stepper bounds are easy to exercise. */
export const Bounded: Story = {
  args: { defaultValue: '3', label: 'Retries', max: 5, min: 0, step: 1 }
}

/** Fully controlled value. */
export const Controlled: Story = {
  render: args => {
    const [value, setValue] = useState('30')
    return <NumberInput {...args} value={value} onValueChange={details => setValue(details.value)} />
  }
}

/** Several states side by side. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
      <NumberInput label="Default" defaultValue="30" min={1} max={365} />
      <NumberInput label="Disabled" defaultValue="30" disabled />
      <NumberInput label="Read-only" defaultValue="30" readOnly />
      <NumberInput label="Invalid" defaultValue="999" max={365} invalid />
    </div>
  )
}
