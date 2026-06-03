import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { Inbox } from 'lucide-react'

import { EmptyState, Skeleton, Spinner } from './States'

afterEach(() => {
  cleanup()
})

describe('EmptyState', () => {
  test('renders its title and description', () => {
    render(<EmptyState icon={Inbox} title="No notes match" description="Try fewer filters." />)
    expect(screen.getByText('No notes match')).toBeDefined()
    expect(screen.getByText('Try fewer filters.')).toBeDefined()
  })

  test('renders an optional action', () => {
    render(<EmptyState title="No results" action={<button type="button">Clear</button>} />)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDefined()
  })

  test('omits the description when not provided', () => {
    render(<EmptyState title="Empty" />)
    expect(screen.queryByText('Try fewer filters.')).toBeNull()
  })

  test('forwards a ref to the underlying div element', () => {
    let node: HTMLDivElement | null = null
    render(
      <EmptyState
        title="Empty"
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <EmptyState icon={Inbox} title="No notes match" description="Try fewer filters." />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})

describe('Skeleton', () => {
  test('renders and is hidden from assistive tech by default', () => {
    const { container } = render(<Skeleton width="80%" />)
    const block = container.querySelector('div')
    expect(block).not.toBeNull()
    expect(block?.getAttribute('aria-hidden')).toBe('true')
  })

  test('applies the requested width and height', () => {
    const { container } = render(<Skeleton width={120} height={11} />)
    const block = container.querySelector('div') as HTMLElement
    expect(block.style.width).toBe('120px')
    expect(block.style.height).toBe('11px')
  })

  test('marks the circle variant for token styling', () => {
    const { container } = render(<Skeleton circle width={40} height={40} />)
    const block = container.querySelector('div') as HTMLElement
    expect(block.hasAttribute('data-circle')).toBe(true)
  })

  test('forwards a ref to the underlying div element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Skeleton
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Skeleton width="80%" />
        <Skeleton width="95%" />
        <Skeleton circle width={40} height={40} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})

describe('Spinner', () => {
  test('exposes a polite status with a default accessible label', () => {
    render(<Spinner />)
    const status = screen.getByRole('status', { name: 'Loading' })
    expect(status.getAttribute('aria-live')).toBe('polite')
  })

  test('honors a custom label', () => {
    render(<Spinner label="Saving note" />)
    expect(screen.getByRole('status', { name: 'Saving note' })).toBeDefined()
  })

  test('reflects the requested size via data-size', () => {
    render(<Spinner size="lg" />)
    expect(screen.getByRole('status').dataset.size).toBe('lg')
  })

  test('defaults to the md size', () => {
    render(<Spinner />)
    expect(screen.getByRole('status').dataset.size).toBe('md')
  })

  test('forwards a ref to the underlying span element', () => {
    let node: HTMLSpanElement | null = null
    render(
      <Spinner
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('SPAN')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" label="Saving" />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
