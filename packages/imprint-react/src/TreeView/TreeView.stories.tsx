import type { Meta, StoryObj } from '@storybook/react-vite'

import { type TreeNode, TreeView } from './TreeView'

const meta = {
  component: TreeView,
  title: 'Components/TreeView',
  args: {
    label: 'Vault'
  },
  decorators: [
    Story => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    )
  ],
  parameters: {
    layout: 'centered'
  }
} satisfies Meta<typeof TreeView>

export default meta
type Story = StoryObj<typeof meta>

/** The specimen tree: a single Vault folder with its notes inside. */
const vault: TreeNode[] = [
  {
    label: 'Vault',
    value: 'vault',
    children: [
      { label: 'Field notes — March', value: 'field-notes' },
      { label: 'Index architecture', value: 'index-architecture' },
      { children: [{ label: '2024 notes', value: 'archive-2024' }], label: 'Archive', value: 'archive' },
      { label: 'Reading queue', value: 'reading-queue' }
    ]
  }
]

/**
 * The hero specimen: the Vault expanded with "Field notes — March" selected
 * (accent fill). Use the toolbar Theme control to preview light + dark.
 */
export const Default: Story = {
  args: {
    data: vault,
    defaultExpandedValue: ['vault'],
    defaultSelectedValue: ['field-notes']
  }
}

/** Fully collapsed — only the Vault branch shows, chevron pointing right. */
export const Collapsed: Story = {
  args: {
    data: vault,
    defaultExpandedValue: []
  }
}

/** A deeper, multi-branch tree with nested folders expanded. */
export const Nested: Story = {
  args: {
    defaultExpandedValue: ['workspace', 'projects'],
    defaultSelectedValue: ['imprint'],
    label: 'Workspace',
    data: [
      {
        label: 'Workspace',
        value: 'workspace',
        children: [
          {
            label: 'Projects',
            value: 'projects',
            children: [
              { label: 'imprint.md', value: 'imprint' },
              { label: 'atlas.md', value: 'atlas' }
            ]
          },
          {
            children: [{ disabled: true, label: 'old-notes.md', value: 'old' }],
            label: 'Archive',
            value: 'archive'
          },
          { label: 'README.md', value: 'readme' }
        ]
      }
    ]
  }
}

/** Multiple selection mode. */
export const MultiSelect: Story = {
  args: {
    data: vault,
    defaultExpandedValue: ['vault'],
    defaultSelectedValue: ['field-notes', 'reading-queue'],
    selectionMode: 'multiple'
  }
}

/** Light and dark side by side — flip the toolbar Theme to compare. */
export const Showcase: Story = {
  args: { data: vault, label: 'Vault' },
  render: () => (
    <div style={{ display: 'flex', gap: 40 }}>
      <div data-theme="light" style={{ background: 'var(--bg-canvas)', borderRadius: 11, padding: 20, width: 240 }}>
        <TreeView label="Vault" data={vault} defaultExpandedValue={['vault']} defaultSelectedValue={['field-notes']} />
      </div>
      <div data-theme="dark" style={{ background: 'var(--bg-canvas)', borderRadius: 11, padding: 20, width: 240 }}>
        <TreeView label="Vault" data={vault} defaultExpandedValue={['vault']} defaultSelectedValue={['field-notes']} />
      </div>
    </div>
  )
}
