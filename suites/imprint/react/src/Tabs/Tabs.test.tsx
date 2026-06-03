import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Tabs, type TabsItem } from './Tabs'

afterEach(() => {
  cleanup()
})

const items: TabsItem[] = [
  { content: 'Preview panel', label: 'Preview', value: 'preview' },
  { content: 'Source panel', label: 'Source', value: 'source' },
  { content: 'History panel', label: 'History', value: 'history' },
  { disabled: true, label: 'Backlinks', value: 'backlinks' }
]

describe('Tabs', () => {
  test('renders a tablist with one tab per item', () => {
    render(<Tabs aria-label="Views" defaultValue="preview" items={items} />)
    const list = screen.getByRole('tablist')
    expect(within(list).getAllByRole('tab')).toHaveLength(4)
  })

  test('marks the default tab selected and exposes its panel', () => {
    render(<Tabs aria-label="Views" defaultValue="preview" items={items} />)
    const preview = screen.getByRole('tab', { name: 'Preview' })
    expect(preview.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Source' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByText('Preview panel')).toBeDefined()
  })

  test('switches the selected tab and panel on click', async () => {
    const user = userEvent.setup()
    render(<Tabs aria-label="Views" defaultValue="preview" items={items} />)

    await user.click(screen.getByRole('tab', { name: 'Source' }))

    expect(screen.getByRole('tab', { name: 'Source' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByText('Source panel')).toBeDefined()
  })

  test('reports the new value via onValueChange', async () => {
    const user = userEvent.setup()
    const values: string[] = []
    render(<Tabs aria-label="Views" defaultValue="preview" items={items} onValueChange={d => values.push(d.value)} />)

    await user.click(screen.getByRole('tab', { name: 'History' }))
    expect(values.at(-1)).toBe('history')
  })

  test('navigates with arrow keys (automatic activation)', async () => {
    const user = userEvent.setup()
    render(<Tabs aria-label="Views" defaultValue="preview" items={items} />)

    const preview = screen.getByRole('tab', { name: 'Preview' })
    preview.focus()
    expect(preview).toBe(document.activeElement as HTMLElement)

    await user.keyboard('{ArrowRight}')
    const source = screen.getByRole('tab', { name: 'Source' })
    expect(source).toBe(document.activeElement as HTMLElement)
    // Automatic activation selects on focus.
    expect(source.getAttribute('aria-selected')).toBe('true')
  })

  test('manual activation moves focus without selecting until Enter', async () => {
    const user = userEvent.setup()
    render(<Tabs aria-label="Views" activationMode="manual" defaultValue="preview" items={items} />)

    screen.getByRole('tab', { name: 'Preview' }).focus()
    await user.keyboard('{ArrowRight}')

    const source = screen.getByRole('tab', { name: 'Source' })
    expect(source).toBe(document.activeElement as HTMLElement)
    expect(source.getAttribute('aria-selected')).toBe('false')

    await user.keyboard('{Enter}')
    expect(source.getAttribute('aria-selected')).toBe('true')
  })

  test('disabled tab cannot be selected', async () => {
    const user = userEvent.setup()
    render(<Tabs aria-label="Views" defaultValue="preview" items={items} />)

    const backlinks = screen.getByRole('tab', { name: 'Backlinks' }) as HTMLButtonElement
    expect(backlinks.disabled).toBe(true)

    await user.click(backlinks)
    expect(backlinks.getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true')
  })

  test('renders trailing count badges', () => {
    render(
      <Tabs
        aria-label="Workspace"
        defaultValue="inbox"
        items={[
          { count: 12, label: 'Inbox', value: 'inbox' },
          { count: 3, label: 'Changes', value: 'changes' }
        ]}
      />
    )
    expect(within(screen.getByRole('tab', { name: /Inbox/ })).getByText('12')).toBeDefined()
  })

  test('forwards a ref to the root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Tabs
        aria-label="Views"
        defaultValue="preview"
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
        <Tabs aria-label="Views" defaultValue="preview" items={items} />
        <Tabs
          variant="pill"
          aria-label="Workspace"
          defaultValue="inbox"
          items={[
            { count: 12, label: 'Inbox', value: 'inbox' },
            { count: 3, label: 'Changes', value: 'changes' }
          ]}
        />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
