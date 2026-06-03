import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { NumberInput } from './NumberInput'

afterEach(() => {
  cleanup()
})

// Ark's NumberInput exposes the input as an ARIA spinbutton.
const getInput = () => screen.getByRole('spinbutton') as HTMLInputElement

describe('NumberInput', () => {
  test('renders its label', () => {
    render(<NumberInput label="Rollback history (days)" />)
    expect(screen.getByText('Rollback history (days)')).toBeDefined()
  })

  test('honors defaultValue', () => {
    render(<NumberInput label="Days" defaultValue="30" />)
    expect(getInput().value).toBe('30')
  })

  test('exposes spinbutton aria bounds and value', () => {
    render(<NumberInput label="Days" defaultValue="30" min={1} max={365} />)
    const input = getInput()
    expect(input.getAttribute('aria-valuenow')).toBe('30')
    expect(input.getAttribute('aria-valuemin')).toBe('1')
    expect(input.getAttribute('aria-valuemax')).toBe('365')
  })

  test('increments and decrements via the stepper triggers', async () => {
    const user = userEvent.setup()
    render(<NumberInput label="Days" defaultValue="30" step={1} />)
    const input = getInput()

    await user.click(screen.getByRole('button', { name: 'Increase' }))
    await waitFor(() => expect(input.value).toBe('31'))

    await user.click(screen.getByRole('button', { name: 'Decrease' }))
    await user.click(screen.getByRole('button', { name: 'Decrease' }))
    await waitFor(() => expect(input.value).toBe('29'))
  })

  test('changes value via ArrowUp / ArrowDown keyboard', async () => {
    const user = userEvent.setup()
    render(<NumberInput label="Days" defaultValue="30" step={1} />)
    const input = getInput()

    await user.click(input)
    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(input.value).toBe('31'))

    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(input.value).toBe('30'))
  })

  test('clamps to min / max bounds', async () => {
    const user = userEvent.setup()
    render(<NumberInput label="Retries" defaultValue="5" min={0} max={5} />)
    const input = getInput()

    // Already at max — increment should not exceed it.
    await user.click(screen.getByRole('button', { name: 'Increase' }))
    await waitFor(() => expect(input.value).toBe('5'))
    expect(screen.getByRole('button', { name: 'Increase' }).getAttribute('disabled')).not.toBeNull()
  })

  test('reports changes through onValueChange', async () => {
    const user = userEvent.setup()
    const values: number[] = []
    render(<NumberInput label="Days" defaultValue="30" step={1} onValueChange={d => values.push(d.valueAsNumber)} />)
    await user.click(screen.getByRole('button', { name: 'Increase' }))
    await waitFor(() => expect(values.at(-1)).toBe(31))
  })

  test('disabled blocks interaction', async () => {
    const user = userEvent.setup()
    const values: number[] = []
    render(<NumberInput label="Days" defaultValue="30" disabled onValueChange={d => values.push(d.valueAsNumber)} />)

    const input = getInput()
    expect(input.disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Increase' }))
    expect(input.value).toBe('30')
    expect(values).toEqual([])
  })

  test('forwards a ref to the root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <NumberInput
        label="Days"
        defaultValue="30"
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
        <NumberInput label="Default" defaultValue="30" min={1} max={365} />
        <NumberInput label="Disabled" defaultValue="30" disabled />
        <NumberInput label="Invalid" defaultValue="999" max={365} invalid />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
