import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'

import { SegmentGroup } from './SegmentGroup'

afterEach(() => {
  cleanup()
})

const items = [
  { label: 'Preview', value: 'preview' },
  { label: 'Source', value: 'source' },
  { label: 'Split', value: 'split' }
]

// Ark renders a visually-hidden radio per segment as the accessible control.
const getRadio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement

describe('SegmentGroup', () => {
  test('renders a radiogroup with one radio per item', () => {
    render(<SegmentGroup items={items} defaultValue="preview" />)
    expect(screen.getByRole('radiogroup')).toBeDefined()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  test('honors defaultValue as the checked segment', () => {
    render(<SegmentGroup items={items} defaultValue="source" />)
    expect(getRadio('Source').checked).toBe(true)
    expect(getRadio('Preview').checked).toBe(false)
  })

  test('selects a segment on click and reports the new value', async () => {
    const user = userEvent.setup()
    const changes: (string | null)[] = []
    render(<SegmentGroup items={items} defaultValue="preview" onValueChange={d => changes.push(d.value)} />)

    await user.click(screen.getByText('Split'))
    expect(getRadio('Split').checked).toBe(true)
    expect(getRadio('Preview').checked).toBe(false)
    expect(changes.at(-1)).toBe('split')
  })

  test('moves selection with arrow keys (roving radio-group semantics)', async () => {
    const user = userEvent.setup()
    const changes: (string | null)[] = []
    render(<SegmentGroup items={items} defaultValue="preview" onValueChange={d => changes.push(d.value)} />)

    await user.tab()
    expect(getRadio('Preview')).toBe(document.activeElement as HTMLInputElement)

    await user.keyboard('{ArrowRight}')
    expect(getRadio('Source').checked).toBe(true)
    expect(changes.at(-1)).toBe('source')

    await user.keyboard('{ArrowRight}')
    expect(getRadio('Split').checked).toBe(true)
    expect(changes.at(-1)).toBe('split')
  })

  test('reflects the selected segment via aria-checked', () => {
    render(<SegmentGroup items={items} defaultValue="source" />)
    expect(screen.getByRole('radio', { checked: true, name: 'Source' })).toBe(getRadio('Source'))
    expect(screen.getByRole('radio', { checked: false, name: 'Preview' })).toBe(getRadio('Preview'))
  })

  test('group disabled blocks interaction', async () => {
    const user = userEvent.setup()
    const changes: (string | null)[] = []
    render(<SegmentGroup disabled items={items} defaultValue="preview" onValueChange={d => changes.push(d.value)} />)

    expect(getRadio('Preview').disabled).toBe(true)
    await user.click(screen.getByText('Split'))
    expect(getRadio('Preview').checked).toBe(true)
    expect(changes).toEqual([])
  })

  test('per-item disabled blocks selecting that segment', async () => {
    const user = userEvent.setup()
    render(
      <SegmentGroup
        items={[
          { label: 'Preview', value: 'preview' },
          { disabled: true, label: 'Source', value: 'source' },
          { label: 'Split', value: 'split' }
        ]}
        defaultValue="preview"
      />
    )
    expect(getRadio('Source').disabled).toBe(true)
    await user.click(screen.getByText('Source'))
    expect(getRadio('Source').checked).toBe(false)
    expect(getRadio('Preview').checked).toBe(true)
  })

  test('icon-only segments keep an accessible name via the hidden label', () => {
    render(
      <SegmentGroup
        items={[
          { icon: AlignLeft, iconOnly: true, label: 'Align left', value: 'left' },
          { icon: AlignCenter, iconOnly: true, label: 'Align center', value: 'center' },
          { icon: AlignRight, iconOnly: true, label: 'Align right', value: 'right' }
        ]}
        defaultValue="center"
      />
    )
    expect(getRadio('Align center').checked).toBe(true)
    expect(getRadio('Align left')).toBeDefined()
  })

  test('forwards a ref to the underlying root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <SegmentGroup
        ref={el => {
          node = el
        }}
        items={items}
        defaultValue="preview"
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).getAttribute('role')).toBe('radiogroup')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <SegmentGroup items={items} defaultValue="preview" />
        <SegmentGroup
          items={[
            { icon: AlignLeft, iconOnly: true, label: 'Align left', value: 'left' },
            { icon: AlignCenter, iconOnly: true, label: 'Align center', value: 'center' },
            { icon: AlignRight, iconOnly: true, label: 'Align right', value: 'right' }
          ]}
          defaultValue="center"
        />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
