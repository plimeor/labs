import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'

import { Avatar } from './Avatar'

afterEach(() => {
  cleanup()
})

describe('Avatar', () => {
  test('renders the initials fallback', () => {
    render(<Avatar fallback="AK" />)
    expect(screen.getByText('AK')).toBeDefined()
  })

  test('defaults to the md size and accent tone', () => {
    const { container } = render(<Avatar fallback="P" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset.size).toBe('md')
    expect(root.dataset.tone).toBe('accent')
  })

  test('reflects the requested size and tone via data attributes', () => {
    const { container } = render(<Avatar fallback="P" size="sm" tone="neutral" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset.size).toBe('sm')
    expect(root.dataset.tone).toBe('neutral')
  })

  test('renders the image with its alt text when a src is given', () => {
    render(<Avatar alt="Ada Lovelace" fallback="AL" src="https://example.test/ada.png" />)
    const img = screen.getByAltText('Ada Lovelace') as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('https://example.test/ada.png')
  })

  test('keeps the initials fallback available before the image loads', () => {
    render(<Avatar alt="Ada Lovelace" fallback="AL" src="https://example.test/ada.png" />)
    // Ark keeps the fallback in the DOM and hides the image until it loads.
    expect(screen.getByText('AL')).toBeDefined()
  })

  test('renders a presence dot only when status is set', () => {
    const { container, rerender } = render(<Avatar fallback="P" />)
    expect(container.querySelector('[data-status]')).toBeNull()

    rerender(<Avatar fallback="P" status="online" />)
    const dot = container.querySelector('[data-status]') as HTMLElement
    expect(dot).not.toBeNull()
    expect(dot.dataset.status).toBe('online')
    // Decorative — hidden from the accessibility tree.
    expect(dot.getAttribute('aria-hidden')).toBe('true')
  })

  test('forwards a ref to the underlying root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Avatar
        fallback="P"
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('merges a custom className onto the root', () => {
    const { container } = render(<Avatar fallback="P" className="extra" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.classList.contains('extra')).toBe(true)
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Avatar fallback="P" />
        <Avatar fallback="AK" tone="neutral" status="online" />
        <Avatar alt="Ada Lovelace" fallback="AL" src="https://example.test/ada.png" />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
