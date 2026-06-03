/**
 * Button — Anchor's base action button.
 *
 * Part of src/components/ui, Anchor's own component layer (see ./README.md).
 * Renders HeroUI's Button with its default styling; the wrapper keeps Anchor's
 * `variant: 'primary' | 'secondary'` plus standard button attributes so callers
 * use a plain `<button>`-shaped API (className, onClick, type, disabled).
 *
 * HeroUI's Button is built on react-aria, which exposes `onPress` (pointer +
 * keyboard, normalized) and `isDisabled` rather than native `onClick`/`disabled`.
 * The wrapper maps those so the public API stays a plain button. Anchor's
 * callers use zero-argument `onClick` handlers, so `onPress` simply notifies
 * them; no synthetic mouse event is fabricated.
 */

import { Button as HeroButton } from '@heroui/react'
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({
  variant,
  className,
  type,
  disabled,
  onClick,
  children,
  id,
  style,
  'aria-label': ariaLabel
}: ButtonProps) {
  const notifyClick = onClick as ((event?: unknown) => void) | undefined

  return (
    <HeroButton
      aria-label={ariaLabel}
      className={className}
      id={id}
      isDisabled={disabled}
      style={style}
      type={type ?? 'button'}
      variant={variant ?? 'primary'}
      onPress={notifyClick ? () => notifyClick() : undefined}
    >
      {children}
    </HeroButton>
  )
}
