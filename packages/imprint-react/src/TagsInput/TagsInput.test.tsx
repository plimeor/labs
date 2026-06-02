import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { TagsInput } from './TagsInput'

afterEach(() => {
  cleanup()
})

// Ark's TagsInput entry field is the single visible textbox.
const getInput = () => screen.getByRole('textbox') as HTMLInputElement

describe('TagsInput', () => {
  test('renders the label and the initial tags', () => {
    render(<TagsInput label="Tags" defaultValue={['field', 'soil', 'weather']} />)
    expect(screen.getByText('Tags')).toBeDefined()
    expect(screen.getByText('field')).toBeDefined()
    expect(screen.getByText('soil')).toBeDefined()
    expect(screen.getByText('weather')).toBeDefined()
  })

  test('renders a delete trigger per tag with an accessible name', () => {
    render(<TagsInput defaultValue={['field', 'soil']} />)
    expect(screen.getByRole('button', { name: 'Remove field' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Remove soil' })).toBeDefined()
  })

  test('adds a tag when Enter is pressed in the input', async () => {
    const user = userEvent.setup()
    const changes: string[][] = []
    render(<TagsInput defaultValue={['field']} onValueChange={d => changes.push(d.value)} />)

    const input = getInput()
    await user.click(input)
    await user.type(input, 'soil{Enter}')

    await waitFor(() => {
      expect(screen.getByText('soil')).toBeDefined()
    })
    expect(changes.at(-1)).toEqual(['field', 'soil'])
  })

  test('removes a tag via its delete trigger', async () => {
    const user = userEvent.setup()
    const changes: string[][] = []
    render(<TagsInput defaultValue={['field', 'soil']} onValueChange={d => changes.push(d.value)} />)

    await user.click(screen.getByRole('button', { name: 'Remove field' }))

    await waitFor(() => {
      expect(screen.queryByText('field')).toBeNull()
    })
    expect(screen.getByText('soil')).toBeDefined()
    expect(changes.at(-1)).toEqual(['soil'])
  })

  test('removes the last tag when Backspace is pressed on an empty input', async () => {
    const user = userEvent.setup()
    render(<TagsInput defaultValue={['field', 'soil']} />)

    const input = getInput()
    await user.click(input)
    // First Backspace highlights the last tag, second deletes it.
    await user.keyboard('{Backspace}{Backspace}')

    await waitFor(() => {
      expect(screen.queryByText('soil')).toBeNull()
    })
    expect(screen.getByText('field')).toBeDefined()
  })

  test('honors a controlled value', () => {
    render(<TagsInput value={['only']} />)
    expect(screen.getByText('only')).toBeDefined()
    expect(screen.queryByText('field')).toBeNull()
  })

  test('surfaces data-disabled on the control when disabled', () => {
    const { container } = render(<TagsInput defaultValue={['field']} disabled />)
    const control = container.querySelector('[data-part="control"]')
    expect(control).not.toBeNull()
    expect(control?.hasAttribute('data-disabled')).toBe(true)
  })

  test('surfaces data-invalid on the control when invalid', () => {
    const { container } = render(<TagsInput defaultValue={['field']} invalid />)
    const control = container.querySelector('[data-part="control"]')
    expect(control?.hasAttribute('data-invalid')).toBe(true)
  })

  test('does not add tags when read-only', async () => {
    const user = userEvent.setup()
    const changes: string[][] = []
    render(<TagsInput defaultValue={['field']} readOnly onValueChange={d => changes.push(d.value)} />)

    const input = getInput()
    await user.click(input)
    await user.type(input, 'soil{Enter}')

    expect(screen.queryByText('soil')).toBeNull()
    expect(changes).toEqual([])
  })

  test('omits the hash glyph when hash is false', () => {
    render(<TagsInput defaultValue={['field']} hash={false} />)
    expect(screen.queryByText('#')).toBeNull()
  })

  test('forwards a ref to the underlying root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <TagsInput
        defaultValue={['field']}
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('has no accessibility violations', async () => {
    // Provide a valid document context so the scan flags only component issues.
    document.documentElement.lang = 'en'
    document.title = 'TagsInput test'
    render(
      <main>
        <h1>Tags</h1>
        <TagsInput label="Tags" defaultValue={['field', 'soil', 'weather']} />
      </main>
    )
    // Ark's form-submission HiddenInput renders with the `hidden` attribute, so
    // it is absent from the accessibility tree in a real browser. happy-dom does
    // not exclude `hidden` nodes from axe's visibility computation, so we exclude
    // them here to mirror real-browser behavior. The `label` rule stays active,
    // so a genuinely unlabeled visible input would still fail.
    const results = await axe.run({ exclude: [['[hidden]']] })
    expect(results.violations).toEqual([])
  })
})
