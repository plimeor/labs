import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Accordion, type AccordionItem } from './Accordion'

afterEach(() => {
  cleanup()
})

const items: AccordionItem[] = [
  { content: 'Replicas merge independently.', title: 'Conflict resolution', value: 'conflict' },
  { content: 'Notes persist locally first.', title: 'Storage & sync', value: 'storage' },
  { content: 'Share a read-only snapshot.', title: 'Sharing', value: 'sharing' }
]

const trigger = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('Accordion', () => {
  test('renders one trigger per item', () => {
    render(<Accordion items={items} />)
    expect(screen.getByRole('button', { name: 'Conflict resolution' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Storage & sync' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Sharing' })).toBeDefined()
  })

  test('marks the defaultValue item open and the rest collapsed', () => {
    render(<Accordion defaultValue={['conflict']} items={items} />)
    expect(trigger('Conflict resolution').getAttribute('aria-expanded')).toBe('true')
    expect(trigger('Storage & sync').getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Replicas merge independently.')).toBeDefined()
  })

  test('opens a collapsed item on click and exposes its content', async () => {
    const user = userEvent.setup()
    render(<Accordion items={items} />)

    const storage = trigger('Storage & sync')
    expect(storage.getAttribute('aria-expanded')).toBe('false')

    await user.click(storage)
    expect(storage.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Notes persist locally first.')).toBeDefined()
  })

  test('collapses an open item on click when collapsible', async () => {
    const user = userEvent.setup()
    render(<Accordion collapsible defaultValue={['conflict']} items={items} />)

    const conflict = trigger('Conflict resolution')
    expect(conflict.getAttribute('aria-expanded')).toBe('true')

    await user.click(conflict)
    expect(conflict.getAttribute('aria-expanded')).toBe('false')
  })

  test('single mode closes the previously open item when another opens', async () => {
    const user = userEvent.setup()
    render(<Accordion defaultValue={['conflict']} items={items} />)

    await user.click(trigger('Storage & sync'))
    expect(trigger('Storage & sync').getAttribute('aria-expanded')).toBe('true')
    expect(trigger('Conflict resolution').getAttribute('aria-expanded')).toBe('false')
  })

  test('multiple mode keeps several items open at once', async () => {
    const user = userEvent.setup()
    render(<Accordion multiple defaultValue={['conflict']} items={items} />)

    await user.click(trigger('Storage & sync'))
    expect(trigger('Conflict resolution').getAttribute('aria-expanded')).toBe('true')
    expect(trigger('Storage & sync').getAttribute('aria-expanded')).toBe('true')
  })

  test('non-collapsible keeps the single open item open when clicked', async () => {
    const user = userEvent.setup()
    render(<Accordion collapsible={false} defaultValue={['conflict']} items={items} />)

    const conflict = trigger('Conflict resolution')
    await user.click(conflict)
    expect(conflict.getAttribute('aria-expanded')).toBe('true')
  })

  test('toggles via keyboard (focus + Enter)', async () => {
    const user = userEvent.setup()
    render(<Accordion items={items} />)

    const conflict = trigger('Conflict resolution')
    conflict.focus()
    expect(conflict).toBe(document.activeElement as HTMLButtonElement)

    await user.keyboard('{Enter}')
    expect(conflict.getAttribute('aria-expanded')).toBe('true')

    await user.keyboard('{Enter}')
    expect(conflict.getAttribute('aria-expanded')).toBe('false')
  })

  test('moves focus between triggers with ArrowDown', async () => {
    const user = userEvent.setup()
    render(<Accordion items={items} />)

    const conflict = trigger('Conflict resolution')
    conflict.focus()

    await user.keyboard('{ArrowDown}')
    expect(trigger('Storage & sync')).toBe(document.activeElement as HTMLButtonElement)
  })

  test('reports open values via onValueChange', async () => {
    const user = userEvent.setup()
    const calls: string[][] = []
    render(<Accordion items={items} onValueChange={d => calls.push(d.value)} />)

    await user.click(trigger('Sharing'))
    expect(calls.at(-1)).toEqual(['sharing'])
  })

  test('disabled item cannot be toggled', async () => {
    const user = userEvent.setup()
    const withDisabled: AccordionItem[] = [items[0], { ...items[1], disabled: true }, items[2]]
    render(<Accordion items={withDisabled} />)

    const storage = trigger('Storage & sync')
    expect(storage.disabled).toBe(true)
    await user.click(storage)
    expect(storage.getAttribute('aria-expanded')).toBe('false')
  })

  test('forwards a ref to the root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Accordion
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
        <Accordion defaultValue={['conflict']} items={items} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
