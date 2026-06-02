import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { type TreeNode, TreeView } from './TreeView'

afterEach(() => {
  cleanup()
})

const data: TreeNode[] = [
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

const renderTree = (props?: Partial<React.ComponentProps<typeof TreeView>>) =>
  render(<TreeView label="Files" data={data} {...props} />)

describe('TreeView', () => {
  test('renders an accessible tree with its label', () => {
    renderTree({ defaultExpandedValue: ['vault'] })
    const tree = screen.getByRole('tree', { name: 'Files' })
    expect(tree).toBeDefined()
  })

  test('renders branch and leaf treeitems', () => {
    renderTree({ defaultExpandedValue: ['vault'] })
    expect(screen.getByText('Vault')).toBeDefined()
    expect(screen.getByText('Field notes — March')).toBeDefined()
    expect(screen.getByText('Reading queue')).toBeDefined()
  })

  test('a collapsed branch hides its children', () => {
    renderTree({ defaultExpandedValue: [] })
    const branch = screen.getByText('Vault').closest('[role="treeitem"]') as HTMLElement
    expect(branch.getAttribute('aria-expanded')).toBe('false')
    // Ark keeps the content mounted but hides it (group is removed from a11y tree).
    const group = branch.querySelector('[role="group"]') as HTMLElement
    expect(group.hidden).toBe(true)
  })

  test('exposes aria-expanded on the branch', () => {
    renderTree({ defaultExpandedValue: ['vault'] })
    const branch = screen.getByText('Vault').closest('[role="treeitem"]')
    expect(branch).not.toBeNull()
    expect(branch?.getAttribute('aria-expanded')).toBe('true')
  })

  test('expands a branch on click and reveals children', async () => {
    const user = userEvent.setup()
    renderTree({ defaultExpandedValue: [] })
    const branch = screen.getByText('Vault').closest('[role="treeitem"]') as HTMLElement
    expect(branch.getAttribute('aria-expanded')).toBe('false')

    await user.click(screen.getByText('Vault'))

    await waitFor(() => {
      expect(branch.getAttribute('aria-expanded')).toBe('true')
    })
    const group = branch.querySelector('[role="group"]') as HTMLElement
    expect(group.hidden).toBe(false)
    expect(within(group).getByText('Field notes — March')).toBeDefined()
  })

  test('collapses an expanded branch on click', async () => {
    const user = userEvent.setup()
    renderTree({ defaultExpandedValue: ['vault'] })
    const branch = screen.getByText('Vault').closest('[role="treeitem"]') as HTMLElement
    expect(branch.getAttribute('aria-expanded')).toBe('true')

    await user.click(screen.getByText('Vault'))

    await waitFor(() => {
      expect(branch.getAttribute('aria-expanded')).toBe('false')
    })
  })

  test('selects a leaf item on click and marks it aria-selected', async () => {
    const user = userEvent.setup()
    const selections: string[][] = []
    renderTree({
      defaultExpandedValue: ['vault'],
      onSelectionChange: d => selections.push(d.selectedValue)
    })

    const leaf = screen.getByText('Field notes — March').closest('[role="treeitem"]') as HTMLElement
    expect(leaf.getAttribute('aria-selected')).toBe('false')

    await user.click(screen.getByText('Field notes — March'))

    await waitFor(() => {
      expect(leaf.getAttribute('aria-selected')).toBe('true')
    })
    expect(selections.at(-1)).toEqual(['field-notes'])
  })

  test('honors defaultSelectedValue', () => {
    renderTree({ defaultExpandedValue: ['vault'], defaultSelectedValue: ['field-notes'] })
    const leaf = screen.getByText('Field notes — March').closest('[role="treeitem"]') as HTMLElement
    expect(leaf.getAttribute('aria-selected')).toBe('true')
    expect(leaf.getAttribute('data-selected')).not.toBeNull()
  })

  test('keyboard: focus the tree, ArrowDown moves roving focus to the first child', async () => {
    const user = userEvent.setup()
    renderTree({ defaultExpandedValue: ['vault'] })

    const branch = screen.getByText('Vault').closest('[role="treeitem"]') as HTMLElement
    const branchControl = branch.querySelector('[role="button"]') as HTMLElement

    await user.tab()
    // The tree exposes a single tab stop on the focused node.
    expect(document.activeElement === branchControl || branch.contains(document.activeElement)).toBe(true)

    await user.keyboard('{ArrowDown}')

    await waitFor(() => {
      const leaf = screen.getByText('Field notes — March').closest('[role="treeitem"]') as HTMLElement
      expect(leaf.getAttribute('data-focus')).not.toBeNull()
    })
  })

  test('keyboard: ArrowRight expands a collapsed branch', async () => {
    const user = userEvent.setup()
    renderTree({ defaultExpandedValue: [] })
    const branch = screen.getByText('Vault').closest('[role="treeitem"]') as HTMLElement

    await user.tab()
    await user.keyboard('{ArrowRight}')

    await waitFor(() => {
      expect(branch.getAttribute('aria-expanded')).toBe('true')
    })
  })

  test('a disabled node is marked aria-disabled and not selected on click', async () => {
    const user = userEvent.setup()
    const selections: string[][] = []
    render(
      <TreeView
        label="W"
        defaultExpandedValue={['root']}
        onSelectionChange={d => selections.push(d.selectedValue)}
        data={[
          {
            children: [{ disabled: true, label: 'Locked', value: 'locked' }],
            label: 'Root',
            value: 'root'
          }
        ]}
      />
    )
    const leaf = screen.getByText('Locked').closest('[role="treeitem"]') as HTMLElement
    expect(leaf.getAttribute('aria-disabled')).toBe('true')

    await user.click(screen.getByText('Locked'))
    expect(selections).toEqual([])
  })

  test('forwards a ref to the root element', () => {
    let node: HTMLDivElement | null = null
    renderTree({
      ref: el => {
        node = el
      }
    })
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <TreeView label="Vault" data={data} defaultExpandedValue={['vault']} defaultSelectedValue={['field-notes']} />
      </main>
    )
    const tree = within(container).getByRole('tree')
    expect(tree).toBeDefined()
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
