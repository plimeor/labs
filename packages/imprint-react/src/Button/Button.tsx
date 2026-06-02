import type { LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react'

import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style of the button. */
  variant?: ButtonVariant
  /** Size token. Currently a single size matching the specimen. */
  size?: ButtonSize
  /** Optional leading icon, passed as a lucide-react icon component. */
  icon?: LucideIcon
  children?: ReactNode
}

/**
 * Imprint Button. Native `<button>` element skinned with Imprint tokens.
 * Exposes the visual variant via `data-variant` for token-driven styling.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, type = 'button', className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      data-size={size}
      className={className ? `${styles.button} ${className}` : styles.button}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  )
})
