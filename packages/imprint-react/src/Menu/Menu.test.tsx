import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Menu, type MenuEntry } from './Menu'

afterEach(() => {
  cleanup()
})

const items: MenuEntry[] = [
  { label: 'New note', shortcut: '⌘N', value: 'new' },
  { label: 'Copy link', value: 'copy-link' },
  { type: 'separator' },
  { danger: true, label: 'Delete note', value: 'delete' }
]

const renderMenu = (props: Partial<React.ComponentProps<typeof Menu>> = {}) =>
  render(<Menu trigger={<button type="button">Open</button>} items={items} {...props} />)

describe('Menu', () => {
  test('renders the trigger with menu popup semantics', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  test('is closed by default', () => {
    renderMenu()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('opens when the trigger is clicked and renders the items', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Open' })

    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menuitem', { name: /New note/ })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Delete note' })).toBeDefined()
  })

  test('labels the menu by its trigger', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    await waitFor(() => {
      const menu = screen.getByRole('menu')
      // Ark wires the menu to its trigger via aria-labelledby.
      expect(menu.getAttribute('aria-labelledby')).toBe(trigger.getAttribute('id'))
    })
  })

  test('renders shortcuts and the danger item', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByText('⌘N')).toBeDefined()
    })
    const danger = screen.getByRole('menuitem', { name: 'Delete note' })
    expect(danger.getAttribute('data-danger')).toBe('')
  })

  test('selecting an item fires onSelect with its value and closes the menu', async () => {
    const user = userEvent.setup()
    const selected: string[] = []
    renderMenu({ onSelect: details => selected.push(details.value) })

    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })

    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }))

    expect(selected).toEqual(['copy-link'])
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  test('fires the per-item onSelect handler', async () => {
    const user = userEvent.setup()
    let pinned = 0
    renderMenu({
      items: [{ label: 'Pin note', value: 'pin', onSelect: () => pinned++ }]
    })

    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    await user.click(screen.getByRole('menuitem', { name: 'Pin note' }))

    expect(pinned).toBe(1)
  })

  test('navigates items with the arrow keys', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Open' })

    trigger.focus()
    await user.keyboard('{Enter}')
    // Opening via the keyboard highlights the first item.
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /New note/ }).getAttribute('data-highlighted')).toBe('')
    })

    await user.keyboard('{ArrowDown}')
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Copy link' }).getAttribute('data-highlighted')).toBe('')
    })
    expect(screen.getByRole('menuitem', { name: /New note/ }).getAttribute('data-highlighted')).toBeNull()
  })

  test('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  test('marks disabled items and skips their selection', async () => {
    const user = userEvent.setup()
    const selected: string[] = []
    renderMenu({
      items: [
        { label: 'New note', value: 'new' },
        { disabled: true, label: 'Copy link', value: 'copy-link' }
      ],
      onSelect: details => selected.push(details.value)
    })

    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    const disabled = screen.getByRole('menuitem', { name: 'Copy link' })
    expect(disabled.getAttribute('data-disabled')).toBe('')

    await user.click(disabled)
    expect(selected).toEqual([])
  })

  test('renders labelled groups', async () => {
    const user = userEvent.setup()
    renderMenu({
      items: [
        {
          id: 'note',
          items: [{ label: 'New note', value: 'new' }],
          label: 'Note',
          type: 'group'
        }
      ]
    })
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    const group = screen.getByRole('group')
    expect(group.getAttribute('aria-labelledby')).not.toBeNull()
    expect(screen.getByText('Note')).toBeDefined()
  })

  test('forwards a ref to the content element', async () => {
    const user = userEvent.setup()
    let node: HTMLDivElement | null = null
    renderMenu({
      ref: el => {
        node = el
      }
    })
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(node).not.toBeNull()
    })
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations when open', async () => {
    const user = userEvent.setup()
    render(
      <main>
        <Menu trigger={<button type="button">Note actions</button>} items={items} />
      </main>
    )
    await user.click(screen.getByRole('button', { name: 'Note actions' }))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined()
    })
    // Scope to the portaled menu surface: the page-level `region` best-practice
    // rule does not apply to a positioned overlay that lives at document root.
    const menu = screen.getByRole('menu')
    const results = await axe.run(menu)
    expect(results.violations).toEqual([])
  })
})
