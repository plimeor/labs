import { RadioGroup as ArkRadioGroup, type RadioGroupValueChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot per Ark part. The ring control fills with an accent dot
// via an ::after pseudo-element (before:/after: variants), revealed when the
// control's data-state is "checked". The control's hover lift is driven by the
// enabled item's hover (descendant-state). Fixed control geometry stays exact px.
const radiogroup = tv({
  slots: {
    item: ['inline-flex items-center gap-2 cursor-pointer select-none', 'data-disabled:cursor-not-allowed'],
    itemText: ['leading-snug', 'group-[[data-disabled]]/item:text-disabled'],
    label: 'font-medium text-secondary',
    itemControl: [
      'box-border w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] border-border-strong',
      'inline-flex items-center justify-center bg-transparent',
      'transition-[border-color,background] duration-[var(--dur-fast)] ease-standard',
      "after:content-[''] after:w-[9px] after:h-[9px] after:rounded-full after:bg-accent",
      'after:scale-0 after:transition-transform after:duration-[var(--dur-fast)] after:ease-standard',
      'group-[:not([data-disabled]):hover]/item:border-accent',
      'data-[state=checked]:border-accent data-[state=checked]:after:scale-100',
      'data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus data-[focus-visible]:outline-offset-2',
      'group-[[data-disabled]]/item:border-border group-[[data-disabled]]/item:opacity-45'
    ],
    root: [
      'font-ui text-base text-body',
      'flex flex-col gap-3',
      'data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:flex-wrap',
      'data-[orientation=horizontal]:items-center data-[orientation=horizontal]:gap-5'
    ]
  }
})

const styles = radiogroup()

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
    <ArkRadioGroup.Root ref={ref} className={styles.root({ className })} {...rest}>
      {label != null ? <ArkRadioGroup.Label className={styles.label()}>{label}</ArkRadioGroup.Label> : null}
      {items.map(item => (
        <ArkRadioGroup.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={`group/item ${styles.item()}`}
        >
          <ArkRadioGroup.ItemControl className={styles.itemControl()} />
          <ArkRadioGroup.ItemText className={styles.itemText()}>{item.label}</ArkRadioGroup.ItemText>
          <ArkRadioGroup.ItemHiddenInput />
        </ArkRadioGroup.Item>
      ))}
    </ArkRadioGroup.Root>
  )
})
