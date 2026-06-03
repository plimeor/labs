import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'

import { Breadcrumb } from './Breadcrumb'

afterEach(() => {
  cleanup()
})

const items = [
  { href: '/vault', label: 'Vault' },
  { href: '/vault/field', label: 'Field' },
  { label: 'Field notes — March' }
]

describe('Breadcrumb', () => {
  test('renders a navigation landmark with the default accessible name', () => {
    render(<Breadcrumb items={items} />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeDefined()
  })

  test('honors a custom landmark label', () => {
    render(<Breadcrumb items={items} label="You are here" />)
    expect(screen.getByRole('navigation', { name: 'You are here' })).toBeDefined()
  })

  test('renders navigable crumbs as links with hrefs', () => {
    render(<Breadcrumb items={items} />)
    const vault = screen.getByRole('link', { name: 'Vault' }) as HTMLAnchorElement
    const field = screen.getByRole('link', { name: 'Field' }) as HTMLAnchorElement
    expect(vault.getAttribute('href')).toBe('/vault')
    expect(field.getAttribute('href')).toBe('/vault/field')
  })

  test('marks the last item as the current page and not a link', () => {
    render(<Breadcrumb items={items} />)
    const current = screen.getByText('Field notes — March')
    expect(current.getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('link', { name: 'Field notes — March' })).toBeNull()
  })

  test('respects an explicit current flag on a non-trailing item', () => {
    render(
      <Breadcrumb
        items={[
          { href: '/vault', label: 'Vault' },
          { current: true, href: '/vault/field', label: 'Field' },
          { href: '/vault/field/note', label: 'Note' }
        ]}
      />
    )
    const current = screen.getByText('Field')
    expect(current.getAttribute('aria-current')).toBe('page')
    expect(current.dataset.current).toBe('true')
    // The trailing item is not flagged current, so it remains a link.
    expect(screen.getByRole('link', { name: 'Note' })).toBeDefined()
    // The explicitly-current item is rendered as text, not a link.
    expect(screen.queryByRole('link', { name: 'Field' })).toBeNull()
  })

  test('renders one fewer separator than crumbs and hides them from a11y', () => {
    const { container } = render(<Breadcrumb items={items} />)
    const separators = container.querySelectorAll('li[aria-hidden="true"]')
    expect(separators.length).toBe(items.length - 1)
  })

  test('forwards a ref to the underlying nav element', () => {
    let node: HTMLElement | null = null
    render(
      <Breadcrumb
        items={items}
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('NAV')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Breadcrumb items={items} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
