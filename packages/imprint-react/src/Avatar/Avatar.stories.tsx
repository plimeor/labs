import type { Meta, StoryObj } from '@storybook/react-vite'

import { Avatar } from './Avatar'

const meta = {
  component: Avatar,
  title: 'Components/Avatar',
  args: {
    fallback: 'P',
    size: 'md',
    tone: 'accent'
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    status: { control: 'inline-radio', options: [undefined, 'online', 'offline'] },
    tone: { control: 'inline-radio', options: ['accent', 'neutral'] }
  }
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

/** Solid accent initials tile. Use the toolbar Theme control to preview light + dark. */
export const Initials: Story = {
  args: { fallback: 'P', tone: 'accent' }
}

/** Muted neutral tile with a presence dot — matches the specimen's second avatar. */
export const Neutral: Story = {
  args: { fallback: 'AK', status: 'online', tone: 'neutral' }
}

/** Loads a photo; the initials show until (and if) the image resolves. */
export const WithImage: Story = {
  args: {
    alt: 'Ada Lovelace',
    fallback: 'AL',
    src: 'https://i.pravatar.cc/76?img=5'
  }
}

/** A broken src keeps the initials fallback visible. */
export const BrokenImageFallback: Story = {
  args: {
    alt: 'Missing portrait',
    fallback: 'MP',
    src: 'https://example.invalid/missing.png'
  }
}

/** The presence dot, both states. */
export const Statuses: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', gap: 26 }}>
      <Avatar fallback="P" status="online" />
      <Avatar fallback="AK" tone="neutral" status="offline" />
    </div>
  )
}

/** Both sizes, both tones. */
export const Sizes: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', gap: 26 }}>
      <Avatar fallback="P" size="md" />
      <Avatar fallback="P" size="sm" />
      <Avatar fallback="AK" size="md" tone="neutral" />
      <Avatar fallback="AK" size="sm" tone="neutral" />
    </div>
  )
}

/**
 * Stacked group with an overflow chip — the specimen's third example.
 * Overlap and the canvas-colored ring are layout concerns, applied here.
 */
export const Group: Story = {
  render: () => (
    <div style={{ display: 'inline-flex' }}>
      {['P', 'A', 'K'].map((initial, i) => (
        <Avatar
          key={initial}
          fallback={initial}
          size="sm"
          style={{ border: '2px solid var(--bg-canvas)', marginLeft: i === 0 ? 0 : -10 }}
        />
      ))}
      <Avatar
        fallback="+2"
        size="sm"
        tone="neutral"
        style={{ border: '2px solid var(--bg-canvas)', marginLeft: -10 }}
      />
    </div>
  )
}

/** The full specimen row. Toggle Theme to verify light + dark. */
export const Specimen: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 26 }}>
      <Avatar fallback="P" />
      <Avatar fallback="AK" tone="neutral" status="online" />
      <div style={{ display: 'inline-flex' }}>
        {['P', 'A', 'K'].map((initial, i) => (
          <Avatar
            key={initial}
            fallback={initial}
            size="sm"
            style={{ border: '2px solid var(--bg-canvas)', marginLeft: i === 0 ? 0 : -10 }}
          />
        ))}
        <Avatar
          fallback="+2"
          size="sm"
          tone="neutral"
          style={{ border: '2px solid var(--bg-canvas)', marginLeft: -10 }}
        />
      </div>
    </div>
  )
}
