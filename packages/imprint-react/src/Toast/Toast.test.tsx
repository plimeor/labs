import { afterEach, describe, expect, test } from 'bun:test'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { createToast, Toaster } from './Toast'

afterEach(() => {
  cleanup()
})

describe('Toast', () => {
  test('renders a created toast with title and description', async () => {
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    render(<Toaster toaster={toaster} />)

    act(() => {
      toaster.create({ description: '2 edits to field-notes-march.', title: 'Change applied', type: 'success' })
    })

    expect(await screen.findByText('Change applied')).toBeDefined()
    expect(screen.getByText('2 edits to field-notes-march.')).toBeDefined()
  })

  test('exposes an accessible region landmark', () => {
    const toaster = createToast()
    act(() => {
      render(<Toaster toaster={toaster} label="Notifications" />)
    })
    // Ark renders the group as a region landmark; the accessible name starts
    // with the provided label and Ark appends placement + hotkey hints.
    expect(screen.getByRole('region', { name: /^Notifications/ })).toBeDefined()
  })

  test('marks the variant via data-status for token styling', async () => {
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    render(<Toaster toaster={toaster} />)

    act(() => {
      toaster.create({ description: 'Could not reach the server.', title: 'Sync failed', type: 'error' })
    })

    const title = await screen.findByText('Sync failed')
    const root = title.closest('[data-status]')
    expect(root).not.toBeNull()
    expect(root?.getAttribute('data-status')).toBe('error')
  })

  test('dismisses via the close button', async () => {
    const user = userEvent.setup()
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    render(<Toaster toaster={toaster} />)

    act(() => {
      toaster.create({ title: 'Bookmarked', type: 'success' })
    })
    expect(await screen.findByText('Bookmarked')).toBeDefined()

    const close = screen.getByRole('button', { name: 'Dismiss' })
    await user.click(close)

    await waitFor(() => {
      expect(screen.queryByText('Bookmarked')).toBeNull()
    })
  })

  test('renders an action trigger and fires its onClick', async () => {
    const user = userEvent.setup()
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    let undone = false
    render(<Toaster toaster={toaster} />)

    act(() => {
      toaster.create({
        description: 'Your note is unchanged.',
        title: 'Rolled back',
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true
          }
        }
      })
    })

    const action = await screen.findByRole('button', { name: 'Undo' })
    await user.click(action)
    expect(undone).toBe(true)
  })

  test('action trigger is reachable and activatable via the keyboard', async () => {
    const user = userEvent.setup()
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    let undone = false
    render(<Toaster toaster={toaster} />)

    act(() => {
      toaster.create({
        title: 'Rolled back',
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true
          }
        }
      })
    })

    const action = await screen.findByRole('button', { name: 'Undo' })
    action.focus()
    expect(action).toBe(document.activeElement as HTMLElement)
    await user.keyboard('{Enter}')
    expect(undone).toBe(true)
  })

  test('forwards a ref to the region element', () => {
    const toaster = createToast()
    let node: HTMLDivElement | null = null
    act(() => {
      render(
        <Toaster
          toaster={toaster}
          ref={el => {
            node = el
          }}
        />
      )
    })
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    const toaster = createToast({ duration: Number.POSITIVE_INFINITY })
    render(
      <main>
        <Toaster toaster={toaster} />
      </main>
    )

    act(() => {
      toaster.create({ description: '2 edits to field-notes-march.', title: 'Change applied', type: 'success' })
      toaster.create({
        action: { label: 'Undo', onClick: () => {} },
        description: 'Your note is unchanged.',
        title: 'Rolled back'
      })
    })
    await screen.findByText('Change applied')

    const results = await axe.run(document.body)
    expect(results.violations).toEqual([])
  })
})
