/**
 * Button — Anchor's base action button.
 *
 * Part of src/components/ui, Anchor's own component layer (see ./README.md).
 * Simple controls like this are styled native elements driven by theme tokens;
 * complex interactive components (dialog, menu, popover, combobox, tooltip) are
 * built on @ark-ui/react headless primitives. Replaces the former HeroUI Button.
 */

import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'primary-action',
  secondary: 'secondary-action'
}

export function Button({ variant, className, type, ...rest }: ButtonProps) {
  const classes = [VARIANT_CLASS[variant ?? 'primary'], className].filter(Boolean).join(' ')
  return <button className={classes} type={type ?? 'button'} {...rest} />
}
