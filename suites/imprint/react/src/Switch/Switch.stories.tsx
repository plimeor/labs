import type { Meta, StoryObj } from '@storybook/react-vite'

import { Switch } from './Switch'

const meta = {
  component: Switch,
  title: 'Components/Switch',
  args: {
    children: 'Notifications'
  },
  argTypes: {
    checked: { control: 'boolean' },
    defaultChecked: { control: 'boolean' },
    disabled: { control: 'boolean' }
  }
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const On: Story = {
  args: { children: 'On', defaultChecked: true }
}

export const Off: Story = {
  args: { children: 'Off', defaultChecked: false }
}

export const Disabled: Story = {
  args: { children: 'Disabled', defaultChecked: true, disabled: true }
}

export const DisabledOff: Story = {
  args: { children: 'Disabled', defaultChecked: false, disabled: true }
}

export const States: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 26 }}>
      <Switch defaultChecked>On</Switch>
      <Switch>Off</Switch>
      <Switch defaultChecked disabled>
        Disabled
      </Switch>
    </div>
  )
}
