import { Slider as ArkSlider, type SliderValueChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

export type { SliderValueChangeDetails }

// One tv() with a slot per Ark part. Named utilities (bg-active, text-secondary,
// rounded-full, …) emit the same var(--token) the old CSS Module used; fixed px
// (6px track/range height, 18px thumb, 1.5px ring) and display:contents use the
// arbitrary form. The thumb's always-visible focus ring is keyed to Ark's
// data-focus; cursor-not-allowed lifts from the root's data-disabled.
const slider = tv({
  slots: {
    control: 'relative flex items-center w-full',
    header: 'flex items-center justify-between mb-3',
    headerHidden: '[display:contents]',
    label: 'text-sm font-normal leading-snug text-secondary',
    range: 'h-[6px] bg-accent rounded-full',
    root: 'font-ui flex flex-col w-full data-disabled:cursor-not-allowed data-disabled:opacity-45',
    srOnly: 'absolute w-px h-px -m-px p-0 overflow-hidden [clip:rect(0,0,0,0)] whitespace-nowrap border-0',
    track: 'relative flex-1 h-[6px] bg-active rounded-full',
    valueText: 'font-mono text-sm text-tertiary',
    thumb: [
      'w-[18px] h-[18px] rounded-full bg-content border-[1.5px] border-accent shadow-2 cursor-grab outline-none',
      'data-[dragging]:cursor-grabbing',
      'data-[focus]:outline-2 data-[focus]:outline-focus data-[focus]:outline-offset-2',
      '[[data-disabled]_&]:cursor-not-allowed'
    ]
  }
})

const styles = slider()

export interface SliderProps {
  /** Controlled value. */
  value?: number
  /** Initial value for uncontrolled usage. @default 50 */
  defaultValue?: number
  /** Fires when the value changes. */
  onValueChange?: (value: number) => void
  /** Fires when an interaction that changes the value settles (drag end / key up). */
  onValueChangeEnd?: (value: number) => void
  /** Minimum value. @default 0 */
  min?: number
  /** Maximum value. @default 100 */
  max?: number
  /** Step increment. @default 1 */
  step?: number
  /** Disables the slider. */
  disabled?: boolean
  /** Renders the slider as read-only. */
  readOnly?: boolean
  /** Name of the underlying input, for form submission. */
  name?: string
  /** Id of the form the slider belongs to. */
  form?: string
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Visible label rendered above the track. */
  label?: ReactNode
  /**
   * Maps the current value to the trailing readout shown in the header row.
   * When omitted, `showValue` controls whether the raw value is printed.
   */
  formatValue?: (value: number) => ReactNode
  /** Show the live raw value in the header row. @default false */
  showValue?: boolean
  /**
   * Accessible label for the thumb. Falls back to a string `label`. Provide
   * this when the slider has no visible label, or a non-string one.
   */
  thumbLabel?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint Slider. Ark UI Slider behavior skinned with Imprint tokens.
 * A single-thumb track with an accent range and an accent-ringed thumb,
 * an always-visible focus ring, and an optional header row (label + readout)
 * — 1:1 with the Imprint specimen. The control exposes Ark's `data-state` /
 * `data-disabled` attributes for token styling.
 *
 * The ref forwards to the Ark root element.
 */
export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  {
    value,
    defaultValue = 50,
    onValueChange,
    onValueChangeEnd,
    label,
    formatValue,
    showValue = false,
    thumbLabel,
    className,
    ...rest
  },
  ref
) {
  const accessibleLabel = thumbLabel ?? (typeof label === 'string' ? label : undefined)
  const hasReadout = formatValue != null || showValue
  // Ark wires the thumb's accessible name to the Label via aria-labelledby, so
  // always render a Label; hide it visually when there's no visible label.
  const hasVisibleLabel = label != null

  return (
    <ArkSlider.Root
      ref={ref}
      className={styles.root({ className })}
      value={value != null ? [value] : undefined}
      defaultValue={value == null ? [defaultValue] : undefined}
      onValueChange={onValueChange ? details => onValueChange(details.value[0]) : undefined}
      onValueChangeEnd={onValueChangeEnd ? details => onValueChangeEnd(details.value[0]) : undefined}
      aria-label={accessibleLabel != null ? [accessibleLabel] : undefined}
      {...rest}
    >
      <div className={hasVisibleLabel || hasReadout ? styles.header() : styles.headerHidden()}>
        <ArkSlider.Label className={hasVisibleLabel ? styles.label() : styles.srOnly()}>
          {label ?? accessibleLabel ?? ''}
        </ArkSlider.Label>
        {hasReadout ? (
          <ArkSlider.Context>
            {api => (
              <ArkSlider.ValueText className={styles.valueText()}>
                {format(api.value[0], formatValue)}
              </ArkSlider.ValueText>
            )}
          </ArkSlider.Context>
        ) : null}
      </div>
      <ArkSlider.Control className={styles.control()}>
        <ArkSlider.Track className={styles.track()}>
          <ArkSlider.Range className={styles.range()} />
        </ArkSlider.Track>
        <ArkSlider.Thumb index={0} className={styles.thumb()}>
          <ArkSlider.HiddenInput />
        </ArkSlider.Thumb>
      </ArkSlider.Control>
    </ArkSlider.Root>
  )
})

function format(value: number, formatValue?: (value: number) => ReactNode): ReactNode {
  if (formatValue) return formatValue(value)
  return String(value)
}
