import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bell, Code, Eye, GitPullRequest, History, Inbox } from 'lucide-react'

import { Tabs } from './Tabs'

const meta = {
  component: Tabs,
  title: 'Components/Tabs',
  args: {
    size: 'md',
    variant: 'underline'
  },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md']
    },
    variant: {
      control: 'inline-radio',
      options: ['underline', 'pill']
    }
  }
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The hero specimen: underline tabs with a gliding indicator and a revealed
 * panel. The fourth tab is disabled. Use the toolbar Theme control for dark.
 */
export const Underline: Story = {
  args: {
    'aria-label': 'Note view',
    defaultValue: 'preview',
    items: [
      {
        content: (
          <span>
            <b>Preview</b> — the rendered view of your note, exactly as readers see it.
          </span>
        ),
        label: 'Preview',
        value: 'preview'
      },
      {
        content: (
          <span>
            <b>Source</b> — the raw markdown with all syntax visible and editable.
          </span>
        ),
        label: 'Source',
        value: 'source'
      },
      {
        content: (
          <span>
            <b>History</b> — every revision, diffed and restorable.
          </span>
        ),
        label: 'History',
        value: 'history'
      },
      { disabled: true, label: 'Backlinks', value: 'backlinks' }
    ]
  }
}

/** Underline tabs with leading icons and trailing tnum count badges. */
export const WithIconsAndCounts: Story = {
  args: {
    'aria-label': 'Workspace',
    defaultValue: 'inbox',
    items: [
      { count: 12, icon: Inbox, label: 'Inbox', value: 'inbox' },
      { count: 3, icon: GitPullRequest, label: 'Changes', value: 'changes' },
      { count: 28, icon: Bell, label: 'Activity', value: 'activity' }
    ]
  }
}

/** Contained pill variant with a soft sliding thumb. */
export const Pill: Story = {
  args: {
    'aria-label': 'Editor mode',
    defaultValue: 'preview',
    variant: 'pill',
    items: [
      { icon: Eye, label: 'Preview', value: 'preview' },
      { icon: Code, label: 'Source', value: 'source' },
      { icon: History, label: 'History', value: 'history' }
    ]
  }
}

/** Small size — both variants side by side. */
export const Small: Story = {
  args: {
    'aria-label': 'Range',
    defaultValue: 'day',
    size: 'sm',
    items: [
      { label: 'Day', value: 'day' },
      { label: 'Week', value: 'week' },
      { label: 'Month', value: 'month' }
    ]
  }
}

/** Manual activation — tabs only select on Enter/Space, not on focus. */
export const ManualActivation: Story = {
  args: {
    activationMode: 'manual',
    'aria-label': 'Note view',
    defaultValue: 'preview',
    items: [
      { icon: Eye, label: 'Preview', value: 'preview' },
      { icon: Code, label: 'Source', value: 'source' },
      { icon: History, label: 'History', value: 'history' }
    ]
  }
}

/** Every key state and size in one frame. Toggle the toolbar Theme for dark. */
export const Showcase: Story = {
  args: { items: [] },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30, maxWidth: 620 }}>
      <Tabs
        aria-label="Note view"
        defaultValue="preview"
        items={[
          {
            content: (
              <span>
                <b>Preview</b> — the rendered view of your note, exactly as readers see it.
              </span>
            ),
            label: 'Preview',
            value: 'preview'
          },
          {
            content: (
              <span>
                <b>Source</b> — the raw markdown with all syntax visible and editable.
              </span>
            ),
            label: 'Source',
            value: 'source'
          },
          {
            content: (
              <span>
                <b>History</b> — every revision, diffed and restorable.
              </span>
            ),
            label: 'History',
            value: 'history'
          },
          { disabled: true, label: 'Backlinks', value: 'backlinks' }
        ]}
      />
      <Tabs
        aria-label="Workspace"
        defaultValue="inbox"
        items={[
          { count: 12, icon: Inbox, label: 'Inbox', value: 'inbox' },
          { count: 3, icon: GitPullRequest, label: 'Changes', value: 'changes' },
          { count: 28, icon: Bell, label: 'Activity', value: 'activity' }
        ]}
      />
      <Tabs
        variant="pill"
        aria-label="Editor mode"
        defaultValue="preview"
        items={[
          { icon: Eye, label: 'Preview', value: 'preview' },
          { icon: Code, label: 'Source', value: 'source' },
          { icon: History, label: 'History', value: 'history' }
        ]}
      />
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 28 }}>
        <Tabs
          size="sm"
          aria-label="Range (underline)"
          defaultValue="day"
          items={[
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' }
          ]}
        />
        <Tabs
          variant="pill"
          size="sm"
          aria-label="Range (pill)"
          defaultValue="day"
          items={[
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' }
          ]}
        />
      </div>
    </div>
  )
}
