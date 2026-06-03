import type { LucideIcon } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

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

// Imprint tokens applied as inline Tailwind utilities, composed with
// tailwind-variants. Named utilities (bg-accent, rounded-sm, …) emit the same
// var(--token) the old CSS Module used; primitives/motion tokens use the
// arbitrary [var(--token)] form. Variant fills are plain utilities, so the
// disabled state (higher specificity) overrides them — no !important needed.
const button = tv({
  defaultVariants: { variant: 'primary' },
  base: [
    'inline-flex items-center gap-1 px-3 py-2',
    'font-ui text-base leading-none font-medium',
    'rounded-sm border border-transparent cursor-pointer',
    'transition-colors duration-[var(--dur-fast)] ease-standard',
    '[&>svg]:size-[15px] [&>svg]:shrink-0',
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
    'disabled:bg-[var(--warm-300)] disabled:text-disabled disabled:border-transparent disabled:cursor-not-allowed',
    'aria-disabled:bg-[var(--warm-300)] aria-disabled:text-disabled aria-disabled:border-transparent aria-disabled:cursor-not-allowed'
  ],
  variants: {
    variant: {
      danger: 'bg-danger-solid text-[var(--warm-0)] hover:bg-danger-hover active:bg-danger-hover',
      ghost: 'bg-transparent text-secondary hover:bg-hover active:bg-active',
      primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
      secondary: 'bg-raised text-body border-border hover:bg-hover active:bg-active'
    }
  }
})

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
      className={button({ variant, className })}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  )
})
