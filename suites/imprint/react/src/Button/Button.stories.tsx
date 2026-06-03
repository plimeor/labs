import type { Meta, StoryObj } from '@storybook/react-vite'
import { Check, Link, Trash2 } from 'lucide-react'

import { Button } from './Button'

const meta = {
  component: Button,
  title: 'Components/Button',
  args: {
    children: 'Button',
    variant: 'primary'
  },
  argTypes: {
    disabled: { control: 'boolean' },
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost', 'danger']
    }
  }
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { children: 'Approve change', icon: Check, variant: 'primary' }
}

export const Secondary: Story = {
  args: { children: 'Link note', icon: Link, variant: 'secondary' }
}

export const Ghost: Story = {
  args: { children: 'Discard', variant: 'ghost' }
}

export const Danger: Story = {
  args: { children: 'Delete', icon: Trash2, variant: 'danger' }
}

export const Disabled: Story = {
  args: { children: 'Disabled', disabled: true, variant: 'primary' }
}

export const AllVariants: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Button variant="primary" icon={Check}>
        Approve change
      </Button>
      <Button variant="secondary" icon={Link}>
        Link note
      </Button>
      <Button variant="ghost">Discard</Button>
      <Button variant="danger" icon={Trash2}>
        Delete
      </Button>
    </div>
  )
}

export const States: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Button variant="primary">Default</Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
    </div>
  )
}
