import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Popover } from './Popover'

afterEach(() => {
  cleanup()
})

describe('Popover', () => {
  test('renders title and description when open', () => {
    render(
      <Popover
        defaultOpen
        title="Link to note"
        description="Search your vault and insert a wikilink at the cursor."
        trigger={<button type="button">Open</button>}
        footer={<button type="button">Insert</button>}
      />
    )
    const content = screen.getByRole('dialog')
    expect(content).toBeDefined()
    expect(screen.getByText('Link to note')).toBeDefined()
    expect(screen.getByText('Search your vault and insert a wikilink at the cursor.')).toBeDefined()
  })

  test('is not exposed when closed', () => {
    render(<Popover title="Hidden" description="Should not appear" trigger={<button type="button">Open</button>} />)
    // Ark keeps the content mounted but hidden when closed, so it is absent
    // from the accessibility tree (role query returns null) and marked closed.
    expect(screen.queryByRole('dialog')).toBeNull()
    const title = screen.getByText('Hidden')
    const content = title.closest('[data-part="content"]')
    expect(content).not.toBeNull()
    expect(content?.getAttribute('data-state')).toBe('closed')
    expect((content as HTMLElement).hidden).toBe(true)
  })

  test('wires the trigger and content with popup ARIA attributes', () => {
    render(
      <Popover
        defaultOpen
        title="Link to note"
        description="Insert a wikilink."
        trigger={<button type="button">Open</button>}
      />
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const content = screen.getByRole('dialog')
    // Ark links title via aria-labelledby and description via aria-describedby.
    expect(content.getAttribute('aria-labelledby')).not.toBeNull()
    expect(content.getAttribute('aria-describedby')).not.toBeNull()
    expect(trigger.getAttribute('aria-controls')).toBe(content.getAttribute('id'))
  })

  test('opens when the trigger is activated', async () => {
    const user = userEvent.setup()
    render(
      <Popover title="Link to note" description="Insert a wikilink." trigger={<button type="button">Open</button>} />
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  test('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(
      <Popover
        defaultOpen
        title="Link to note"
        description="Insert a wikilink."
        trigger={<button type="button">Open</button>}
      />
    )
    expect(screen.getByRole('dialog')).toBeDefined()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  test('closes via the close button', async () => {
    const user = userEvent.setup()
    render(
      <Popover
        defaultOpen
        showCloseButton
        title="Link to note"
        description="Insert a wikilink."
        trigger={<button type="button">Open</button>}
      />
    )
    const close = screen.getByRole('button', { name: 'Close' })

    await user.click(close)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  test('reports open-state changes', async () => {
    const user = userEvent.setup()
    const changes: boolean[] = []
    render(
      <Popover
        title="Link to note"
        description="Insert a wikilink."
        onOpenChange={open => changes.push(open)}
        trigger={<button type="button">Open</button>}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
    expect(changes.at(-1)).toBe(true)
  })

  test('forwards a ref to the content element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Popover
        defaultOpen
        title="Ref"
        description="desc"
        trigger={<button type="button">Open</button>}
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    render(
      <main>
        <Popover
          defaultOpen
          showCloseButton
          title="Link to note"
          description="Search your vault and insert a wikilink at the cursor."
          trigger={<button type="button">Link to note</button>}
          footer={
            <>
              <button type="button">Insert</button>
              <button type="button">Cancel</button>
            </>
          }
        />
      </main>
    )
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
    const results = await axe.run(document.body)
    expect(results.violations).toEqual([])
  })
})
