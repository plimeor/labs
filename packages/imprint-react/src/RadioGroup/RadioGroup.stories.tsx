import type { Meta, StoryObj } from '@storybook/react-vite'

import { RadioGroup } from './RadioGroup'

const reviewItems = [
  { label: 'Apply automatically', value: 'auto' },
  { label: 'Review every change', value: 'review' },
  { label: 'Notify only', value: 'notify' }
]

const meta = {
  component: RadioGroup,
  title: 'Components/RadioGroup',
  args: {
    items: reviewItems
  },
  argTypes: {
    disabled: { control: 'boolean' },
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] }
  }
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen: the middle option selected. Use the toolbar Theme control to preview light + dark. */
export const Default: Story = {
  args: { defaultValue: 'review' }
}

/** No initial selection. */
export const Unselected: Story = {
  args: { defaultValue: null }
}

/** A group label rendered above the items. */
export const WithLabel: Story = {
  args: { defaultValue: 'review', label: 'When the agent edits a note' }
}

/** Whole group disabled, keeping the selected value visible. */
export const Disabled: Story = {
  args: { defaultValue: 'review', disabled: true }
}

/** A single option disabled within an otherwise enabled group. */
export const ItemDisabled: Story = {
  args: {
    defaultValue: 'auto',
    items: [
      { label: 'Apply automatically', value: 'auto' },
      { label: 'Review every change', value: 'review' },
      { disabled: true, label: 'Notify only (coming soon)', value: 'notify' }
    ]
  }
}

/** Horizontal layout. */
export const Horizontal: Story = {
  args: { defaultValue: 'review', orientation: 'horizontal' }
}

/** Side-by-side states for a quick visual scan; toggle the toolbar Theme control for dark. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
      <RadioGroup items={reviewItems} defaultValue="review" />
      <RadioGroup items={reviewItems} defaultValue={null} />
      <RadioGroup items={reviewItems} defaultValue="review" disabled />
    </div>
  )
}
