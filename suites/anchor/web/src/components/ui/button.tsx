/**
 * Button — Anchor's base action button.
 *
 * Part of src/components/ui, Anchor's own component layer (see ./README.md).
 * Simple controls like this are styled native elements driven by theme tokens;
 * complex interactive components (dialog, menu, popover, combobox, tooltip) are
 * built on @ark-ui/solid headless primitives. Replaces the former HeroUI Button.
 */

import { type JSX, splitProps } from 'solid-js'

export type ButtonVariant = 'primary' | 'secondary'

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'primary-action',
  secondary: 'secondary-action'
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'class', 'type'])
  const classes = [VARIANT_CLASS[local.variant ?? 'primary'], local.class].filter(Boolean).join(' ')
  return <button class={classes} type={local.type ?? 'button'} {...rest} />
}
