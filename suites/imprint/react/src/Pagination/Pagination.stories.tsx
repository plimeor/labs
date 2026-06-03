import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Pagination } from './Pagination'

const meta = {
  component: Pagination,
  title: 'Components/Pagination',
  args: {
    count: 120,
    pageSize: 10
  },
  argTypes: {
    boundaryCount: { control: 'number' },
    count: { control: 'number' },
    defaultPage: { control: 'number' },
    pageSize: { control: 'number' },
    siblingCount: { control: 'number' }
  }
} satisfies Meta<typeof Pagination>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The specimen: 12 pages, page 2 active, leading numbers then an ellipsis to
 * the last page. Use the toolbar Theme control to preview light + dark.
 */
export const Specimen: Story = {
  args: { count: 120, defaultPage: 2, pageSize: 10 }
}

/** First page — the previous-page edge trigger is disabled. */
export const FirstPage: Story = {
  args: { count: 120, defaultPage: 1, pageSize: 10 }
}

/** Last page — the next-page edge trigger is disabled. */
export const LastPage: Story = {
  args: { count: 120, defaultPage: 12, pageSize: 10 }
}

/** A middle page surrounded by ellipses on both sides. */
export const Middle: Story = {
  args: { count: 200, defaultPage: 10, pageSize: 10 }
}

/** Few pages — no truncation, every page shown. */
export const Compact: Story = {
  args: { count: 40, defaultPage: 2, pageSize: 10 }
}

/** Fully controlled page state. */
export const Controlled: Story = {
  args: { count: 120, pageSize: 10 },
  render: args => {
    const [page, setPage] = useState(3)
    return <Pagination {...args} page={page} onPageChange={details => setPage(details.page)} />
  }
}
