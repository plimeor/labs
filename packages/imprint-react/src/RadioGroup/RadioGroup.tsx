import { RadioGroup as ArkRadioGroup, type RadioGroupValueChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'

import styles from './RadioGroup.module.css'

export type { RadioGroupValueChangeDetails }

export interface RadioGroupOption {
  /** Submitted value for this option. */
  value: string
  /** Visible label rendered next to the control. */
  label: ReactNode
  /** Disables just this option. */
  disabled?: boolean
}

export interface RadioGroupProps {
  /** The options rendered as radio items, top to bottom. */
  items: RadioGroupOption[]
  /** Controlled selected value. */
  value?: string | null
  /** Initial selected value for uncontrolled usage. */
  defaultValue?: string | null
  /** Fires when the selected value changes. */
  onValueChange?: (details: RadioGroupValueChangeDetails) => void
  /** Disables the whole group. */
  disabled?: boolean
  /** Marks the underlying inputs as required. */
  required?: boolean
  /** Makes the group read-only. */
  readOnly?: boolean
  /** Name of the underlying inputs, for form submission. */
  name?: string
  /** Id of the form the group belongs to. */
  form?: string
  /** Layout direction of the items. @default 'vertical' */
  orientation?: 'horizontal' | 'vertical'
  /** Optional group label, rendered above the items. */
  label?: ReactNode
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Extra className merged onto the root element. */
  className?: string
}

/**
 * Imprint RadioGroup. Ark UI RadioGroup behavior (roving focus, arrow-key
 * selection, single-choice semantics, ARIA wiring) skinned with Imprint tokens.
 * Each item renders a ring control that fills with an accent dot when selected.
 * Items expose Ark's `data-state` / `data-disabled` attributes for token styling.
 *
 * The ref forwards to the Ark root element.
 */
export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  { items, label, className, ...rest },
  ref
) {
  return (
    <ArkRadioGroup.Root ref={ref} className={className ? `${styles.root} ${className}` : styles.root} {...rest}>
      {label != null ? <ArkRadioGroup.Label className={styles.label}>{label}</ArkRadioGroup.Label> : null}
      {items.map(item => (
        <ArkRadioGroup.Item key={item.value} value={item.value} disabled={item.disabled} className={styles.item}>
          <ArkRadioGroup.ItemControl className={styles.itemControl} />
          <ArkRadioGroup.ItemText className={styles.itemText}>{item.label}</ArkRadioGroup.ItemText>
          <ArkRadioGroup.ItemHiddenInput />
        </ArkRadioGroup.Item>
      ))}
    </ArkRadioGroup.Root>
  )
})
