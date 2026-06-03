import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Button } from './Button'

afterEach(() => {
  cleanup()
})

describe('Button', () => {
  test('renders its children', () => {
    render(<Button>Approve change</Button>)
    expect(screen.getByRole('button', { name: 'Approve change' })).toBeDefined()
  })

  test('defaults to the primary variant', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button').dataset.variant).toBe('primary')
  })

  test('renders the requested variant via data-variant', () => {
    render(<Button variant="danger">Delete</Button>)
    expect(screen.getByRole('button').dataset.variant).toBe('danger')
  })

  test('fires the click handler when clicked', async () => {
    const user = userEvent.setup()
    let clicks = 0
    render(<Button onClick={() => clicks++}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(clicks).toBe(1)
  })

  test('disabled blocks the click handler', async () => {
    const user = userEvent.setup()
    let clicks = 0
    render(
      <Button disabled onClick={() => clicks++}>
        Click
      </Button>
    )
    await user.click(screen.getByRole('button'))
    expect(clicks).toBe(0)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  test('forwards a ref to the underlying button element', () => {
    let node: HTMLButtonElement | null = null
    render(
      <Button
        ref={el => {
          node = el
        }}
      >
        Ref
      </Button>
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('BUTTON')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Button variant="primary">Approve change</Button>
        <Button variant="secondary">Link note</Button>
        <Button variant="ghost">Discard</Button>
        <Button variant="danger">Delete</Button>
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
