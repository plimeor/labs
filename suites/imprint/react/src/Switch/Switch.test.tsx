import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Switch } from './Switch'

afterEach(() => {
  cleanup()
})

// Ark's Switch renders a visually-hidden checkbox as the accessible control.
const getInput = () => screen.getByRole('checkbox') as HTMLInputElement

describe('Switch', () => {
  test('renders its label', () => {
    render(<Switch>Notifications</Switch>)
    expect(screen.getByText('Notifications')).toBeDefined()
  })

  test('is unchecked by default', () => {
    render(<Switch>Notifications</Switch>)
    expect(getInput().checked).toBe(false)
  })

  test('honors defaultChecked', () => {
    render(<Switch defaultChecked>Notifications</Switch>)
    expect(getInput().checked).toBe(true)
  })

  test('toggles via keyboard (focus + Space) and updates the accessible checked state', async () => {
    const user = userEvent.setup()
    const changes: boolean[] = []
    render(<Switch onCheckedChange={d => changes.push(d.checked)}>Notifications</Switch>)

    const input = getInput()
    expect(screen.getByRole('checkbox', { checked: false })).toBe(input)

    await user.tab()
    expect(input).toBe(document.activeElement as HTMLInputElement)

    await user.keyboard(' ')
    expect(input.checked).toBe(true)
    expect(screen.getByRole('checkbox', { checked: true })).toBe(input)
    expect(changes.at(-1)).toBe(true)

    await user.keyboard(' ')
    expect(input.checked).toBe(false)
    expect(screen.getByRole('checkbox', { checked: false })).toBe(input)
    expect(changes.at(-1)).toBe(false)
  })

  test('toggles on click', async () => {
    const user = userEvent.setup()
    render(<Switch>Notifications</Switch>)
    await user.click(screen.getByText('Notifications'))
    expect(getInput().checked).toBe(true)
  })

  test('disabled blocks interaction', async () => {
    const user = userEvent.setup()
    const changes: boolean[] = []
    render(
      <Switch disabled onCheckedChange={d => changes.push(d.checked)}>
        Notifications
      </Switch>
    )
    const input = getInput()
    expect(input.disabled).toBe(true)
    await user.click(screen.getByText('Notifications'))
    expect(input.checked).toBe(false)
    expect(changes).toEqual([])
  })

  test('forwards a ref to the underlying label element', () => {
    let node: HTMLLabelElement | null = null
    render(
      <Switch
        ref={el => {
          node = el
        }}
      >
        Notifications
      </Switch>
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('LABEL')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Switch defaultChecked>On</Switch>
        <Switch>Off</Switch>
        <Switch defaultChecked disabled>
          Disabled
        </Switch>
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
