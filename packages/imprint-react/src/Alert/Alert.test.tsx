import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { Bell } from 'lucide-react'

import { Alert } from './Alert'

afterEach(() => {
  cleanup()
})

describe('Alert', () => {
  test('renders its title', () => {
    render(<Alert title="Index up to date" />)
    expect(screen.getByText('Index up to date')).toBeDefined()
  })

  test('renders an optional description', () => {
    render(<Alert title="Sync failed" description="Working offline" />)
    expect(screen.getByText('Sync failed')).toBeDefined()
    expect(screen.getByText('Working offline')).toBeDefined()
  })

  test('defaults to the info kind', () => {
    render(<Alert title="Up to date" />)
    expect(screen.getByRole('status').dataset.kind).toBe('info')
  })

  test('exposes the requested kind via data-kind', () => {
    render(<Alert kind="warning" title="Heads up" />)
    expect(screen.getByRole('status').dataset.kind).toBe('warning')
  })

  test('uses role=status for non-danger kinds (polite)', () => {
    render(<Alert kind="success" title="Done" />)
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('uses role=alert for the danger kind (assertive)', () => {
    render(<Alert kind="danger" title="Sync failed" />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByRole('alert').dataset.kind).toBe('danger')
  })

  test('honors an explicit role override', () => {
    render(<Alert kind="danger" role="status" title="Sync failed" />)
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('renders a decorative leading glyph (hidden from a11y tree)', () => {
    const { container } = render(<Alert kind="info" title="Up to date" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  test('accepts a custom icon', () => {
    const { container } = render(<Alert icon={Bell} title="Reminder" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  test('forwards a ref to the underlying element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Alert
        title="Ref"
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
        <Alert kind="info" title="Index up to date" />
        <Alert kind="success" title="All changes reviewed" />
        <Alert kind="warning" title="1 unresolved reference" />
        <Alert kind="danger" title="Sync failed — working offline" description="Reconnect to push your edits." />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
