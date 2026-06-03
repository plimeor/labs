import type { Meta, StoryObj } from '@storybook/react-vite'

import { Checkbox } from './Checkbox'

const meta = {
  component: Checkbox,
  title: 'Components/Checkbox',
  args: {
    children: 'Accept terms'
  },
  argTypes: {
    checked: { control: 'boolean' },
    defaultChecked: { control: 'boolean' },
    disabled: { control: 'boolean' }
  }
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Unchecked: Story = {
  args: { children: 'Unchecked', defaultChecked: false }
}

export const Checked: Story = {
  args: { children: 'Checked', defaultChecked: true }
}

export const Indeterminate: Story = {
  args: { children: 'Indeterminate', defaultChecked: 'indeterminate' }
}

export const Disabled: Story = {
  args: { children: 'Disabled', disabled: true }
}

export const DisabledChecked: Story = {
  args: { children: 'Disabled checked', defaultChecked: true, disabled: true }
}

/** All specimen states side by side. Use the toolbar Theme control to preview light + dark. */
export const States: Story = {
  render: () => (
    <div style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Checkbox>Unchecked</Checkbox>
      <Checkbox defaultChecked>Checked</Checkbox>
      <Checkbox defaultChecked="indeterminate">Indeterminate</Checkbox>
      <Checkbox disabled>Disabled</Checkbox>
    </div>
  )
}
