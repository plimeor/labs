import { Field as ArkField } from '@ark-ui/react'
import { type LucideIcon, Search } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'required'>

export interface TextFieldProps extends NativeInputProps {
  /** Visible field label. Wired to the input via Ark Field. */
  label: ReactNode
  /**
   * Visual treatment.
   * - `default` — a content-surface input with a hairline border.
   * - `search` — a sunken well with an inset shadow (the specimen search affordance).
   * @default 'default'
   */
  variant?: 'default' | 'search'
  /**
   * Optional leading icon (a lucide-react icon component). When `variant` is
   * `search`, a search icon is used automatically unless overridden here.
   */
  icon?: LucideIcon
  /** Helper / hint text rendered under the input. Hidden when an error is shown. */
  hint?: ReactNode
  /** Error message. Presence flips the field into the invalid state. */
  error?: ReactNode
  /** Marks the field disabled. */
  disabled?: boolean
  /** Marks the field required (renders an indicator next to the label). */
  required?: boolean
  /** Extra className merged onto the field root element. */
  className?: string
}

// One tv() with a slot per Ark part. The `search` affordance is a control-only
// variant (the old [data-variant="search"] rule). Invalid/disabled chrome lifts
// from the Ark Field root's data-invalid / data-disabled onto the descendant
// control via the [[data-…]_&] pattern, matching the original specificity order.
const textfield = tv({
  defaultVariants: { variant: 'default' },
  slots: {
    error: 'mt-1 text-xs leading-snug text-danger',
    hint: 'mt-1 text-xs leading-snug text-tertiary',
    icon: 'w-[15px] h-[15px] shrink-0 text-tertiary',
    requiredIndicator: 'text-danger',
    root: 'flex flex-col font-ui',
    control: [
      'flex items-center gap-2 box-border w-full py-2 px-3',
      'bg-content border border-border rounded-sm',
      'transition-[border-color,background] duration-[var(--dur-fast)] ease-standard',
      'focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2 focus-within:border-accent',
      '[[data-invalid]_&]:border-danger-border',
      '[[data-invalid]_&]:focus-within:outline-danger-solid',
      '[[data-disabled]_&]:bg-sunken [[data-disabled]_&]:border-border-subtle [[data-disabled]_&]:cursor-not-allowed'
    ],
    input: [
      'flex-[1_1_auto] min-w-0 m-0 p-0 border-none bg-transparent',
      'font-ui text-base leading-snug text-body outline-none',
      'placeholder:text-tertiary placeholder:opacity-100',
      'disabled:text-disabled disabled:cursor-not-allowed disabled:[-webkit-text-fill-color:var(--color-disabled)]'
    ],
    label: [
      'inline-flex items-center gap-1 mb-1',
      'text-sm leading-snug font-medium text-secondary',
      'data-disabled:text-disabled'
    ]
  },
  variants: {
    variant: {
      default: {},
      search: { control: 'bg-sunken shadow-inset' }
    }
  }
})

/**
 * Imprint TextField. Ark UI Field behavior (label/input association, invalid +
 * disabled wiring, `aria-describedby` for hint/error) skinned with Imprint
 * tokens. Supports an optional leading icon and a sunken `search` affordance,
 * 1:1 with the Imprint inputs specimen. The ref forwards to the input element.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, variant = 'default', icon: Icon, hint, error, disabled, required, className, ...inputProps },
  ref
) {
  const invalid = error != null && error !== false
  const LeadingIcon = Icon ?? (variant === 'search' ? Search : undefined)
  const styles = textfield({ variant })

  return (
    <ArkField.Root disabled={disabled} invalid={invalid} required={required} className={styles.root({ className })}>
      <ArkField.Label className={styles.label()}>
        {label}
        {required ? (
          <ArkField.RequiredIndicator className={styles.requiredIndicator()}>*</ArkField.RequiredIndicator>
        ) : null}
      </ArkField.Label>

      <div className={styles.control()} data-variant={variant}>
        {LeadingIcon ? <LeadingIcon className={styles.icon()} aria-hidden="true" /> : null}
        <ArkField.Input ref={ref} className={styles.input()} {...inputProps} />
      </div>

      {invalid ? (
        <ArkField.ErrorText className={styles.error()}>{error}</ArkField.ErrorText>
      ) : hint != null ? (
        <ArkField.HelperText className={styles.hint()}>{hint}</ArkField.HelperText>
      ) : null}
    </ArkField.Root>
  )
})
