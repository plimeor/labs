import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'

import { Progress } from './Progress'

afterEach(() => {
  cleanup()
})

describe('Progress', () => {
  test('renders a progressbar with the determinate value wired to aria', () => {
    render(<Progress label="Indexing" value={72} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('72')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('data-state')).toBe('loading')
  })

  test('renders the formatted value text and the label', () => {
    render(<Progress label="Indexing" value={72} />)
    expect(screen.getByText('Indexing')).toBeDefined()
    expect(screen.getByText('72%')).toBeDefined()
  })

  test('reports the complete state at the max value', () => {
    render(<Progress label="Done" value={100} />)
    expect(screen.getByRole('progressbar').getAttribute('data-state')).toBe('complete')
  })

  test('indeterminate drops aria-valuenow and marks the state', () => {
    render(<Progress label="Syncing" value={null} showValueText={false} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(bar.getAttribute('data-state')).toBe('indeterminate')
  })

  test('respects a custom min/max range when formatting the value', () => {
    render(<Progress label="Loaded" value={5} min={0} max={10} formatOptions={{ style: 'percent' }} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemax')).toBe('10')
    expect(bar.getAttribute('aria-valuenow')).toBe('5')
    expect(screen.getByText('50%')).toBeDefined()
  })

  test('circular variant also exposes the progressbar role, value, and centered value text', () => {
    render(<Progress variant="circular" value={72} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('72')
    expect(bar.tagName.toLowerCase()).toBe('svg')
    expect(screen.getByText('72%')).toBeDefined()
  })

  test('forwards a ref to the root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Progress
        label="Indexing"
        value={72}
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations (linear + circular, determinate + indeterminate)', async () => {
    const { container } = render(
      <main>
        <Progress variant="linear" label="Indexing" value={72} />
        <Progress variant="linear" label="Syncing" value={null} showValueText={false} />
        <Progress variant="circular" value={72} />
        <Progress variant="circular" value={null} showValueText={false} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
