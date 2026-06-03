import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Steps } from './Steps'

afterEach(() => {
  cleanup()
})

const items = [{ label: 'Proposed' }, { label: 'Reviewed' }, { label: 'Applied' }]

describe('Steps', () => {
  test('renders a labelled group with a button per step', () => {
    render(<Steps items={items} defaultStep={2} aria-label="Review progress" />)
    expect(screen.getByRole('group', { name: 'Review progress' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Proposed' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reviewed' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Applied' })).toBeDefined()
  })

  test('marks the current step and its predecessors complete', () => {
    render(<Steps items={items} defaultStep={2} />)
    const proposed = screen.getByRole('button', { name: 'Proposed' })
    const reviewed = screen.getByRole('button', { name: 'Reviewed' })
    const applied = screen.getByRole('button', { name: 'Applied' })

    // Steps before the current one are complete.
    expect(proposed.hasAttribute('data-complete')).toBe(true)
    expect(reviewed.hasAttribute('data-complete')).toBe(true)
    // The current step is flagged current, the rest are not.
    expect(applied.hasAttribute('data-current')).toBe(true)
    expect(proposed.hasAttribute('data-current')).toBe(false)
  })

  test('exposes the current step via aria-current on the item', () => {
    render(<Steps items={items} defaultStep={0} />)
    const proposed = screen.getByRole('button', { name: 'Proposed' })
    // aria-current="step" rides on the item wrapper — the canonical progress
    // stepper semantic — while upcoming steps are flagged incomplete.
    expect(proposed.closest('[data-part="item"]')?.getAttribute('aria-current')).toBe('step')

    const applied = screen.getByRole('button', { name: 'Applied' })
    expect(applied.closest('[data-part="item"]')?.getAttribute('aria-current')).toBeNull()
    expect(applied.hasAttribute('data-incomplete')).toBe(true)
  })

  test('activating a trigger moves the current step', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    render(<Steps items={items} defaultStep={0} onStepChange={d => changes.push(d.step)} />)

    await user.click(screen.getByRole('button', { name: 'Applied' }))
    expect(changes.at(-1)).toBe(2)
    expect(screen.getByRole('button', { name: 'Applied' }).hasAttribute('data-current')).toBe(true)
  })

  test('supports keyboard activation of a trigger', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    render(<Steps items={items} defaultStep={0} onStepChange={d => changes.push(d.step)} />)

    const reviewed = screen.getByRole('button', { name: 'Reviewed' })
    reviewed.focus()
    expect(reviewed).toBe(document.activeElement as HTMLElement)
    await user.keyboard('{Enter}')
    expect(changes.at(-1)).toBe(1)
  })

  test('reveals only the current step content panel', () => {
    render(
      <Steps
        defaultStep={1}
        items={[
          { content: 'proposed body', label: 'Proposed' },
          { content: 'reviewed body', label: 'Reviewed' },
          { content: 'applied body', label: 'Applied' }
        ]}
      />
    )
    const current = screen.getByText('reviewed body').closest('[data-part="content"]') as HTMLElement
    expect(current.getAttribute('data-state')).toBe('open')
    const other = screen.getByText('proposed body').closest('[data-part="content"]') as HTMLElement
    expect(other.getAttribute('data-state')).toBe('closed')
  })

  test('forwards a ref to the root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Steps
        items={items}
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
        <Steps items={items} defaultStep={2} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
