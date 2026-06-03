import { Switch as ArkSwitch, type SwitchCheckedChangeDetails } from '@ark-ui/react'
import { forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// One tv() with a slot per Ark part. Named utilities (text-body, bg-accent,
// rounded-full, shadow-1, …) emit the same var(--token) the old CSS Module used;
// primitives/motion tokens and fixed px use the arbitrary [var(--token)]/[Npx]
// form. The track fills via data-state; the thumb travels on data-state; the
// focus ring surfaces on the control via Ark's data-focus-visible.
const switchVariants = tv({
  slots: {
    label: 'select-none',
    control: [
      'box-border w-[38px] h-[22px] shrink-0 p-[2px]',
      'inline-flex items-center rounded-full bg-[var(--warm-300)]',
      'transition-colors duration-[var(--dur-base)] ease-standard',
      'data-[state=checked]:bg-accent',
      'data-disabled:opacity-45',
      'data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus data-[focus-visible]:outline-offset-2'
    ],
    root: [
      'font-ui text-base text-body',
      'inline-flex items-center gap-[9px] cursor-pointer',
      'data-disabled:cursor-not-allowed'
    ],
    thumb: [
      'w-[18px] h-[18px] rounded-full bg-[var(--warm-0)] shadow-1',
      'translate-x-0 transition-transform duration-[var(--dur-base)] ease-standard',
      'data-[state=checked]:translate-x-[16px]'
    ]
  }
})

const styles = switchVariants()

/**
 * Imprint Switch. Ark UI Switch behavior skinned with Imprint tokens.
 * Accent fill when on, smooth thumb travel, disabled state. The control
 * exposes Ark's `data-state` / `data-disabled` attributes for token styling.
 */
export const Switch = forwardRef<HTMLLabelElement, SwitchProps>(function Switch({ children, className, ...rest }, ref) {
  return (
    <ArkSwitch.Root ref={ref} className={styles.root({ className })} {...rest}>
      <ArkSwitch.Control className={styles.control()}>
        <ArkSwitch.Thumb className={styles.thumb()} />
      </ArkSwitch.Control>
      {children != null ? <ArkSwitch.Label className={styles.label()}>{children}</ArkSwitch.Label> : null}
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  )
})
