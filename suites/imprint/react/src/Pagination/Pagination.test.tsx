import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Pagination } from './Pagination'

afterEach(() => {
  cleanup()
})

// count 120 / pageSize 10 => 12 pages, matching the specimen.
const renderPagination = (props: Partial<Parameters<typeof Pagination>[0]> = {}) =>
  render(<Pagination count={120} pageSize={10} {...props} />)

describe('Pagination', () => {
  test('renders a navigation landmark with the accessible label', () => {
    renderPagination()
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeDefined()
  })

  test('marks the active page with aria-current', () => {
    renderPagination({ defaultPage: 2 })
    const active = screen.getByRole('button', { name: 'page 2' })
    expect(active.getAttribute('aria-current')).toBe('page')
    // Inactive pages are not marked current.
    expect(screen.getByRole('button', { name: 'page 1' }).getAttribute('aria-current')).toBeNull()
  })

  test('exposes the selected state via data-selected', () => {
    renderPagination({ defaultPage: 2 })
    expect(screen.getByRole('button', { name: 'page 2' }).hasAttribute('data-selected')).toBe(true)
    expect(screen.getByRole('button', { name: 'page 1' }).hasAttribute('data-selected')).toBe(false)
  })

  test('renders an ellipsis when pages are truncated', () => {
    renderPagination({ defaultPage: 2 })
    // 12 pages with default sibling/boundary counts collapses into an ellipsis.
    expect(screen.getByText('…')).toBeDefined()
  })

  test('clicking a page selects it and reports the change', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    renderPagination({ defaultPage: 1, onPageChange: details => changes.push(details.page) })

    await user.click(screen.getByRole('button', { name: 'page 3' }))

    expect(changes.at(-1)).toBe(3)
    expect(screen.getByRole('button', { name: 'page 3' }).getAttribute('aria-current')).toBe('page')
  })

  test('the previous-page trigger advances backwards via the next/prev edges', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    renderPagination({ defaultPage: 3, onPageChange: details => changes.push(details.page) })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(changes.at(-1)).toBe(4)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(changes.at(-1)).toBe(3)
  })

  test('disables the previous-page trigger on the first page', () => {
    renderPagination({ defaultPage: 1 })
    const prev = screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(prev.hasAttribute('data-disabled')).toBe(true)
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('disables the next-page trigger on the last page', () => {
    renderPagination({ defaultPage: 12 })
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(next.hasAttribute('data-disabled')).toBe(true)
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('a disabled edge trigger does not change the page', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    renderPagination({ defaultPage: 1, onPageChange: details => changes.push(details.page) })

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(changes).toEqual([])
  })

  test('navigates by keyboard (focus + Enter activates a page)', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    renderPagination({ defaultPage: 1, onPageChange: details => changes.push(details.page) })

    const page2 = screen.getByRole('button', { name: 'page 2' })
    page2.focus()
    expect(page2).toBe(document.activeElement as HTMLElement)

    await user.keyboard('{Enter}')
    expect(changes.at(-1)).toBe(2)
  })

  test('honors the controlled page prop', () => {
    const { rerender } = render(<Pagination count={120} pageSize={10} page={1} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'page 1' }).getAttribute('aria-current')).toBe('page')

    rerender(<Pagination count={120} pageSize={10} page={5} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'page 5' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'page 1' }).getAttribute('aria-current')).toBeNull()
  })

  test('forwards a ref to the underlying nav element', () => {
    let node: HTMLElement | null = null
    render(
      <Pagination
        count={120}
        pageSize={10}
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
        <Pagination count={120} pageSize={10} defaultPage={2} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
