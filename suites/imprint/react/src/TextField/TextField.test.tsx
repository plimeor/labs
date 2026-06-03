import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { TextField } from './TextField'

afterEach(() => {
  cleanup()
})

describe('TextField', () => {
  test('renders the label associated with the input', () => {
    render(<TextField label="Note title" />)
    expect(screen.getByLabelText('Note title')).toBeDefined()
    expect(screen.getByRole('textbox', { name: 'Note title' })).toBeDefined()
  })

  test('accepts typed input', async () => {
    const user = userEvent.setup()
    render(<TextField label="Note title" />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    await user.type(input, 'Hello')
    expect(input.value).toBe('Hello')
  })

  test('focuses on label click and types via keyboard', async () => {
    const user = userEvent.setup()
    render(<TextField label="Note title" />)
    await user.click(screen.getByText('Note title'))
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    await user.keyboard('Field notes')
    expect(input.value).toBe('Field notes')
  })

  test('disabled blocks input', async () => {
    const user = userEvent.setup()
    render(<TextField label="Note title" disabled />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.disabled).toBe(true)
    await user.type(input, 'nope')
    expect(input.value).toBe('')
  })

  test('error sets aria-invalid and exposes the message via aria-describedby', () => {
    render(<TextField label="Note title" error="A title is required." />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')

    const message = screen.getByText('A title is required.')
    const describedby = input.getAttribute('aria-describedby')
    expect(describedby).toBeTruthy()
    expect(describedby!.split(' ')).toContain(message.id)
  })

  test('error replaces the hint', () => {
    render(<TextField label="Note title" hint="Shown at the top." error="A title is required." />)
    expect(screen.queryByText('Shown at the top.')).toBeNull()
    expect(screen.getByText('A title is required.')).toBeDefined()
  })

  test('hint is wired to the input via aria-describedby when there is no error', () => {
    render(<TextField label="Note title" hint="Shown at the top." />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).not.toBe('true')

    const hint = screen.getByText('Shown at the top.')
    const describedby = input.getAttribute('aria-describedby')
    expect(describedby).toBeTruthy()
    expect(describedby!.split(' ')).toContain(hint.id)
  })

  test('required marks the input as required', () => {
    render(<TextField label="Collection name" required />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.required).toBe(true)
  })

  test('search variant renders a leading icon', () => {
    const { container } = render(<TextField label="Search" variant="search" placeholder="Search notes…" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  test('forwards a ref to the underlying input element', () => {
    let node: HTMLInputElement | null = null
    render(
      <TextField
        label="Note title"
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('INPUT')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <TextField label="Note title" defaultValue="Field notes — March" />
        <TextField label="Search" variant="search" placeholder="Search notes…" />
        <TextField label="With hint" hint="Shown at the top of the note." />
        <TextField label="Required" required />
        <TextField label="In error" error="A title is required." />
        <TextField label="Disabled" disabled />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
