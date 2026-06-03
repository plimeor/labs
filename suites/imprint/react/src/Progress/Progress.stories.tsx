import type { Meta, StoryObj } from '@storybook/react-vite'

import { Progress } from './Progress'

const meta = {
  component: Progress,
  title: 'Components/Progress',
  args: {
    label: 'Indexing',
    value: 72,
    variant: 'linear'
  },
  argTypes: {
    showValueText: { control: 'boolean' },
    value: { control: { max: 100, min: 0, step: 1, type: 'range' } },
    variant: {
      control: 'inline-radio',
      options: ['linear', 'circular']
    }
  }
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen: a 72% linear indexing bar. */
export const Linear: Story = {
  args: { label: 'Indexing', value: 72, variant: 'linear' },
  render: args => (
    <div style={{ width: 240 }}>
      <Progress {...args} />
    </div>
  )
}

/** The specimen: a 72% circular ring with centered value. */
export const Circular: Story = {
  args: { label: undefined, value: 72, variant: 'circular' }
}

/** Indeterminate linear bar — a travelling sliver for unknown progress. */
export const LinearIndeterminate: Story = {
  args: { label: 'Syncing', showValueText: false, value: null, variant: 'linear' },
  render: args => (
    <div style={{ width: 240 }}>
      <Progress {...args} />
    </div>
  )
}

/** Indeterminate circular spinner. */
export const CircularIndeterminate: Story = {
  args: { showValueText: false, value: null, variant: 'circular' }
}

/** Both forms across the value range, in the current theme. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: 280 }}>
      <Progress variant="linear" label="Empty" value={0} />
      <Progress variant="linear" label="Indexing" value={72} />
      <Progress variant="linear" label="Complete" value={100} />
      <Progress variant="linear" label="Syncing" value={null} showValueText={false} />
      <div style={{ alignItems: 'center', display: 'flex', gap: 28 }}>
        <Progress variant="circular" value={25} />
        <Progress variant="circular" value={72} />
        <Progress variant="circular" value={100} />
        <Progress variant="circular" value={null} showValueText={false} />
      </div>
    </div>
  )
}
