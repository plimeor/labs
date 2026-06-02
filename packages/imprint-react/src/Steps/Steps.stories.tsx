import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Steps } from './Steps'

const meta = {
  component: Steps,
  title: 'Components/Steps',
  args: {
    items: [{ label: 'Proposed' }, { label: 'Reviewed' }, { label: 'Applied' }]
  },
  argTypes: {
    defaultStep: { control: 'number' },
    linear: { control: 'boolean' },
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    step: { control: 'number' }
  }
} satisfies Meta<typeof Steps>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: step 1 and 2 complete, step 3 upcoming. Use the toolbar Theme
 * control to preview light + dark.
 */
export const Default: Story = {
  args: { defaultStep: 2 }
}

/** First step active — one reached circle, two upcoming. */
export const FirstStep: Story = {
  args: { defaultStep: 0 }
}

/** All steps completed. */
export const AllComplete: Story = {
  args: { defaultStep: 3 }
}

/** Vertical orientation. */
export const Vertical: Story = {
  args: { defaultStep: 1, orientation: 'vertical' }
}

/** With per-step panel content revealed for the current step. */
export const WithContent: Story = {
  args: {
    defaultStep: 1,
    items: [
      { content: 'A change was proposed for review.', label: 'Proposed' },
      { content: 'The change has been reviewed and approved.', label: 'Reviewed' },
      { content: 'The change is live.', label: 'Applied' }
    ]
  }
}

/** Fully controlled current step driven by external buttons. */
export const Controlled: Story = {
  render: args => {
    const [step, setStep] = useState(1)
    return (
      <div style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Steps {...args} step={step} onStepChange={d => setStep(d.step)} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))}>
            Prev
          </button>
          <button type="button" onClick={() => setStep(s => Math.min(args.items.length, s + 1))}>
            Next
          </button>
        </div>
      </div>
    )
  }
}
