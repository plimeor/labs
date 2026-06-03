import { afterEach, describe, expect, test } from 'bun:test'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'

import { Slider } from './Slider'

afterEach(() => {
  cleanup()
})

// Ark's Slider thumb is the accessible control (role="slider"). In happy-dom
// there is no layout, so Ark leaves the thumb visibility:hidden until measured;
// query with { hidden: true } so it is found regardless of that flag.
const getThumb = () => screen.getByRole('slider', { hidden: true })

describe('Slider', () => {
  test('renders its label and value readout', () => {
    render(<Slider label="Reading width" defaultValue={62} formatValue={v => `${v}ch`} />)
    expect(screen.getByText('Reading width')).toBeDefined()
    expect(screen.getByText('62ch')).toBeDefined()
  })

  test('updates the formatted readout live as the value changes', async () => {
    const user = userEvent.setup()
    render(<Slider label="Reading width" defaultValue={62} min={0} max={100} step={1} formatValue={v => `${v}ch`} />)
    expect(screen.getByText('62ch')).toBeDefined()

    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('63ch')).toBeDefined()
  })

  test('exposes the value as accessible slider state', () => {
    render(<Slider label="Reading width" defaultValue={62} min={20} max={80} />)
    const thumb = getThumb()
    expect(thumb.getAttribute('aria-valuenow')).toBe('62')
    expect(thumb.getAttribute('aria-valuemin')).toBe('20')
    expect(thumb.getAttribute('aria-valuemax')).toBe('80')
  })

  test('honors defaultValue and clamps to min/max with step on keyboard', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    render(<Slider label="Volume" defaultValue={50} min={0} max={100} step={10} onValueChange={v => changes.push(v)} />)

    const thumb = getThumb()
    await user.tab()
    expect(thumb).toBe(document.activeElement as HTMLElement)

    await user.keyboard('{ArrowRight}')
    expect(thumb.getAttribute('aria-valuenow')).toBe('60')
    expect(changes.at(-1)).toBe(60)

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(thumb.getAttribute('aria-valuenow')).toBe('40')
    expect(changes.at(-1)).toBe(40)
  })

  test('jumps to bounds with Home and End', async () => {
    const user = userEvent.setup()
    render(<Slider label="Volume" defaultValue={50} min={0} max={100} />)
    const thumb = getThumb()

    await user.tab()
    await user.keyboard('{Home}')
    expect(thumb.getAttribute('aria-valuenow')).toBe('0')

    await user.keyboard('{End}')
    expect(thumb.getAttribute('aria-valuenow')).toBe('100')
  })

  test('controlled value is reflected and reported on change', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    render(<Slider label="Volume" value={30} min={0} max={100} step={5} onValueChange={v => changes.push(v)} />)

    const thumb = getThumb()
    expect(thumb.getAttribute('aria-valuenow')).toBe('30')

    await user.tab()
    await user.keyboard('{ArrowRight}')
    // Value is controlled (no internal commit), but the change is reported.
    expect(changes.at(-1)).toBe(35)
    expect(thumb.getAttribute('aria-valuenow')).toBe('30')
  })

  test('disabled is non-interactive and not focusable', async () => {
    const user = userEvent.setup()
    const changes: number[] = []
    render(<Slider label="Volume" defaultValue={50} disabled onValueChange={v => changes.push(v)} />)

    const thumb = getThumb()
    expect(thumb.getAttribute('aria-disabled')).toBe('true')
    expect(thumb.hasAttribute('tabindex')).toBe(false)

    await user.keyboard('{ArrowRight}')
    expect(thumb.getAttribute('aria-valuenow')).toBe('50')
    expect(changes).toEqual([])
  })

  test('forwards a ref to the underlying root element', () => {
    let node: HTMLDivElement | null = null
    render(
      <Slider
        label="Volume"
        defaultValue={50}
        ref={el => {
          node = el
        }}
      />
    )
    expect(node).not.toBeNull()
    expect((node as unknown as HTMLElement).tagName).toBe('DIV')
  })

  test('labels the thumb via aria-label and a wired aria-labelledby target', () => {
    render(<Slider thumbLabel="Volume" defaultValue={40} />)
    const thumb = getThumb()
    // Ark links the thumb to the (visually hidden) Label and we also set aria-label.
    expect(thumb.getAttribute('aria-label')).toBe('Volume')
    const labelledBy = thumb.getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe('Volume')
  })

  test('a string label is reused as the thumb aria-label', () => {
    render(<Slider label="Reading width" defaultValue={62} />)
    expect(getThumb().getAttribute('aria-label')).toBe('Reading width')
  })

  test('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <Slider label="Reading width" defaultValue={62} formatValue={v => `${v}ch`} />
        <Slider label="Volume" defaultValue={30} formatValue={v => `${v}%`} />
        <Slider label="Disabled" defaultValue={62} disabled formatValue={v => `${v}ch`} />
      </main>
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
