import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Dialog } from './Dialog'

afterEach(() => {
  cleanup()
})

describe('Dialog', () => {
  test('renders title and description when open', () => {
    render(
      <Dialog
        defaultOpen
        title="Delete note?"
        description="This moves the note to Trash."
        footer={<button type="button">Cancel</button>}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()
    expect(screen.getByText('Delete note?')).toBeDefined()
    expect(screen.getByText('This moves the note to Trash.')).toBeDefined()
  })

  test('is not exposed when closed', () => {
    render(<Dialog title="Hidden" description="Should not appear" />)
    // Ark keeps the content mounted but hidden when closed, so it is absent
    // from the accessibility tree (role query returns null) and marked closed.
    expect(screen.queryByRole('dialog')).toBeNull()
    const title = screen.getByText('Hidden')
    const content = title.closest('[data-part="content"]')
    expect(content).not.toBeNull()
    expect(content?.getAttribute('data-state')).toBe('closed')
    expect((content as HTMLElement).hidden).toBe(true)
  })

  test('wires the accessible name and description to the dialog', () => {
    render(<Dialog defaultOpen title="Delete note?" description="Moves to Trash." />)
    const dialog = screen.getByRole('dialog')
    // Ark links title via aria-labelledby and description via aria-describedby.
    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull()
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: 'Delete note?' })).toBeDefined()
  })

  test('honors the alertdialog role', () => {
    render(<Dialog defaultOpen role="alertdialog" title="Confirm" description="Sure?" />)
    expect(screen.getByRole('alertdialog')).toBeDefined()
  })

  test('opens when the trigger is activated', async () => {
    const user = userEvent.setup()
    render(<Dialog title="Delete note?" description="Moves to Trash." trigger={<button type="button">Open</button>} />)
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
    render(<Dialog defaultOpen title="Delete note?" description="Moves to Trash." />)
    expect(screen.getByRole('dialog')).toBeDefined()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  test('closes via the close button', async () => {
    const user = userEvent.setup()
    render(<Dialog defaultOpen title="Delete note?" description="Moves to Trash." />)
    const close = screen.getByRole('button', { name: 'Close dialog' })

    await user.click(close)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  test('forwards a ref to the content element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Dialog
        defaultOpen
        title="Ref"
        description="desc"
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
        <Dialog
          defaultOpen
          role="alertdialog"
          title="Delete “Field notes — March”?"
          description="This moves the note to Trash. You can restore it for 30 days."
          footer={
            <>
              <button type="button">Cancel</button>
              <button type="button">Delete</button>
            </>
          }
        />
      </main>
    )
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeDefined()
    })
    const results = await axe.run(document.body)
    expect(results.violations).toEqual([])
  })
})
