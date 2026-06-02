import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Checkbox } from './Checkbox'

afterEach(() => {
  cleanup()
})

// Ark's Checkbox renders a visually-hidden checkbox as the accessible control.
const getInput = () => screen.getByRole('checkbox') as HTMLInputElement

describe('Checkbox', () => {
  test('renders its label', () => {
    render(<Checkbox>Accept terms</Checkbox>)
    expect(screen.getByText('Accept terms')).toBeDefined()
  })

  test('is unchecked by default', () => {
    render(<Checkbox>Accept terms</Checkbox>)
    expect(getInput().checked).toBe(false)
  })

  test('honors defaultChecked', () => {
    render(<Checkbox defaultChecked>Accept terms</Checkbox>)
    expect(getInput().checked).toBe(true)
  })

  test('reflects the indeterminate state via the data-state machine output', () => {
    render(<Checkbox defaultChecked="indeterminate">Accept terms</Checkbox>)
    // zag surfaces the mixed state as data-state="indeterminate" on every part;
    // the CSS keys the accent fill off of this attribute.
    const label = screen.getByText('Accept terms').closest('label') as HTMLLabelElement
    expect(label.getAttribute('data-state')).toBe('indeterminate')
    // It is not counted as fully checked.
    expect(getInput().checked).toBe(false)
  })

  test('toggling away from indeterminate moves to checked', async () => {
    const user = userEvent.setup()
    const changes: (boolean | 'indeterminate')[] = []
    render(
      <Checkbox defaultChecked="indeterminate" onCheckedChange={d => changes.push(d.checked)}>
        Accept terms
      </Checkbox>
    )
    await user.click(screen.getByText('Accept terms'))
    expect(getInput().checked).toBe(true)
    expect(changes.at(-1)).toBe(true)
  })

  test('toggles via keyboard (focus + Space) and updates the accessible checked state', async () => {
    const user = userEvent.setup()
    const changes: (boolean | 'indeterminate')[] = []
    render(<Checkbox onCheckedChange={d => changes.push(d.checked)}>Accept terms</Checkbox>)

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

  test('toggles on click of the label', async () => {
    const user = userEvent.setup()
    render(<Checkbox>Accept terms</Checkbox>)
    await user.click(screen.getByText('Accept terms'))
    expect(getInput().checked).toBe(true)
  })

  test('disabled blocks interaction', async () => {
    const user = userEvent.setup()
    const changes: (boolean | 'indeterminate')[] = []
    render(
      <Checkbox disabled onCheckedChange={d => changes.push(d.checked)}>
        Accept terms
      </Checkbox>
    )
    const input = getInput()
    expect(input.disabled).toBe(true)
    await user.click(screen.getByText('Accept terms'))
    expect(input.checked).toBe(false)
    expect(changes).toEqual([])
  })

  test('forwards a ref to the underlying label element', () => {
    let node: HTMLLabelElement | null = null
    render(
      <Checkbox
        ref={el => {
          node = el
        }}
      >
        Accept terms
      </Checkbox>
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('LABEL')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Checkbox>Unchecked</Checkbox>
        <Checkbox defaultChecked>Checked</Checkbox>
        <Checkbox defaultChecked="indeterminate">Indeterminate</Checkbox>
        <Checkbox disabled>Disabled</Checkbox>
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
