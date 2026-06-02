import { Field as ArkField } from '@ark-ui/react'
import { type LucideIcon, Search } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

import styles from './TextField.module.css'

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

  return (
    <ArkField.Root
      disabled={disabled}
      invalid={invalid}
      required={required}
      className={className ? `${styles.root} ${className}` : styles.root}
    >
      <ArkField.Label className={styles.label}>
        {label}
        {required ? (
          <ArkField.RequiredIndicator className={styles.requiredIndicator}>*</ArkField.RequiredIndicator>
        ) : null}
      </ArkField.Label>

      <div className={styles.control} data-variant={variant}>
        {LeadingIcon ? <LeadingIcon className={styles.icon} aria-hidden="true" /> : null}
        <ArkField.Input ref={ref} className={styles.input} {...inputProps} />
      </div>

      {invalid ? (
        <ArkField.ErrorText className={styles.error}>{error}</ArkField.ErrorText>
      ) : hint != null ? (
        <ArkField.HelperText className={styles.hint}>{hint}</ArkField.HelperText>
      ) : null}
    </ArkField.Root>
  )
})
