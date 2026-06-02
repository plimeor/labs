import { NumberInput as ArkNumberInput, type NumberInputValueChangeDetails } from '@ark-ui/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './NumberInput.module.css'

export type { NumberInputValueChangeDetails }

export interface NumberInputProps {
  /** Visible label rendered above the control. */
  label?: ReactNode
  /** Controlled value (as a string, matching the underlying input). */
  value?: string
  /** Initial value for uncontrolled usage. */
  defaultValue?: string
  /** Fires when the value changes. */
  onValueChange?: (details: NumberInputValueChangeDetails) => void
  /** Minimum allowed value. */
  min?: number
  /** Maximum allowed value. */
  max?: number
  /** Increment / decrement step. @default 1 */
  step?: number
  /** Disables the control and its steppers. */
  disabled?: boolean
  /** Renders the value as read-only. */
  readOnly?: boolean
  /** Marks the field invalid for assistive tech and styling. */
  invalid?: boolean
  /** Marks the underlying input as required. */
  required?: boolean
  /** Name of the underlying input, for form submission. */
  name?: string
  /** Id of the form the input belongs to. */
  form?: string
  /** Allow the mouse wheel to change the value while focused. */
  allowMouseWheel?: boolean
  /** Intl.NumberFormat options applied to the displayed value. */
  formatOptions?: Intl.NumberFormatOptions
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Accessible label for the decrement stepper. @default 'Decrease' */
  decrementLabel?: string
  /** Accessible label for the increment stepper. @default 'Increase' */
  incrementLabel?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint NumberInput. Ark UI NumberInput behavior (keyboard arrows, spin on
 * hold, clamping, formatting, ARIA spinbutton wiring) skinned with Imprint
 * tokens. The value sits centered with tabular figures between two divided
 * stepper triggers carrying lucide chevrons — 1:1 with the Imprint specimen.
 *
 * The ref forwards to the Ark root element.
 */
export const NumberInput = forwardRef<HTMLDivElement, NumberInputProps>(function NumberInput(
  { label, onValueChange, decrementLabel = 'Decrease', incrementLabel = 'Increase', className, ...rest },
  ref
) {
  return (
    <ArkNumberInput.Root
      ref={ref}
      className={className ? `${styles.root} ${className}` : styles.root}
      onValueChange={onValueChange}
      {...rest}
    >
      {label != null ? <ArkNumberInput.Label className={styles.label}>{label}</ArkNumberInput.Label> : null}
      <ArkNumberInput.Control className={styles.control}>
        <ArkNumberInput.DecrementTrigger className={styles.stepper} aria-label={decrementLabel}>
          <ChevronDown aria-hidden="true" />
        </ArkNumberInput.DecrementTrigger>
        <ArkNumberInput.Input className={styles.input} />
        <ArkNumberInput.IncrementTrigger className={styles.stepper} aria-label={incrementLabel}>
          <ChevronUp aria-hidden="true" />
        </ArkNumberInput.IncrementTrigger>
      </ArkNumberInput.Control>
    </ArkNumberInput.Root>
  )
})
