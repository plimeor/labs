import { NumberInput as ArkNumberInput, type NumberInputValueChangeDetails } from '@ark-ui/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot per Ark part. Named utilities (bg-content, rounded-sm, …)
// emit the same var(--token) the old CSS Module used; font-size uses the
// length-hinted arbitrary form; primitives/motion tokens use [var(--token)].
// The focus ring surfaces on the control via focus-within; invalid/disabled
// states map from Ark's data-invalid/data-disabled attributes.
const numberinput = tv({
  slots: {
    label: 'font-mono text-xs leading-snug text-tertiary mb-2',
    root: 'inline-flex flex-col font-ui',
    control: [
      'flex items-stretch border border-border rounded-sm bg-content overflow-hidden',
      'transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-standard',
      'focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2',
      'data-[invalid]:border-danger-border',
      'data-disabled:opacity-55 data-disabled:cursor-not-allowed'
    ],
    input: [
      'flex-1 min-w-0 w-full border-none outline-none bg-transparent text-center',
      'font-ui text-base leading-normal text-ink tabular-nums',
      'py-2 px-1',
      'placeholder:text-tertiary',
      'disabled:cursor-not-allowed disabled:text-disabled'
    ],
    stepper: [
      'inline-flex items-center justify-center shrink-0 py-2 px-3',
      'border-0 bg-transparent text-secondary cursor-pointer',
      'transition-[background-color,color] duration-[var(--dur-fast)] ease-standard',
      'first-of-type:border-r first-of-type:border-r-border-subtle',
      'last-of-type:border-l last-of-type:border-l-border-subtle',
      '[&>svg]:w-[16px] [&>svg]:h-[16px] [&>svg]:shrink-0',
      'hover:bg-hover hover:text-ink',
      'active:bg-active',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2',
      'disabled:cursor-not-allowed disabled:text-disabled',
      'data-disabled:cursor-not-allowed data-disabled:text-disabled'
    ]
  }
})

const styles = numberinput()

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
    <ArkNumberInput.Root ref={ref} className={styles.root({ className })} onValueChange={onValueChange} {...rest}>
      {label != null ? <ArkNumberInput.Label className={styles.label()}>{label}</ArkNumberInput.Label> : null}
      <ArkNumberInput.Control className={styles.control()}>
        <ArkNumberInput.DecrementTrigger className={styles.stepper()} aria-label={decrementLabel}>
          <ChevronDown aria-hidden="true" />
        </ArkNumberInput.DecrementTrigger>
        <ArkNumberInput.Input className={styles.input()} />
        <ArkNumberInput.IncrementTrigger className={styles.stepper()} aria-label={incrementLabel}>
          <ChevronUp aria-hidden="true" />
        </ArkNumberInput.IncrementTrigger>
      </ArkNumberInput.Control>
    </ArkNumberInput.Root>
  )
})
