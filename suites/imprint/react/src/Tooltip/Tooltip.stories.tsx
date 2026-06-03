import type { Meta, StoryObj } from '@storybook/react-vite'
import { RotateCcw } from 'lucide-react'

import { Button } from '../Button/Button'
import { Tooltip } from './Tooltip'

const meta = {
  component: Tooltip,
  title: 'Components/Tooltip',
  args: {
    children: (
      <Button variant="secondary" icon={RotateCcw}>
        Roll back
      </Button>
    ),
    content: 'Roll back this change'
  },
  argTypes: {
    closeDelay: { control: 'number' },
    disabled: { control: 'boolean' },
    openDelay: { control: 'number' },
    placement: {
      control: 'inline-radio',
      options: ['top', 'bottom', 'left', 'right']
    }
  },
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: a dark, high-contrast bubble above a secondary button.
 * Hover or focus the trigger. Use the toolbar Theme control to preview
 * light + dark.
 */
export const Default: Story = {}

/** Opens immediately so the bubble and arrow are visible at a glance. */
export const OpenByDefault: Story = {
  args: { defaultOpen: true }
}

/** All four placements, each opened by default to show arrow orientation. */
export const Placements: Story = {
  render: () => (
    <div
      style={{
        alignItems: 'center',
        display: 'grid',
        gap: 64,
        gridTemplateColumns: 'repeat(2, max-content)',
        justifyContent: 'center',
        padding: 48
      }}
    >
      <Tooltip defaultOpen placement="top" content="On top">
        <Button variant="secondary">Top</Button>
      </Tooltip>
      <Tooltip defaultOpen placement="bottom" content="On bottom">
        <Button variant="secondary">Bottom</Button>
      </Tooltip>
      <Tooltip defaultOpen placement="left" content="On the left">
        <Button variant="secondary">Left</Button>
      </Tooltip>
      <Tooltip defaultOpen placement="right" content="On the right">
        <Button variant="secondary">Right</Button>
      </Tooltip>
    </div>
  )
}

/** Longer copy wraps within the bubble's max width. */
export const LongContent: Story = {
  args: {
    content: 'Roll back this change and restore the previous version of the note.'
  }
}

/** Disabled: the trigger never shows a tooltip. */
export const Disabled: Story = {
  args: { disabled: true }
}
