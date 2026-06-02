import { Slider as ArkSlider, type SliderValueChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Slider.module.css'

export type { SliderValueChangeDetails }

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
      className={className ? `${styles.root} ${className}` : styles.root}
      value={value != null ? [value] : undefined}
      defaultValue={value == null ? [defaultValue] : undefined}
      onValueChange={onValueChange ? details => onValueChange(details.value[0]) : undefined}
      onValueChangeEnd={onValueChangeEnd ? details => onValueChangeEnd(details.value[0]) : undefined}
      aria-label={accessibleLabel != null ? [accessibleLabel] : undefined}
      {...rest}
    >
      <div className={hasVisibleLabel || hasReadout ? styles.header : styles.headerHidden}>
        <ArkSlider.Label className={hasVisibleLabel ? styles.label : styles.srOnly}>
          {label ?? accessibleLabel ?? ''}
        </ArkSlider.Label>
        {hasReadout ? (
          <ArkSlider.Context>
            {api => (
              <ArkSlider.ValueText className={styles.valueText}>
                {format(api.value[0], formatValue)}
              </ArkSlider.ValueText>
            )}
          </ArkSlider.Context>
        ) : null}
      </div>
      <ArkSlider.Control className={styles.control}>
        <ArkSlider.Track className={styles.track}>
          <ArkSlider.Range className={styles.range} />
        </ArkSlider.Track>
        <ArkSlider.Thumb index={0} className={styles.thumb}>
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
