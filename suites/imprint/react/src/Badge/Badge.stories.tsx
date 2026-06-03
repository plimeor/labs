import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckCheck } from 'lucide-react'

import { Badge } from './Badge'

const meta = {
  component: Badge,
  title: 'Components/Badge',
  args: {
    children: 'Rolled back',
    variant: 'neutral'
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['neutral', 'accent', 'success', 'warning', 'danger']
    }
  }
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen pills. Use the toolbar Theme control to preview light + dark. */
export const Accent: Story = {
  args: { children: 'Proposed', variant: 'accent' }
}

export const Warning: Story = {
  args: { children: 'Pending review', variant: 'warning' }
}

export const Success: Story = {
  args: { children: 'Approved', variant: 'success' }
}

export const Danger: Story = {
  args: { children: 'Rejected', variant: 'danger' }
}

export const Neutral: Story = {
  args: { children: 'Rolled back', variant: 'neutral' }
}

/** The variant glyph can be overridden with any lucide icon. */
export const CustomIcon: Story = {
  args: { children: 'Applied', icon: CheckCheck, variant: 'success' }
}

/** Label-only, no leading glyph. */
export const NoIcon: Story = {
  args: { children: 'Draft', icon: null, variant: 'neutral' }
}

/** All variants, matching the specimen rows. Toggle Theme to see dark. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Badge variant="accent">Proposed</Badge>
      <Badge variant="warning">Pending review</Badge>
      <Badge variant="success">Approved</Badge>
      <Badge variant="danger">Rejected</Badge>
      <Badge variant="neutral">Rolled back</Badge>
    </div>
  )
}
