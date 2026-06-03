import { Checkbox as ArkCheckbox, type CheckboxCheckedChangeDetails, type CheckboxCheckedState } from '@ark-ui/react'
import { Check } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

export type { CheckboxCheckedChangeDetails, CheckboxCheckedState }

export interface CheckboxProps {
  /** Controlled checked state. Pass `'indeterminate'` for the mixed state. */
  checked?: CheckboxCheckedState
  /** Initial checked state for uncontrolled usage. Pass `'indeterminate'` for the mixed state. */
  defaultChecked?: CheckboxCheckedState
  /** Fires when the checked state changes. */
  onCheckedChange?: (details: CheckboxCheckedChangeDetails) => void
  /** Disables the checkbox. */
  disabled?: boolean
  /** Marks the underlying input as required. */
  required?: boolean
  /** Marks the control as invalid for assistive tech and form validation. */
  invalid?: boolean
  /** Name of the underlying input, for form submission. */
  name?: string
  /** Value of the underlying input, for form submission. */
  value?: string
  /** Id of the form the checkbox belongs to. */
  form?: string
  /** Optional id forwarded to the Ark root for composition. */
  id?: string
  /** Visible label rendered next to the control. */
  children?: ReactNode
  /** Extra className merged onto the root element. */
  className?: string
}

// One tv() with a slot per Ark part. The control's accent fill is bound to
// Ark's data-state (checked + indeterminate); the always-visible focus ring
// uses Ark's data-focus-visible. transition-colors covers both background and
// border-color, matching the source's two-property transition.
const checkbox = tv({
  slots: {
    bar: 'w-[8px] h-[2px] rounded-[1px] bg-on-accent',
    check: 'w-[12px] h-[12px] [stroke-width:2.4]',
    indeterminate: 'inline-flex items-center justify-center',
    indicator: 'inline-flex items-center justify-center',
    label: 'select-none',
    control: [
      'box-border w-[18px] h-[18px] shrink-0 inline-flex items-center justify-center',
      'rounded-[6px] border-[1.5px] border-border-strong bg-content text-on-accent',
      'transition-colors duration-[var(--dur-fast)] ease-standard',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
      'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
      'data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus data-[focus-visible]:outline-offset-2'
    ],
    root: [
      'font-ui text-base text-body',
      'inline-flex items-center gap-[9px] cursor-pointer',
      'data-disabled:cursor-not-allowed data-disabled:opacity-45'
    ]
  }
})

const styles = checkbox()

/**
 * Imprint Checkbox. Ark UI Checkbox behavior skinned with Imprint tokens.
 * Accent fill with a lucide check when checked, an accent bar when
 * indeterminate, and a muted disabled state — 1:1 with the Imprint specimen.
 * The control surfaces Ark's `data-state` / `data-disabled` attributes for
 * token-driven styling, and an always-visible 2px focus ring on keyboard focus.
 *
 * The ref forwards to the Ark root `<label>` element.
 */
export const Checkbox = forwardRef<HTMLLabelElement, CheckboxProps>(function Checkbox(
  { children, className, ...rest },
  ref
) {
  return (
    <ArkCheckbox.Root ref={ref} className={styles.root({ className })} {...rest}>
      <ArkCheckbox.Control className={styles.control()}>
        <ArkCheckbox.Indicator className={styles.indicator()}>
          <Check className={styles.check()} aria-hidden="true" />
        </ArkCheckbox.Indicator>
        <ArkCheckbox.Indicator className={styles.indeterminate()} indeterminate>
          <span className={styles.bar()} />
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      {children != null ? <ArkCheckbox.Label className={styles.label()}>{children}</ArkCheckbox.Label> : null}
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  )
})
