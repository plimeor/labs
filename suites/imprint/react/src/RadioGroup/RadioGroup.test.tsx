import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { RadioGroup } from './RadioGroup'

afterEach(() => {
  cleanup()
})

const items = [
  { label: 'Apply automatically', value: 'auto' },
  { label: 'Review every change', value: 'review' },
  { label: 'Notify only', value: 'notify' }
]

// Ark renders a visually-hidden radio input per item as the accessible control.
const getRadio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement

describe('RadioGroup', () => {
  test('renders an item label and control per option', () => {
    render(<RadioGroup items={items} />)
    expect(screen.getByText('Apply automatically')).toBeDefined()
    expect(screen.getByText('Review every change')).toBeDefined()
    expect(screen.getByText('Notify only')).toBeDefined()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  test('exposes a radiogroup container', () => {
    render(<RadioGroup items={items} label="Mode" />)
    expect(screen.getByRole('radiogroup')).toBeDefined()
  })

  test('nothing is selected by default', () => {
    render(<RadioGroup items={items} />)
    expect(getRadio('Apply automatically').checked).toBe(false)
    expect(getRadio('Review every change').checked).toBe(false)
    expect(getRadio('Notify only').checked).toBe(false)
  })

  test('honors defaultValue', () => {
    render(<RadioGroup items={items} defaultValue="review" />)
    expect(getRadio('Review every change').checked).toBe(true)
    expect(getRadio('Apply automatically').checked).toBe(false)
  })

  test('selects an option on click and reports the new value', async () => {
    const user = userEvent.setup()
    const changes: (string | null)[] = []
    render(<RadioGroup items={items} onValueChange={d => changes.push(d.value)} />)

    await user.click(screen.getByText('Review every change'))
    expect(getRadio('Review every change').checked).toBe(true)
    expect(changes.at(-1)).toBe('review')
  })

  test('moves selection with arrow keys (roving focus)', async () => {
    const user = userEvent.setup()
    const changes: (string | null)[] = []
    render(<RadioGroup items={items} defaultValue="auto" onValueChange={d => changes.push(d.value)} />)

    const first = getRadio('Apply automatically')
    expect(first.checked).toBe(true)

    await user.tab()
    expect(first).toBe(document.activeElement as HTMLInputElement)

    await user.keyboard('{ArrowDown}')
    expect(getRadio('Review every change').checked).toBe(true)
    expect(first.checked).toBe(false)
    expect(changes.at(-1)).toBe('review')
  })

  test('disabled group blocks selection', async () => {
    const user = userEvent.setup()
    const changes: (string | null)[] = []
    render(<RadioGroup items={items} disabled onValueChange={d => changes.push(d.value)} />)

    expect(getRadio('Apply automatically').disabled).toBe(true)
    await user.click(screen.getByText('Review every change'))
    expect(getRadio('Review every change').checked).toBe(false)
    expect(changes).toEqual([])
  })

  test('a disabled item cannot be selected while the group stays interactive', async () => {
    const user = userEvent.setup()
    const localItems = [
      { label: 'Apply automatically', value: 'auto' },
      { disabled: true, label: 'Notify only', value: 'notify' }
    ]
    render(<RadioGroup items={localItems} />)

    expect(getRadio('Notify only').disabled).toBe(true)
    await user.click(screen.getByText('Notify only'))
    expect(getRadio('Notify only').checked).toBe(false)

    await user.click(screen.getByText('Apply automatically'))
    expect(getRadio('Apply automatically').checked).toBe(true)
  })

  test('forwards a ref to the underlying root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <RadioGroup
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
        <RadioGroup items={items} label="When the agent edits a note" defaultValue="review" />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
