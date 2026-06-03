import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Tooltip } from './Tooltip'

afterEach(() => {
  cleanup()
})

describe('Tooltip', () => {
  test('renders its trigger', () => {
    render(
      <Tooltip content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    expect(screen.getByRole('button', { name: 'Roll back' })).toBeDefined()
  })

  test('is not exposed when closed', () => {
    render(
      <Tooltip content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('shows the bubble when open by default', () => {
    render(
      <Tooltip defaultOpen content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    expect(screen.getByRole('tooltip')).toBeDefined()
    expect(screen.getByText('Roll back this change')).toBeDefined()
  })

  test('wires the trigger to the content via aria-describedby when open', () => {
    render(
      <Tooltip defaultOpen content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    const trigger = screen.getByRole('button', { name: 'Roll back' })
    const tooltip = screen.getByRole('tooltip')
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id)
  })

  test('opens on focus and closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip openDelay={0} closeDelay={0} content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).toBeNull()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Roll back' })).toBe(document.activeElement as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeDefined()
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })

  test('reports open-state changes through onOpenChange', async () => {
    const user = userEvent.setup()
    const changes: boolean[] = []
    render(
      <Tooltip openDelay={0} closeDelay={0} onOpenChange={open => changes.push(open)} content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    await user.tab()
    await waitFor(() => {
      expect(changes.at(-1)).toBe(true)
    })
  })

  test('disabled never opens the tooltip', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip disabled openDelay={0} closeDelay={0} content="Roll back this change">
        <button type="button">Roll back</button>
      </Tooltip>
    )
    await user.tab()
    await user.hover(screen.getByRole('button', { name: 'Roll back' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('forwards a ref to the content element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Tooltip
        defaultOpen
        content="Roll back this change"
        ref={el => {
          node = el
        }}
      >
        <button type="button">Roll back</button>
      </Tooltip>
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    render(
      <main>
        <Tooltip defaultOpen content="Roll back this change">
          <button type="button">Roll back</button>
        </Tooltip>
      </main>
    )
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeDefined()
    })
    // The content is portaled to document.body, so the page-structure `region`
    // rule (every node inside a landmark) fires on the harness, not the
    // component. Disable that page-level best-practice rule and assert the
    // tooltip's own accessibility.
    const results = await axe.run(document.body, { rules: { region: { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
