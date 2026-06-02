import { Switch as ArkSwitch, type SwitchCheckedChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'

import styles from './Switch.module.css'

export type { SwitchCheckedChangeDetails }

export interface SwitchProps {
  /** Controlled checked state. */
  checked?: boolean
  /** Initial checked state for uncontrolled usage. */
  defaultChecked?: boolean
  /** Fires when the checked state changes. */
  onCheckedChange?: (details: SwitchCheckedChangeDetails) => void
  /** Disables the switch. */
  disabled?: boolean
  /** Marks the underlying input as required. */
  required?: boolean
  /** Name of the underlying input, for form submission. */
  name?: string
  /** Value of the underlying input, for form submission. */
  value?: string | number
  /** Id of the form the switch belongs to. */
  form?: string
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Visible label rendered next to the control. */
  children?: ReactNode
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint Switch. Ark UI Switch behavior skinned with Imprint tokens.
 * Accent fill when on, smooth thumb travel, disabled state. The control
 * exposes Ark's `data-state` / `data-disabled` attributes for token styling.
 */
export const Switch = forwardRef<HTMLLabelElement, SwitchProps>(function Switch({ children, className, ...rest }, ref) {
  return (
    <ArkSwitch.Root ref={ref} className={className ? `${styles.root} ${className}` : styles.root} {...rest}>
      <ArkSwitch.Control className={styles.control}>
        <ArkSwitch.Thumb className={styles.thumb} />
      </ArkSwitch.Control>
      {children != null ? <ArkSwitch.Label className={styles.label}>{children}</ArkSwitch.Label> : null}
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  )
})
