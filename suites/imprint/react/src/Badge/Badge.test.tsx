import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { CheckCheck } from 'lucide-react'

import { Badge } from './Badge'

afterEach(() => {
  cleanup()
})

describe('Badge', () => {
  test('renders its label', () => {
    render(<Badge>Approved</Badge>)
    expect(screen.getByText('Approved')).toBeDefined()
  })

  test('defaults to the neutral variant', () => {
    const { container } = render(<Badge>Rolled back</Badge>)
    const badge = container.querySelector('span')
    expect(badge?.dataset.variant).toBe('neutral')
  })

  test('renders the requested variant via data-variant', () => {
    const { container } = render(<Badge variant="danger">Rejected</Badge>)
    const badge = container.querySelector('span')
    expect(badge?.dataset.variant).toBe('danger')
  })

  test('renders the default glyph for the variant', () => {
    const { container } = render(<Badge variant="success">Approved</Badge>)
    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
    // Glyph is decorative — it must be hidden from the accessibility tree.
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  test('allows overriding the glyph', () => {
    const { container } = render(
      <Badge variant="success" icon={CheckCheck}>
        Applied
      </Badge>
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  test('omits the glyph when icon is null', () => {
    const { container } = render(<Badge icon={null}>Draft</Badge>)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('Draft')).toBeDefined()
  })

  test('forwards a ref to the underlying span element', () => {
    let node: HTMLSpanElement | null = null
    render(
      <Badge
        ref={el => {
          node = el
        }}
      >
        Ref
      </Badge>
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('SPAN')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Badge variant="accent">Proposed</Badge>
        <Badge variant="warning">Pending review</Badge>
        <Badge variant="success">Approved</Badge>
        <Badge variant="danger">Rejected</Badge>
        <Badge variant="neutral">Rolled back</Badge>
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
