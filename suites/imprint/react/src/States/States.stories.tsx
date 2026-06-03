import type { Meta, StoryObj } from '@storybook/react-vite'
import { Inbox, Search } from 'lucide-react'

import { Button } from '../Button/Button'
import { EmptyState, Skeleton, Spinner } from './States'

/* The States primitives share one Storybook entry. Use the toolbar Theme
   control to preview light + dark. */
const meta = {
  component: EmptyState,
  title: 'Components/States',
  args: {
    title: 'No notes match'
  }
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen empty-result card. */
export const Empty: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <EmptyState icon={Inbox} title="No notes match" description="Try fewer filters." />
    </div>
  )
}

/** Empty state with an action affordance. */
export const EmptyWithAction: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <EmptyState
        icon={Search}
        title="No results"
        description="Nothing matched your search."
        action={
          <Button variant="secondary" size="md">
            Clear search
          </Button>
        }
      />
    </div>
  )
}

/** The specimen skeleton rows. */
export const SkeletonBlock: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: 240 }}>
      <Skeleton width="80%" />
      <Skeleton width="95%" />
      <Skeleton width="65%" />
    </div>
  )
}

/** A circular skeleton (avatar placeholder) beside text lines. */
export const SkeletonCard: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', gap: 12, width: 240 }}>
      <Skeleton circle width={40} height={40} />
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 9 }}>
        <Skeleton width="70%" />
        <Skeleton width="90%" />
      </div>
    </div>
  )
}

/** Token-colored spinner in three sizes. */
export const Spinners: Story = {
  render: () => (
    <div style={{ alignItems: 'center', display: 'flex', gap: 24 }}>
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  )
}

/** The full specimen row: empty card next to a skeleton group. */
export const Specimen: Story = {
  render: () => (
    <div style={{ alignItems: 'stretch', display: 'flex', gap: 32, width: 520 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <EmptyState icon={Inbox} title="No notes match" description="Try fewer filters." />
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: 9,
          justifyContent: 'center',
          minWidth: 200
        }}
      >
        <Skeleton width="80%" />
        <Skeleton width="95%" />
        <Skeleton width="65%" />
      </div>
    </div>
  )
}
